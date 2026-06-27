package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"github.com/raz0red/ifwithgraphics/explorer/internal/frotz"
)

// allDirs is the full set of directions to try from every room.
var allDirs = []string{"n", "s", "e", "w", "ne", "nw", "se", "sw", "u", "d", "in", "out"}

// cmdToDir maps a game command to a canonical direction string, or "" if not a movement command.
func cmdToDir(cmd string) string {
	switch strings.ToLower(strings.TrimSpace(cmd)) {
	case "n", "north", "go north":
		return "n"
	case "s", "south", "go south":
		return "s"
	case "e", "east", "go east":
		return "e"
	case "w", "west", "go west":
		return "w"
	case "ne", "northeast", "go northeast":
		return "ne"
	case "nw", "northwest", "go northwest":
		return "nw"
	case "se", "southeast", "go southeast":
		return "se"
	case "sw", "southwest", "go southwest":
		return "sw"
	case "u", "up", "go up":
		return "u"
	case "d", "down", "go down":
		return "d"
	case "in", "go in", "enter", "go inside":
		return "in"
	case "out", "go out", "exit", "leave":
		return "out"
	}
	return ""
}

func opposite(dir string) string {
	switch dir {
	case "n":
		return "s"
	case "s":
		return "n"
	case "e":
		return "w"
	case "w":
		return "e"
	case "ne":
		return "sw"
	case "sw":
		return "ne"
	case "nw":
		return "se"
	case "se":
		return "nw"
	case "u":
		return "d"
	case "d":
		return "u"
	case "in":
		return "out"
	case "out":
		return "in"
	}
	return ""
}

// roomGraph tracks directed edges discovered between rooms.
// Edge value 0 means the direction was tried and failed (no movement).
type roomGraph struct {
	edges map[int]map[string]int // roomID → dir → destRoomID
}

func newRoomGraph() *roomGraph {
	return &roomGraph{edges: make(map[int]map[string]int)}
}

func (g *roomGraph) setEdge(fromID int, dir string, toID int) {
	if g.edges[fromID] == nil {
		g.edges[fromID] = make(map[string]int)
	}
	g.edges[fromID][dir] = toID
}

func (g *roomGraph) tried(roomID int, dir string) bool {
	if g.edges[roomID] == nil {
		return false
	}
	_, ok := g.edges[roomID][dir]
	return ok
}

func (g *roomGraph) triedAll(roomID int) bool {
	for _, d := range allDirs {
		if !g.tried(roomID, d) {
			return false
		}
	}
	return true
}

// pathTo returns the direction sequence from fromID to toID via BFS over known edges.
// Returns nil if toID is not currently reachable.
func (g *roomGraph) pathTo(fromID, toID int) []string {
	if fromID == toID {
		return []string{}
	}
	type node struct {
		id   int
		path []string
	}
	seen := map[int]bool{fromID: true}
	queue := []node{{fromID, nil}}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for dir, dest := range g.edges[cur.id] {
			if dest <= 0 || seen[dest] {
				continue
			}
			p := make([]string, len(cur.path)+1)
			copy(p, cur.path)
			p[len(cur.path)] = dir
			if dest == toID {
				return p
			}
			seen[dest] = true
			queue = append(queue, node{dest, p})
		}
	}
	return nil
}

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
	history []string
	outPath string
}

func newExplorer(outPath, gameID string, sess *frotz.Session) *Explorer {
	return &Explorer{
		sess:    sess,
		gameID:  gameID,
		rooms:   make(map[int]bool),
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

func (e *Explorer) addRoom(r *frotz.Room) bool {
	key := r.ID
	if key == 0 {
		for _, entry := range e.ordered {
			if entry.Title == r.Title {
				return false
			}
		}
	} else if e.rooms[key] {
		return false
	}
	e.rooms[key] = true
	e.ordered = append(e.ordered, &RoomEntry{
		GameID:      e.gameID,
		RoomID:      r.ID,
		Title:       r.Title,
		Description: r.Description,
	})
	e.save()
	return true
}

func (e *Explorer) step(cmd string, current *frotz.Room) (*frotz.Room, bool, error) {
	log.Printf("  > %s", cmd)
	if err := e.sess.Send(cmd); err != nil {
		return nil, false, err
	}
	next, err := e.sess.Next()
	if err != nil {
		return nil, false, err
	}
	isNew := e.addRoom(next)
	var entry string
	switch {
	case sameRoom(next, current):
		entry = fmt.Sprintf("- %q -> FAILED (still in %s)", cmd, current.Title)
	case isNew:
		entry = fmt.Sprintf("- %q -> NEW: %s [id=%d]", cmd, next.Title, next.ID)
	default:
		entry = fmt.Sprintf("- %q -> %s (visited)", cmd, next.Title)
	}
	e.history = append(e.history, entry)
	if len(e.history) > 30 {
		e.history = e.history[len(e.history)-30:]
	}
	log.Printf("  [id=%d] %s%s", next.ID, next.Title, map[bool]string{true: " (NEW)", false: ""}[isNew])
	return next, isNew, nil
}

func sameRoom(a, b *frotz.Room) bool {
	if a.ID != 0 && b.ID != 0 {
		return a.ID == b.ID
	}
	return a.Title == b.Title
}

// runWalkthrough drives frotz from a command file, recording movement edges into g.
func (e *Explorer) runWalkthrough(path string, g *roomGraph) (*frotz.Room, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open walkthrough: %w", err)
	}
	defer f.Close()

	current, err := e.sess.Next()
	if err != nil {
		return nil, err
	}
	e.addRoom(current)
	log.Printf("start: %s", current.Title)

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
		next, _, err := e.step(line, current)
		if err != nil {
			log.Printf("walkthrough ended at step %d: %v", n, err)
			return current, nil
		}
		// Record every command that changes rooms so BFS can navigate between them.
		// Direction commands use short canonical form ("n", "e", etc.);
		// special commands (rub mirror, climb tree, pray…) use their full text.
		if !sameRoom(next, current) {
			dir := cmdToDir(line)
			if dir == "" {
				dir = line
			}
			g.setEdge(current.ID, dir, next.ID)
			// Speculatively seed the reverse edge so BFS can navigate back
			// without following the full walkthrough path.  Will be overwritten
			// with the correct destination the first time BFS actually tries it.
			if opp := opposite(dir); opp != "" && !g.tried(next.ID, opp) {
				g.setEdge(next.ID, opp, current.ID)
			}
		}
		current = next
	}
	log.Printf("walkthrough done (%d commands, %d rooms)", n, len(e.ordered))
	return current, nil
}

// navigate follows a sequence of directions, updating the graph and frontier.
func (e *Explorer) navigate(dirs []string, current *frotz.Room, g *roomGraph, frontier map[int]*frotz.Room) (*frotz.Room, error) {
	for _, dir := range dirs {
		next, isNew, err := e.step(dir, current)
		if err != nil {
			return current, err
		}
		g.setEdge(current.ID, dir, next.ID)
		if isNew && !g.triedAll(next.ID) {
			frontier[next.ID] = next
		}
		current = next
	}
	return current, nil
}

// runBFS explores all reachable rooms via deterministic graph search.
// g is pre-seeded with movement edges recorded during the walkthrough phase.
func (e *Explorer) runBFS(start *frotz.Room, g *roomGraph) {
	// Turn on the lamp to reduce grue risk during dark-room exploration.
	if err := e.sess.Send("turn on lamp"); err == nil {
		if r, err := e.sess.Next(); err == nil {
			start = r
			e.addRoom(start)
		}
	}

	current := start

	// Seed the frontier with every room already known (walkthrough + start).
	// This lets BFS explore exits from rooms discovered during the walkthrough.
	frontier := make(map[int]*frotz.Room)
	for _, entry := range e.ordered {
		frontier[entry.RoomID] = &frotz.Room{
			ID:    entry.RoomID,
			Title: entry.Title,
		}
	}
	frontier[start.ID] = start

	log.Printf("BFS frontier seeded with %d rooms", len(frontier))

	for {
		// If the current room is fully explored, remove it from the frontier.
		if g.triedAll(current.ID) {
			delete(frontier, current.ID)
		}

		// If current room still needs exploration, do it here.
		// Otherwise navigate to a frontier room we can reach.
		if _, ok := frontier[current.ID]; !ok {
			if len(frontier) == 0 {
				break
			}
			moved := false
			for id := range frontier {
				path := g.pathTo(current.ID, id)
				if path == nil {
					continue
				}
				var err error
				current, err = e.navigate(path, current, g, frontier)
				if err != nil {
					log.Printf("BFS navigate: %v", err)
					return
				}
				moved = true
				break
			}
			if !moved {
				log.Printf("BFS: %d frontier room(s) unreachable from %s [id=%d]", len(frontier), current.Title, current.ID)
				break
			}
		}

		// Try every untried direction from the current room.
		originID := current.ID
		for _, dir := range allDirs {
			if g.tried(originID, dir) {
				continue
			}

			next, isNew, err := e.step(dir, current)
			if err != nil {
				g.setEdge(originID, dir, 0)
				log.Printf("BFS step error: %v", err)
				break
			}

			if sameRoom(next, current) {
				// Direction blocked — no movement.
				g.setEdge(originID, dir, 0)
				continue
			}

			// Moved to a different room.
			g.setEdge(originID, dir, next.ID)
			if isNew && !g.triedAll(next.ID) {
				frontier[next.ID] = next
			}
			current = next

			// Try to return via the opposite direction.
			opp := opposite(dir)
			backOriginID := current.ID // save before current changes
			back, backIsNew, berr := e.step(opp, current)
			if berr != nil {
				log.Printf("BFS backtrack error: %v", berr)
				break
			}
			g.setEdge(current.ID, opp, back.ID)
			// Speculative reverse so pathfinding can route from the backtrack room back.
			if !g.tried(back.ID, dir) {
				g.setEdge(back.ID, dir, backOriginID)
			}
			if backIsNew && !g.triedAll(back.ID) {
				frontier[back.ID] = back
			}
			current = back

			// If we're not back at origin, pathfind back.
			if current.ID != originID {
				path := g.pathTo(current.ID, originID)
				if path == nil {
					break
				}
				var nerr error
				current, nerr = e.navigate(path, current, g, frontier)
				if nerr != nil {
					log.Printf("BFS re-navigate: %v", nerr)
					return
				}
				if current.ID != originID {
					break
				}
			}
		}

		if g.triedAll(originID) {
			delete(frontier, originID)
		}
	}

	log.Printf("BFS complete: %d rooms", len(e.ordered))
}

func (e *Explorer) save() {
	b, _ := json.MarshalIndent(e.ordered, "", "  ")
	if err := os.WriteFile(e.outPath, b, 0644); err != nil {
		log.Printf("save: %v", err)
	}
}

func main() {
	dfrotzPath  := flag.String("frotz", "./frotz/bin/dfrotz", "path to dfrotz binary")
	walkthrough := flag.String("walkthrough", "", "walkthrough file — drives phase 1, BFS mops up the rest")
	outPath     := flag.String("out", "rooms.json", "output JSON (updated live)")
	flag.Parse()

	story := flag.Arg(0)
	if story == "" {
		fmt.Fprintln(os.Stderr, "usage: explorer [flags] <story>")
		fmt.Fprintln(os.Stderr, "  -walkthrough file.txt   seed exploration with a known route")
		os.Exit(1)
	}

	base := strings.TrimSuffix(*outPath, ".json")
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

	gameID, err := readGameID(story)
	if err != nil {
		log.Fatalf("read game ID: %v", err)
	}
	log.Printf("gameId: %s", gameID)

	sess, err := frotz.NewSession(*dfrotzPath, story, rawFile)
	if err != nil {
		log.Fatalf("start frotz: %v", err)
	}
	defer sess.Close()

	exp := newExplorer(*outPath, gameID, sess)
	log.Printf("output: %s", *outPath)

	g := newRoomGraph()
	var current *frotz.Room

	if *walkthrough != "" {
		log.Printf("phase 1: walkthrough %s", *walkthrough)
		current, err = exp.runWalkthrough(*walkthrough, g)
		if err != nil {
			log.Fatalf("walkthrough: %v", err)
		}
	} else {
		current, err = sess.Next()
		if err != nil {
			log.Fatalf("first room: %v", err)
		}
		exp.addRoom(current)
		log.Printf("start: %s", current.Title)
	}

	log.Printf("phase 2: BFS from %s [id=%d]", current.Title, current.ID)
	exp.runBFS(current, g)

	exp.save()
	log.Printf("done: %d rooms", len(exp.ordered))
}
