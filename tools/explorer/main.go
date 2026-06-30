package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

var allDirs = []string{"n", "s", "e", "w", "ne", "nw", "se", "sw", "u", "d"}

type RoomEntry struct {
	GameID      string `json:"gameId"`
	RoomID      int    `json:"roomId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Skip        bool   `json:"skip,omitempty"`
}

type walkthroughCommand struct {
	Step        int
	Command     string
	SectionName string
	SectionRoom string
	TargetRoom  string
}

type Explorer struct {
	sess             *frotz.Session
	gameID           string
	rooms            map[int]bool
	ordered          []*RoomEntry
	tried            map[int]map[string]bool // roomID → dir → already tried
	saves            map[int]string          // roomID → save file path
	saveDir          string
	outPath          string
	traceWalkthrough bool
}

func newExplorer(outPath, saveDir, gameID string, sess *frotz.Session) *Explorer {
	return &Explorer{
		sess:    sess,
		gameID:  gameID,
		rooms:   make(map[int]bool),
		tried:   make(map[int]map[string]bool),
		saves:   make(map[int]string),
		saveDir: saveDir,
		outPath: outPath,
	}
}

func readGameID(story string) (string, error) {
	f, err := os.Open(story)
	if err != nil {
		return "", err
	}
	defer f.Close()
	hdr := make([]byte, 24)
	if _, err := io.ReadFull(f, hdr); err != nil {
		return "", err
	}
	release := int(hdr[2])<<8 | int(hdr[3])
	serial := strings.TrimRight(string(hdr[18:24]), "\x00")
	return fmt.Sprintf("%d.%s", release, serial), nil
}

// trimToTitle strips any text that precedes the room title line in a description.
// Frotz sometimes prepends event text (death messages, sound effects, game banners)
// before the actual room output. The title always appears as its own line at the
// start of the real room text, so we find it and discard everything before it.
func trimToTitle(title, description string) string {
	for i, line := range strings.Split(description, "\n") {
		if strings.TrimSpace(line) == title {
			return strings.TrimSpace(strings.Join(strings.Split(description, "\n")[i:], "\n"))
		}
	}
	return description
}

func (e *Explorer) addRoom(r *frotz.Room) bool {
	if r.ID == 0 {
		for _, entry := range e.ordered {
			if entry.Title == r.Title {
				return false
			}
		}
	} else if e.rooms[r.ID] {
		return false
	}
	e.rooms[r.ID] = true
	e.ordered = append(e.ordered, &RoomEntry{
		GameID:      e.gameID,
		RoomID:      r.ID,
		Title:       r.Title,
		Description: trimToTitle(r.Title, r.Description),
	})
	e.writeJSON()
	return true
}

func sameRoom(a, b *frotz.Room) bool {
	if a.ID != 0 && b.ID != 0 {
		return a.ID == b.ID
	}
	return a.Title == b.Title
}

func (e *Explorer) triedAll(roomID int) bool {
	for _, d := range allDirs {
		if !e.tried[roomID][d] {
			return false
		}
	}
	return true
}

func explorationActions(room *frotz.Room) []string {
	actions := append([]string{}, allDirs...)
	actions = append(actions, contextualActions(room)...)
	return actions
}

func contextualActions(room *frotz.Room) []string {
	text := strings.ToLower(room.Title + "\n" + room.Description)
	var actions []string
	add := func(action string) {
		for _, existing := range actions {
			if existing == action {
				return
			}
		}
		actions = append(actions, action)
	}

	if strings.Contains(text, "window") {
		add("enter window")
	}
	if strings.Contains(text, "house") && (strings.Contains(text, "open window") || room.Title == "Behind House") {
		add("enter house")
	}
	if strings.Contains(text, "gazebo") {
		add("enter gazebo")
	}
	if room.Title == "Gazebo" || strings.Contains(text, "inside the gazebo") {
		add("out")
	}
	if strings.Contains(text, "tree") && room.Title != "Up a Tree" {
		add("climb tree")
	}
	if strings.Contains(text, "rainbow") {
		add("cross rainbow")
	}
	if strings.Contains(text, "boat") {
		add("enter boat")
		add("leave boat")
		if strings.Contains(text, "in the boat") || strings.Contains(text, "inside the boat") || strings.Contains(text, "you are on") {
			add("launch")
		}
	}
	if strings.Contains(text, "basket") {
		add("enter basket")
		add("out")
	}
	if strings.Contains(text, "bucket") {
		add("enter bucket")
		add("out")
	}
	if strings.Contains(text, "grate") {
		add("enter grate")
	}
	if strings.Contains(text, "chimney") {
		add("go up chimney")
	}
	if strings.Contains(text, "stairs") || strings.Contains(text, "stairway") || strings.Contains(text, "staircase") {
		add("climb stairs")
	}
	return actions
}

// saveGame sends the save command, waits until dfrotz explicitly asks for a
// filename, then sends the save path. This prevents save paths from leaking
// into the command stream when the game rejects save for story-state reasons.
func (e *Explorer) saveGame(room *frotz.Room) (*frotz.Room, string, error) {
	if room.ID == 0 {
		return nil, "", fmt.Errorf("cannot save room with id 0 (%s)", room.Title)
	}
	if !canSave(room) {
		return nil, "", fmt.Errorf("cannot save while incapacitated at %s [id=%d]", room.Title, room.ID)
	}
	path := filepath.Join(e.saveDir, fmt.Sprintf("%d.sav", room.ID))
	if err := e.sess.Send("save"); err != nil {
		return nil, "", err
	}
	rejectedRoom, needsFile, err := e.sess.NextOrFileRequest()
	if err != nil {
		return nil, "", fmt.Errorf("saveGame room %d: %w", room.ID, err)
	}
	if !needsFile {
		if rejectedRoom != nil {
			return rejectedRoom, "", fmt.Errorf("save command rejected at %s [id=%d]", rejectedRoom.Title, rejectedRoom.ID)
		}
		return nil, "", fmt.Errorf("save command rejected at %s [id=%d]", room.Title, room.ID)
	}
	if err := e.sess.Send(path); err != nil {
		return nil, "", err
	}
	// Consume the room marker emitted by os_read_line after save completes.
	if _, err := e.sess.Next(); err != nil {
		return nil, "", fmt.Errorf("saveGame room %d: %w", room.ID, err)
	}

	restored, err := e.restoreGame(path)
	if err != nil {
		return nil, "", fmt.Errorf("verify save room %d: %w", room.ID, err)
	}
	if restored.ID != 0 && restored.ID != room.ID {
		return restored, "", fmt.Errorf("verify save room %d restored %s [id=%d]", room.ID, restored.Title, restored.ID)
	}
	e.saves[room.ID] = path
	return restored, path, nil
}

func canSave(room *frotz.Room) bool {
	return !isIncapacitated(room) && !isDeathPrompt(room) && !isRiddlePrompt(room)
}

func isIncapacitated(room *frotz.Room) bool {
	return isFrozen(room) || isFloating(room)
}

func isFrozen(room *frotz.Room) bool {
	text := strings.ToLower(room.Description)
	return strings.Contains(text, "frozen solid") ||
		strings.Contains(text, "can't move a muscle")
}

func isFloating(room *frotz.Room) bool {
	text := strings.ToLower(room.Description)
	return strings.Contains(text, "word \"float") ||
		strings.Contains(text, "flapping your arms")
}

func isFearSpell(room *frotz.Room) bool {
	text := strings.ToLower(room.Description)
	return strings.Contains(text, "word \"fear") &&
		strings.Contains(text, "scramble away")
}

func isDeathPrompt(room *frotz.Room) bool {
	text := strings.ToLower(room.Description)
	return strings.Contains(text, "would you like to restart the game") ||
		strings.Contains(text, "type restart, restore, or quit") ||
		strings.Contains(text, "this score gives you the rank")
}

func isRiddlePrompt(room *frotz.Room) bool {
	text := strings.ToLower(room.Description)
	return room.Title == "Riddle Room" &&
		strings.HasPrefix(text, "what is tall as a house") &&
		strings.Contains(text, "can't draw it up")
}

func (e *Explorer) waitUntilCanAct(room *frotz.Room) (*frotz.Room, error) {
	waitForLanding := isFloating(room)
	for i := 0; i < 12; i++ {
		if err := e.sess.Send("wait"); err != nil {
			return room, err
		}
		next, err := e.sess.Next()
		if err != nil {
			return room, err
		}
		room = next
		if waitForLanding && strings.Contains(strings.ToLower(room.Description), "sink quietly down again") {
			return room, nil
		}
		if !waitForLanding && !isIncapacitated(room) && i >= 2 {
			return room, nil
		}
	}
	if isIncapacitated(room) {
		return room, fmt.Errorf("still incapacitated at %s [id=%d]", room.Title, room.ID)
	}
	return room, nil
}

// restoreGame loads a save file. It waits for dfrotz's filename request before
// sending the path, then reads the restored room marker.
func (e *Explorer) restoreGame(path string) (*frotz.Room, error) {
	if path == "" {
		return nil, fmt.Errorf("restore missing save path")
	}
	var lastRoom *frotz.Room
	recoveringFromFreeze := false
	for attempt := 0; attempt < 12; attempt++ {
		if err := e.sess.Send("restore"); err != nil {
			return nil, err
		}
		rejectedRoom, needsFile, err := e.sess.NextOrFileRequest()
		if err != nil {
			return nil, err
		}
		if needsFile {
			if err := e.sess.Send(path); err != nil {
				return nil, err
			}
			return e.sess.Next()
		}
		if rejectedRoom != nil {
			lastRoom = rejectedRoom
			if isIncapacitated(rejectedRoom) || recoveringFromFreeze {
				recoveringFromFreeze = true
				if _, err := e.waitUntilCanAct(rejectedRoom); err != nil {
					return rejectedRoom, fmt.Errorf("restore command rejected at %s [id=%d]: %w", rejectedRoom.Title, rejectedRoom.ID, err)
				}
				continue
			}
			return rejectedRoom, fmt.Errorf("restore command rejected at %s [id=%d]", rejectedRoom.Title, rejectedRoom.ID)
		}
	}
	if lastRoom != nil {
		return lastRoom, fmt.Errorf("restore command rejected at %s [id=%d]", lastRoom.Title, lastRoom.ID)
	}
	return nil, fmt.Errorf("restore command rejected")
}

// dfs tries every untried direction from room, recursing into new rooms and
// restoring to the current save point after each attempt.
func (e *Explorer) dfs(room *frotz.Room, savePath string, depth int) error {
	if savePath == "" {
		return fmt.Errorf("DFS at %s [id=%d] has no save path", room.Title, room.ID)
	}
	if depth > 200 {
		log.Printf("DFS depth limit at %s [id=%d]", room.Title, room.ID)
		return nil
	}

	for _, dir := range explorationActions(room) {
		// room.ID can change after a restore mid-loop; initialize lazily here.
		if e.tried[room.ID] == nil {
			e.tried[room.ID] = make(map[string]bool)
		}
		if e.tried[room.ID][dir] {
			continue
		}
		e.tried[room.ID][dir] = true

		if err := e.sess.Send(dir); err != nil {
			return fmt.Errorf("DFS send %q from %s [id=%d]: %w", dir, room.Title, room.ID, err)
		}
		next, err := e.sess.Next()
		if err != nil {
			return fmt.Errorf("DFS read after %q from %s [id=%d]: %w", dir, room.Title, room.ID, err)
		}

		if sameRoom(next, room) {
			// Direction blocked. Restore to clean save state before the next attempt
			// so any in-room state changes (combat, lamp timer, etc.) don't accumulate.
			restored, rerr := e.restoreGame(savePath)
			if rerr != nil {
				return fmt.Errorf("DFS restore after blocked %q from %s [id=%d]: %w", dir, room.Title, room.ID, rerr)
			}
			room = restored
			continue
		}

		isNew := e.addRoom(next)
		if isNew {
			log.Printf("[%d rooms] NEW: %s [id=%d] (depth %d, %q from %s)",
				len(e.ordered), next.Title, next.ID, depth+1, dir, room.Title)
		}

		if next.ID == 0 {
			// Can't save/restore rooms without an ID; skip recursion.
			restored, rerr := e.restoreGame(savePath)
			if rerr != nil {
				return fmt.Errorf("DFS restore after id=0 room from %s [id=%d]: %w", room.Title, room.ID, rerr)
			}
			room = restored
			continue
		}

		// Ensure a save point exists for next before recursing.
		nextSave, hasSave := e.saves[next.ID]
		if !hasSave {
			var serr error
			attempted := next
			savedRoom, savedPath, serr := e.saveGame(attempted)
			if serr != nil {
				log.Printf("DFS save error at %s: %v — skipping subtree", attempted.Title, serr)
				restored, rerr := e.restoreGame(savePath)
				if rerr != nil {
					return fmt.Errorf("DFS restore after save failure at %s [id=%d]: %w", attempted.Title, attempted.ID, rerr)
				}
				room = restored
				continue
			}
			next = savedRoom
			nextSave = savedPath
		}

		// Recurse if next still has untried directions.
		if !e.triedAll(next.ID) {
			if err := e.dfs(next, nextSave, depth+1); err != nil {
				return err
			}
		}

		// Restore back to the current room.
		restored, rerr := e.restoreGame(savePath)
		if rerr != nil {
			return fmt.Errorf("DFS restore returning to %s [id=%d]: %w", room.Title, room.ID, rerr)
		}
		room = restored
	}
	return nil
}

// runWalkthrough replays a command file, saving game state at each newly
// discovered room so the DFS phase can start from any of them.
func (e *Explorer) runWalkthrough(path string) (*frotz.Room, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", fmt.Errorf("open walkthrough: %w", err)
	}
	defer f.Close()

	current, err := e.sess.Next()
	if err != nil {
		return nil, "", err
	}
	e.addRoom(current)
	log.Printf("start: %s [id=%d]", current.Title, current.ID)

	var currentSave string
	if restored, sp, serr := e.saveGame(current); serr == nil {
		current = restored
		currentSave = sp
	}

	commands, err := parseWalkthrough(f)
	if err != nil {
		return nil, "", err
	}

	reportedSectionMismatch := false
	lastSectionName := ""
	for _, wt := range commands {
		if wt.SectionName != lastSectionName {
			reportedSectionMismatch = false
			if e.traceWalkthrough {
				log.Printf("walkthrough section: %s (current %s [id=%d])", wt.SectionName, current.Title, current.ID)
			}
			lastSectionName = wt.SectionName
		}

		before := current
		if e.traceWalkthrough && wt.SectionRoom != "" && !roomTitleMatchesSection(current.Title, wt.SectionRoom) && !reportedSectionMismatch {
			log.Printf("walkthrough mismatch before step %d in section %q: expected %q, at %s [id=%d], next command %q",
				wt.Step, wt.SectionName, wt.SectionRoom, current.Title, current.ID, wt.Command)
			reportedSectionMismatch = true
		}

		next, err := e.walkthroughStep(wt.Command, wt.TargetRoom, currentSave)
		if err != nil {
			log.Printf("walkthrough ended at step %d: %v", wt.Step, err)
			return current, currentSave, nil
		}
		next, err = e.recoverDroppedObjects(next)
		if err != nil {
			log.Printf("walkthrough dropped-object recovery failed at step %d: %v", wt.Step, err)
		}
		if isIncapacitated(next) {
			if waited, werr := e.waitUntilCanAct(next); werr == nil {
				next = waited
			} else {
				log.Printf("walkthrough wait after incapacitated state at step %d: %v", wt.Step, werr)
			}
		}
		if e.traceWalkthrough {
			log.Printf("walkthrough step %d: %q | %s [id=%d] -> %s [id=%d]",
				wt.Step, wt.Command, before.Title, before.ID, next.Title, next.ID)
		}

		if !sameRoom(next, current) {
			isNew := e.addRoom(next)
			if isNew {
				log.Printf("[%d rooms] walkthrough: %s [id=%d]", len(e.ordered), next.Title, next.ID)
			}
			current = next
		}

		// Always overwrite the save for the current room so later walkthrough
		// steps (e.g. post-troll Troll Room) replace earlier pre-event saves.
		if current.ID != 0 {
			if restored, sp, serr := e.saveGame(current); serr == nil {
				current = restored
				currentSave = sp
			} else {
				log.Printf("walkthrough save skipped at step %d (%s [id=%d]): %v", wt.Step, current.Title, current.ID, serr)
				if (isIncapacitated(current) || isDeathPrompt(current)) && currentSave != "" {
					if restored, rerr := e.restoreGame(currentSave); rerr == nil {
						current = restored
					} else {
						log.Printf("walkthrough restore after unsavable state at step %d: %v", wt.Step, rerr)
					}
				}
			}
		}
	}
	log.Printf("walkthrough done (%d commands, %d rooms, %d saves)", len(commands), len(e.ordered), len(e.saves))
	return current, currentSave, nil
}

func (e *Explorer) recoverDroppedObjects(room *frotz.Room) (*frotz.Room, error) {
	objects := droppedObjects(room.Description)
	for _, object := range objects {
		if err := e.sess.Send("take " + object); err != nil {
			return room, err
		}
		next, err := e.sess.Next()
		if err != nil {
			return room, err
		}
		room = next
	}
	return room, nil
}

func droppedObjects(description string) []string {
	var objects []string
	for _, line := range strings.Split(description, "\n") {
		text := strings.TrimSpace(line)
		lower := strings.ToLower(text)
		const prefix = "ooops! you dropped the "
		if !strings.HasPrefix(lower, prefix) {
			continue
		}
		object := strings.TrimSpace(text[len(prefix):])
		object = strings.TrimSuffix(object, ".")
		if object != "" {
			objects = append(objects, object)
		}
	}
	return objects
}

func parseWalkthrough(r io.Reader) ([]walkthroughCommand, error) {
	scanner := bufio.NewScanner(r)
	var commands []walkthroughCommand
	var sectionName string
	var sectionRoom string
	var explicitTarget string
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "#" {
			continue
		}
		if strings.HasPrefix(line, "# ") {
			line = strings.TrimSpace(line[2:])
		} else if strings.HasPrefix(line, "#") {
			line = strings.TrimSpace(line[1:])
		}
		if line == "" {
			continue
		}
		if isWalkthroughSection(line) {
			sectionName = walkthroughSectionName(line)
			sectionRoom = walkthroughSectionRoom(line)
			explicitTarget = walkthroughSectionTarget(line)
			continue
		}
		command := normalizeWalkthroughCommand(line)
		if !looksLikeWalkthroughCommand(command) {
			continue
		}
		commands = append(commands, walkthroughCommand{
			Step:        len(commands) + 1,
			Command:     command,
			SectionName: sectionName,
			SectionRoom: sectionRoom,
			TargetRoom:  explicitTarget,
		})
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	commands = repairDingyCloset(commands)
	commands = repairTopOfWell(commands)
	for i := range commands {
		if commands[i].TargetRoom != "" || !isMovementCommand(commands[i].Command) {
			continue
		}
		nextSection := nextSectionRoom(commands, i)
		if nextSection == "" || nextSection == commands[i].SectionRoom {
			continue
		}
		if isLastCommandInSection(commands, i) {
			commands[i].TargetRoom = nextSection
		}
	}
	return commands, nil
}

func looksLikeWalkthroughCommand(command string) bool {
	command = strings.TrimSpace(strings.ToLower(command))
	if command == "" {
		return false
	}
	if isMovementCommand(command) {
		return true
	}
	if strings.HasPrefix(command, "go ") ||
		strings.HasPrefix(command, "walk through ") ||
		strings.HasPrefix(command, "robot, ") ||
		strings.HasPrefix(command, "demon, ") {
		return true
	}
	if strings.Contains(command, ",") {
		return false
	}
	if command == "land" || command == "stand" {
		return true
	}
	verb := command
	if i := strings.IndexAny(verb, " \t"); i >= 0 {
		verb = verb[:i]
	}
	switch verb {
	case "answer", "apply", "attack", "burn", "chant", "climb", "close", "cross",
		"dig", "drop", "eat", "echo", "enter", "examine", "fill", "get", "give",
		"inflate", "inventory", "kill", "kiss", "launch", "leave", "light", "look",
		"lower", "move", "open", "point", "pour", "pray", "push", "put", "raise",
		"read", "remove", "ring", "rub", "say", "stand", "take", "tell", "throw",
		"tie", "turn", "unlock", "untie", "ulysses", "wait", "wave", "wind":
		return true
	}
	return false
}

func repairTopOfWell(commands []walkthroughCommand) []walkthroughCommand {
	var repaired []walkthroughCommand
	for i := 0; i < len(commands); i++ {
		wt := commands[i]
		if wt.SectionRoom == "Top of Well" &&
			wt.Command == "enter bucket" &&
			i+1 < len(commands) &&
			isFillTeapotFromBucketCommand(commands[i+1].Command) {
			take := wt
			take.Command = "take teapot"
			enter := wt
			fill := commands[i+1]
			fill.Command = "fill teapot"
			repaired = append(repaired, take, enter, fill)
			i++
			continue
		}
		if isFillTeapotFromBucketCommand(wt.Command) {
			wt.Command = "fill teapot"
		}
		repaired = append(repaired, wt)
	}
	for i := range repaired {
		repaired[i].Step = i + 1
	}
	return repaired
}

func isFillTeapotFromBucketCommand(command string) bool {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "fill teapot from bucket", "fill teapot with water from bucket":
		return true
	}
	return false
}

func repairDingyCloset(commands []walkthroughCommand) []walkthroughCommand {
	var repaired []walkthroughCommand
	for i := 0; i < len(commands); i++ {
		wt := commands[i]
		if wt.SectionRoom == "Dingy Closet" &&
			wt.Command == "robot, lift cage" &&
			i+1 < len(commands) &&
			isTakeSphereCommand(commands[i+1].Command) {
			trigger := wt
			trigger.Command = "take red sphere"
			lift := wt
			take := commands[i+1]
			take.Command = "take red sphere"
			repaired = append(repaired, trigger, lift, take)
			i++
			continue
		}
		if isTakeSphereCommand(wt.Command) {
			wt.Command = "take red sphere"
		}
		repaired = append(repaired, wt)
	}
	for i := range repaired {
		repaired[i].Step = i + 1
	}
	return repaired
}

func isTakeSphereCommand(command string) bool {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "get sphere", "take sphere", "get red sphere", "take red sphere":
		return true
	}
	return false
}

func nextSectionRoom(commands []walkthroughCommand, i int) string {
	for j := i + 1; j < len(commands); j++ {
		if commands[j].SectionName != commands[i].SectionName {
			return commands[j].SectionRoom
		}
	}
	return ""
}

func isLastCommandInSection(commands []walkthroughCommand, i int) bool {
	return i+1 >= len(commands) || commands[i+1].SectionName != commands[i].SectionName
}

func isMovementCommand(command string) bool {
	command = strings.TrimSpace(strings.ToLower(command))
	command = strings.TrimPrefix(command, "go ")
	for _, dir := range allDirs {
		if command == dir || command == longDirection(dir) {
			return true
		}
	}
	return false
}

func longDirection(dir string) string {
	switch dir {
	case "n":
		return "north"
	case "s":
		return "south"
	case "e":
		return "east"
	case "w":
		return "west"
	case "u":
		return "up"
	case "d":
		return "down"
	case "ne":
		return "northeast"
	case "nw":
		return "northwest"
	case "se":
		return "southeast"
	case "sw":
		return "southwest"
	}
	return dir
}

func (e *Explorer) walkthroughStep(command, targetRoom, savePath string) (*frotz.Room, error) {
	if targetRoom == "" || savePath == "" {
		next, err := e.sendAndRead(command)
		if err != nil {
			return nil, err
		}
		for retries := 0; savePath != "" && isFearSpell(next) && retries < 4; retries++ {
			log.Printf("walkthrough retry after Wizard Fear during %q", command)
			if _, err := e.restoreGame(savePath); err != nil {
				return nil, fmt.Errorf("restore after Wizard Fear during %q: %w", command, err)
			}
			next, err = e.sendAndRead(command)
			if err != nil {
				return nil, err
			}
		}
		return next, nil
	}

	seen := make(map[string]bool)
	candidates := append([]string{command}, allDirs...)
	first := true
	for waits := 0; waits <= 12; waits++ {
		for _, candidate := range candidates {
			key := fmt.Sprintf("%d:%s", waits, candidate)
			if seen[key] {
				continue
			}
			seen[key] = true
			if first {
				first = false
			} else if _, err := e.restoreGame(savePath); err != nil {
				return nil, fmt.Errorf("restore while seeking %s: %w", targetRoom, err)
			}
			for i := 0; i < waits; i++ {
				if _, err := e.sendAndRead("wait"); err != nil {
					return nil, err
				}
			}
			next, err := e.sendAndRead(candidate)
			if err != nil {
				return nil, err
			}
			if next.Title == targetRoom {
				if candidate != command || waits > 0 {
					log.Printf("walkthrough target %s reached with %d wait(s) then %q instead of %q", targetRoom, waits, candidate, command)
				}
				return next, nil
			}
		}
	}
	return nil, fmt.Errorf("could not reach walkthrough target %s with %q or compass exits", targetRoom, command)
}

func (e *Explorer) sendAndRead(command string) (*frotz.Room, error) {
	if err := e.sess.Send(command); err != nil {
		return nil, err
	}
	return e.sess.Next()
}

func isWalkthroughSection(line string) bool {
	return strings.HasPrefix(line, "----") && strings.HasSuffix(line, "----")
}

func walkthroughSectionName(line string) string {
	return strings.TrimSpace(strings.Trim(line, "-"))
}

func walkthroughSectionRoom(line string) string {
	name := walkthroughSectionName(line)
	if strings.HasPrefix(name, "Gazebo ") {
		return ""
	}
	if strings.Contains(name, "->") {
		parts := strings.Split(name, "->")
		name = strings.TrimSpace(parts[0])
	}
	if i := strings.Index(name, "("); i >= 0 {
		name = strings.TrimSpace(name[:i])
	}
	switch {
	case name == "":
		return ""
	case strings.Contains(name, "Area"):
		return ""
	case strings.Contains(name, "section"):
		return ""
	case strings.Contains(name, "Rooms"):
		return ""
	case strings.HasPrefix(name, "Gazebo "):
		return "Gazebo"
	case strings.HasPrefix(name, "Guarded Room "):
		return "Guarded Room"
	case name == "Teller's Room":
		return ""
	case name == "Robot section":
		return ""
	case name == "Volcano":
		return ""
	}
	return name
}

func roomTitleMatchesSection(title, section string) bool {
	if title == section {
		return true
	}
	if section == "Ice Room" && title == "Dragon Room" {
		return true
	}
	return false
}

func walkthroughSectionTarget(line string) string {
	inner := strings.TrimSpace(strings.Trim(line, "-"))
	parts := strings.Split(inner, "->")
	if len(parts) < 2 {
		return ""
	}
	target := strings.TrimSpace(parts[len(parts)-1])
	if i := strings.Index(target, "("); i >= 0 {
		target = strings.TrimSpace(target[:i])
	}
	return target
}

func normalizeWalkthroughCommand(line string) string {
	switch strings.ToLower(line) {
	case "burn newspaper":
		return "burn newspaper with match"
	case "burn string":
		return "burn string with match"
	case "answer well", "answer \"well\"", "say a well", "say well", "say \"well\"":
		return "answer \"well\""
	case "open keyhole lid":
		return "open lid"
	case "point wand at menhir":
		return "wave wand at menhir"
	case "tell robot go east":
		return "robot, go east"
	case "tell robot go south":
		return "robot, go south"
	case "tell robot go north":
		return "robot, go north"
	case "tell robot push triangle":
		return "robot, push triangular button"
	case "tell robot lift cage":
		return "robot, lift cage"
	case "leave gazebo":
		return "out"
	}
	return line
}

func (e *Explorer) writeJSON() {
	b, _ := json.MarshalIndent(e.ordered, "", "  ")
	if err := os.WriteFile(e.outPath, b, 0644); err != nil {
		log.Printf("write json: %v", err)
	}
}

// resetForRun replaces the session and clears per-run state (tried directions)
// while keeping the accumulated rooms from previous runs. Save files are tied to
// the exact state reached in one run, so loop mode rebuilds that frontier every
// time instead of carrying stale saves across randomized walkthrough paths.
func (e *Explorer) resetForRun(sess *frotz.Session) {
	e.sess = sess
	e.tried = make(map[int]map[string]bool)
	e.saves = make(map[int]string)
}

// loadJSON pre-populates e.ordered and e.rooms from an existing bfs.json so
// that descriptions captured in previous sessions are never overwritten.
func (e *Explorer) loadJSON() {
	data, err := os.ReadFile(e.outPath)
	if err != nil {
		return
	}
	var entries []*RoomEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return
	}
	for _, entry := range entries {
		if e.rooms[entry.RoomID] {
			continue
		}
		e.rooms[entry.RoomID] = true
		e.ordered = append(e.ordered, entry)
	}
	if len(entries) > 0 {
		log.Printf("loaded %d prior rooms from %s", len(entries), e.outPath)
	}
}

// loadSaveDir pre-populates e.saves from any .sav files already on disk.
// This lets loop runs reuse save points discovered in prior runs.
func (e *Explorer) loadSaveDir() {
	entries, err := os.ReadDir(e.saveDir)
	if err != nil {
		return
	}
	count := 0
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".sav") {
			continue
		}
		idStr := strings.TrimSuffix(name, ".sav")
		id, err := strconv.Atoi(idStr)
		if err != nil || id == 0 {
			continue
		}
		if e.saves[id] == "" {
			e.saves[id] = filepath.Join(e.saveDir, name)
			count++
		}
	}
	if count > 0 {
		log.Printf("loaded %d prior saves from %s/", count, e.saveDir)
	}
}

// explore runs the full walkthrough + DFS + phase-3 sweep on exp.
func explore(exp *Explorer, walkthroughPath string) error {
	var (
		current     *frotz.Room
		currentSave string
		err         error
	)

	if walkthroughPath != "" {
		log.Printf("phase 1: walkthrough %s", walkthroughPath)
		_, currentSave, err = exp.runWalkthrough(walkthroughPath)
		if err != nil {
			return fmt.Errorf("walkthrough: %w", err)
		}
		if currentSave == "" {
			return fmt.Errorf("walkthrough produced no usable save")
		}
		current, err = exp.restoreGame(currentSave)
		if err != nil {
			return fmt.Errorf("restore after walkthrough: %w", err)
		}
	} else {
		current, err = exp.sess.Next()
		if err != nil {
			return fmt.Errorf("first room: %w", err)
		}
		exp.addRoom(current)
		log.Printf("start: %s [id=%d]", current.Title, current.ID)
		current, currentSave, err = exp.saveGame(current)
		if err != nil {
			return fmt.Errorf("initial save: %w", err)
		}
	}

	log.Printf("phase 2: DFS from %s [id=%d]", current.Title, current.ID)
	if err := exp.dfs(current, currentSave, 0); err != nil {
		return err
	}

	for pass := 1; ; pass++ {
		toVisit := make(map[int]string)
		for id, path := range exp.saves {
			if !exp.triedAll(id) {
				toVisit[id] = path
			}
		}
		if len(toVisit) == 0 {
			break
		}
		before := len(exp.ordered)
		log.Printf("phase 3 pass %d: %d saved rooms with unexplored exits", pass, len(toVisit))
		for roomID, savePath := range toVisit {
			if exp.triedAll(roomID) {
				continue
			}
			room, rerr := exp.restoreGame(savePath)
			if rerr != nil {
				log.Printf("phase 3 restore room %d: %v", roomID, rerr)
				continue
			}
			if room.ID != 0 && room.ID != roomID {
				log.Printf("phase 3 stale save for room %d restored %s [id=%d]; skipping", roomID, room.Title, room.ID)
				delete(exp.saves, roomID)
				continue
			}
			log.Printf("phase 3: DFS from %s [id=%d]", room.Title, room.ID)
			if err := exp.dfs(room, savePath, 0); err != nil {
				return err
			}
		}
		log.Printf("phase 3 pass %d done: +%d rooms (%d total)", pass, len(exp.ordered)-before, len(exp.ordered))
		if len(exp.ordered) == before {
			break
		}
	}
	return nil
}

func main() {
	dfrotzPath := flag.String("frotz", "./frotz/bin/dfrotz", "path to dfrotz binary")
	walkthrough := flag.String("walkthrough", "", "walkthrough file for phase 1")
	outPath := flag.String("out", "rooms.json", "output JSON path")
	loopMode := flag.Bool("loop", false, "run repeatedly; only write output when room count improves")
	traceWalkthrough := flag.Bool("trace-walkthrough", false, "log walkthrough section/command room transitions")
	flag.Parse()

	story := flag.Arg(0)
	if story == "" {
		fmt.Fprintln(os.Stderr, "usage: explorer [flags] <story>")
		os.Exit(1)
	}

	base := strings.TrimSuffix(*outPath, ".json")
	saveDir := base + "-saves"

	if err := os.MkdirAll(saveDir, 0755); err != nil {
		log.Fatalf("create save dir: %v", err)
	}

	gameID, err := readGameID(story)
	if err != nil {
		log.Fatalf("read game ID: %v", err)
	}

	if *loopMode {
		// Loop mode: one shared Explorer accumulates rooms across all runs.
		// The tried map resets each run; rooms and saves persist in memory.
		// JSON is written automatically by addRoom whenever the set grows.
		logFile, err := os.OpenFile(base+".log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			log.Fatalf("open log: %v", err)
		}
		defer logFile.Close()
		log.SetOutput(io.MultiWriter(os.Stderr, logFile))
		log.Printf("=== loop mode  gameId: %s  saves: %s/ ===", gameID, saveDir)

		rawFile, err := os.OpenFile(base+".raw.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
		if err != nil {
			log.Fatalf("open raw log: %v", err)
		}
		defer rawFile.Close()

		master := newExplorer(*outPath, saveDir, gameID, nil)
		master.traceWalkthrough = *traceWalkthrough
		master.loadJSON()
		master.loadSaveDir()

		for run := 1; ; run++ {
			before := len(master.ordered)
			log.Printf("--- run %d (%d rooms so far) ---", run, before)

			sess, err := frotz.NewSession(*dfrotzPath, story, rawFile)
			if err != nil {
				log.Printf("run %d: start frotz: %v", run, err)
				continue
			}
			master.resetForRun(sess)

			if err := explore(master, *walkthrough); err != nil {
				log.Printf("run %d: %v", run, err)
			}
			sess.Close()

			after := len(master.ordered)
			log.Printf("run %d done: %d rooms total (+%d this run)", run, after, after-before)
		}
	}

	// Single-run mode.
	logFile, err := os.OpenFile(base+".log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		log.Fatalf("open log: %v", err)
	}
	defer logFile.Close()
	log.SetOutput(io.MultiWriter(os.Stderr, logFile))

	rawFile, err := os.OpenFile(base+".raw.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		log.Fatalf("open raw log: %v", err)
	}
	defer rawFile.Close()

	log.Printf("gameId: %s  saves: %s/", gameID, saveDir)

	sess, err := frotz.NewSession(*dfrotzPath, story, rawFile)
	if err != nil {
		log.Fatalf("start frotz: %v", err)
	}
	defer sess.Close()

	exp := newExplorer(*outPath, saveDir, gameID, sess)
	exp.traceWalkthrough = *traceWalkthrough
	exp.loadJSON()

	if err := explore(exp, *walkthrough); err != nil {
		log.Fatalf("%v", err)
	}

	exp.writeJSON()
	log.Printf("done: %d rooms", len(exp.ordered))
}
