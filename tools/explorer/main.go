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

	"github.com/raz0red/ifwithgraphics/explorer/internal/frotz"
)

var allDirs = []string{"n", "s", "e", "w", "ne", "nw", "se", "sw", "u", "d", "in", "out", "enter", "climb", "cross", "board"}

type RoomEntry struct {
	GameID      string `json:"gameId"`
	RoomID      int    `json:"roomId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Skip        bool   `json:"skip,omitempty"`
}

type Explorer struct {
	sess    *frotz.Session
	gameID  string
	rooms   map[int]bool
	ordered []*RoomEntry
	tried   map[int]map[string]bool // roomID → dir → already tried
	saves   map[int]string           // roomID → save file path
	saveDir string
	outPath string
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

// saveGame sends the save command and filename to dfrotz.
// In IFWG_MONITOR builds os_read_file_name reads the path directly from stdin,
// so we send both lines before reading. After save completes the game calls
// os_read_line which emits the current room marker; we consume it with Next()
// so the caller's next Next() call sees the correct response.
func (e *Explorer) saveGame(room *frotz.Room) (string, error) {
	if room.ID == 0 {
		return "", fmt.Errorf("cannot save room with id 0 (%s)", room.Title)
	}
	path := filepath.Join(e.saveDir, fmt.Sprintf("%d.sav", room.ID))
	if err := e.sess.Send("save"); err != nil {
		return "", err
	}
	if err := e.sess.Send(path); err != nil {
		return "", err
	}
	// Consume the room marker emitted by os_read_line after save completes.
	if _, err := e.sess.Next(); err != nil {
		return "", fmt.Errorf("saveGame room %d: %w", room.ID, err)
	}
	e.saves[room.ID] = path
	return path, nil
}

// restoreGame loads a save file. After restore the game returns to os_read_line
// which emits the restored room's IFWG marker; Next() reads and returns it.
func (e *Explorer) restoreGame(path string) (*frotz.Room, error) {
	if err := e.sess.Send("restore"); err != nil {
		return nil, err
	}
	if err := e.sess.Send(path); err != nil {
		return nil, err
	}
	return e.sess.Next()
}

// dfs tries every untried direction from room, recursing into new rooms and
// restoring to the current save point after each attempt.
func (e *Explorer) dfs(room *frotz.Room, savePath string, depth int) {
	if depth > 200 {
		log.Printf("DFS depth limit at %s [id=%d]", room.Title, room.ID)
		return
	}

	for _, dir := range allDirs {
		// room.ID can change after a restore mid-loop; initialize lazily here.
		if e.tried[room.ID] == nil {
			e.tried[room.ID] = make(map[string]bool)
		}
		if e.tried[room.ID][dir] {
			continue
		}
		e.tried[room.ID][dir] = true

		if err := e.sess.Send(dir); err != nil {
			log.Printf("DFS send error: %v", err)
			return
		}
		next, err := e.sess.Next()
		if err != nil {
			log.Printf("DFS next error: %v", err)
			return
		}

		if sameRoom(next, room) {
			// Direction blocked. Restore to clean save state before the next attempt
			// so any in-room state changes (combat, lamp timer, etc.) don't accumulate.
			restored, rerr := e.restoreGame(savePath)
			if rerr != nil {
				log.Printf("DFS restore after block: %v", rerr)
				return
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
				log.Printf("DFS restore error (id=0): %v", rerr)
				return
			}
			room = restored
			continue
		}

		// Ensure a save point exists for next before recursing.
		nextSave, hasSave := e.saves[next.ID]
		if !hasSave {
			var serr error
			nextSave, serr = e.saveGame(next)
			if serr != nil {
				log.Printf("DFS save error at %s: %v — skipping subtree", next.Title, serr)
				restored, rerr := e.restoreGame(savePath)
				if rerr != nil {
					log.Printf("DFS restore after save-fail: %v", rerr)
					return
				}
				room = restored
				continue
			}
		}

		// Recurse if next still has untried directions.
		if !e.triedAll(next.ID) {
			e.dfs(next, nextSave, depth+1)
		}

		// Restore back to the current room.
		restored, rerr := e.restoreGame(savePath)
		if rerr != nil {
			log.Printf("DFS restore error returning to %s: %v", room.Title, rerr)
			return
		}
		room = restored
	}
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
	if sp, serr := e.saveGame(current); serr == nil {
		currentSave = sp
	}

	scanner := bufio.NewScanner(f)
	n := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "# ") || line == "#" {
			continue
		}
		if strings.HasPrefix(line, "#") {
			line = strings.TrimSpace(line[1:])
		}
		if line == "" {
			continue
		}
		n++

		if err := e.sess.Send(line); err != nil {
			log.Printf("walkthrough ended at step %d: %v", n, err)
			return current, currentSave, nil
		}
		next, err := e.sess.Next()
		if err != nil {
			log.Printf("walkthrough ended at step %d: %v", n, err)
			return current, currentSave, nil
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
			if sp, serr := e.saveGame(current); serr == nil {
				currentSave = sp
			}
		}
	}
	log.Printf("walkthrough done (%d commands, %d rooms, %d saves)", n, len(e.ordered), len(e.saves))
	return current, currentSave, nil
}

func (e *Explorer) writeJSON() {
	b, _ := json.MarshalIndent(e.ordered, "", "  ")
	if err := os.WriteFile(e.outPath, b, 0644); err != nil {
		log.Printf("write json: %v", err)
	}
}

// resetForRun replaces the session and clears per-run state (tried directions)
// while keeping the accumulated rooms and saves from previous runs.
func (e *Explorer) resetForRun(sess *frotz.Session) {
	e.sess  = sess
	e.tried = make(map[int]map[string]bool)
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
		current, currentSave, err = exp.runWalkthrough(walkthroughPath)
		if err != nil {
			return fmt.Errorf("walkthrough: %w", err)
		}
	} else {
		current, err = exp.sess.Next()
		if err != nil {
			return fmt.Errorf("first room: %w", err)
		}
		exp.addRoom(current)
		log.Printf("start: %s [id=%d]", current.Title, current.ID)
		currentSave, err = exp.saveGame(current)
		if err != nil {
			return fmt.Errorf("initial save: %w", err)
		}
	}

	log.Printf("phase 2: DFS from %s [id=%d]", current.Title, current.ID)
	exp.dfs(current, currentSave, 0)

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
			log.Printf("phase 3: DFS from %s [id=%d]", room.Title, room.ID)
			exp.dfs(room, savePath, 0)
		}
		log.Printf("phase 3 pass %d done: +%d rooms (%d total)", pass, len(exp.ordered)-before, len(exp.ordered))
		if len(exp.ordered) == before {
			break
		}
	}
	return nil
}

func main() {
	dfrotzPath  := flag.String("frotz", "./frotz/bin/dfrotz", "path to dfrotz binary")
	walkthrough := flag.String("walkthrough", "", "walkthrough file for phase 1")
	outPath     := flag.String("out", "rooms.json", "output JSON path")
	loopMode    := flag.Bool("loop", false, "run repeatedly; only write output when room count improves")
	flag.Parse()

	story := flag.Arg(0)
	if story == "" {
		fmt.Fprintln(os.Stderr, "usage: explorer [flags] <story>")
		os.Exit(1)
	}

	base    := strings.TrimSuffix(*outPath, ".json")
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

		master := newExplorer(*outPath, saveDir, gameID, nil)
		master.loadSaveDir()

		for run := 1; ; run++ {
			before := len(master.ordered)
			log.Printf("--- run %d (%d rooms so far) ---", run, before)

			sess, err := frotz.NewSession(*dfrotzPath, story, nil)
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
		return // loop is infinite; this is unreachable but satisfies the compiler
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
	exp.loadSaveDir()

	if err := explore(exp, *walkthrough); err != nil {
		log.Fatalf("%v", err)
	}

	exp.writeJSON()
	log.Printf("done: %d rooms", len(exp.ordered))
}
