// zcompare runs infodump against a Z-machine story file and compares the room
// object list to a bfs.json to identify rooms not yet discovered by the explorer.
// Optionally accepts --txd to also extract in-game display names from the
// description routines and annotate missing rooms where the name differs.
//
// Usage: zcompare --infodump <path> [--txd <path>] <story-file> <bfs.json>
package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type roomEntry struct {
	RoomID int    `json:"roomId"`
	Title  string `json:"title"`
}

var (
	objHeader = regexp.MustCompile(`^\s*(\d+)\.\s+Attributes:`)
	objParent = regexp.MustCompile(`Parent object:\s*(\d+)`)
	objDesc   = regexp.MustCompile(`Description:\s+"([^"]*)"`)
)

type zmObject struct {
	id     int
	parent int
	name   string
}

type roomAlias struct {
	displayName string
	description string
}

// parsedString carries a string from txd output along with whether it came
// from an inline PRINT instruction (true) or the static S-table (false).
// Inline strings are part of room-description routines and are preferred over
// S-table strings when both match a room name equally well.
type parsedString struct {
	text     string
	isInline bool
}

func main() {
	infodumpPath := flag.String("infodump", "", "path to infodump binary (required)")
	txdPath := flag.String("txd", "", "path to txd binary (enables in-game name lookup)")
	flag.Parse()

	if *infodumpPath == "" {
		fmt.Fprintln(os.Stderr, "usage: zcompare --infodump <path> [--txd <path>] <story-file> <bfs.json>")
		os.Exit(1)
	}
	args := flag.Args()
	if len(args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: zcompare --infodump <path> [--txd <path>] <story-file> <bfs.json>")
		os.Exit(1)
	}
	storyPath, _ := filepath.Abs(args[0])
	bfsPath, _ := filepath.Abs(args[1])

	objs := runInfodump(*infodumpPath, storyPath)
	discovered := loadBFS(bfsPath)

	roomParent := detectRoomParent(objs, discovered)
	if roomParent == 0 {
		log.Fatal("could not determine rooms container — bfs.json may be empty")
	}

	rooms := make(map[int]string)
	for _, o := range objs {
		if o.parent == roomParent {
			rooms[o.id] = o.name
		}
	}

	var displayAliases map[string]roomAlias // object name → in-game display name + description
	if *txdPath != "" {
		displayAliases = loadDisplayAliases(*txdPath, storyPath, rooms)
	}

	printReport(rooms, discovered, displayAliases)
}

// loadDisplayAliases runs txd -s, parses all strings (S-table + inline PRINT),
// and for each room returns a roomAlias with:
//   - displayName: in-game title if it differs from the Z-machine object name
//   - description: best description string matching the room name
//
// Returns a map from object name → roomAlias.
func loadDisplayAliases(txdBin, storyPath string, rooms map[int]string) map[string]roomAlias {
	cmd := exec.Command(txdBin, "-s", storyPath)
	out, err := cmd.Output()
	if err != nil {
		log.Printf("txd: %v (in-game names unavailable)", err)
		return nil
	}

	allStrings := extractAllStrings(string(out))

	knownNames := make(map[string]bool, len(rooms))
	for _, name := range rooms {
		knownNames[strings.ToLower(name)] = true
	}

	// title candidates: inline PRINT strings whose first portion looks like a
	// room title but differs from any known object name.
	titleCandidates := titleLikeStrings(allStrings, knownNames)

	result := make(map[string]roomAlias)
	for _, objName := range rooms {
		alias := roomAlias{}

		// Display name alias: find a title candidate that shares words with this room.
		for _, cand := range titleCandidates {
			if best := bestMatch(cand.displayName, rooms); best == objName {
				alias.displayName = cand.displayName
				break
			}
		}

		// Description: find the best-matching description string.
		alias.description = findDescription(objName, allStrings)

		if alias.displayName != "" || alias.description != "" {
			result[objName] = alias
		}
	}
	return result
}

var (
	descPfx = []string{
		"You are ", "You're ", "You stand ", "You can ", "You see ",
		"As you ", "Around you ", "Before you ", "Above you ", "Below you ",
		"This is ", "This room ", "This area ", "This was ",
	}
	titleSkip = []string{
		"You ", "There ", "The ", "A ", "An ", "As ", "Your ",
		"This ", "Here ", "It ", "Its ", "In ", "At ",
	}
)

// extractAllStrings parses txd -s output and returns every string (S-table and
// inline PRINT/PRINT_RET) as a parsedString, preserving the isInline flag.
func extractAllStrings(txdOut string) []parsedString {
	var results []parsedString
	inStr := false
	isInline := false
	var lines []string

	flushLine := regexp.MustCompile(`^(?:(S\d+):\s+|(.*PRINT(?:_RET)?\s+))"(.*)`)

	flush := func() {
		if len(lines) > 0 {
			results = append(results, parsedString{
				text:     strings.Join(lines, " "),
				isInline: isInline,
			})
		}
		lines = nil
	}

	scanner := bufio.NewScanner(strings.NewReader(txdOut))
	for scanner.Scan() {
		line := scanner.Text()

		if !inStr {
			m := flushLine.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			flush()
			// m[1] non-empty = S-table entry; m[2] non-empty = inline PRINT
			isInline = m[1] == ""
			content := m[3]
			if idx := strings.LastIndex(content, `"`); idx >= 0 {
				lines = append(lines, content[:idx])
				flush()
			} else {
				lines = append(lines, content)
				inStr = true
			}
		} else {
			trimmed := strings.TrimSpace(line)
			if idx := strings.LastIndex(trimmed, `"`); idx >= 0 {
				lines = append(lines, trimmed[:idx])
				inStr = false
				flush()
			} else {
				lines = append(lines, trimmed)
			}
		}
	}
	flush()
	return results
}

// titleLikeStrings returns strings whose first portion looks like a room title
// (short, capitalised, not a description phrase) and is not already a known
// object name.
func titleLikeStrings(allStrings []parsedString, knownNames map[string]bool) []roomAlias {
	var out []roomAlias
	for _, ps := range allStrings {
		s := ps.text
		firstLine := s
		for _, pfx := range descPfx {
			if idx := strings.Index(s, " "+pfx); idx > 0 {
				firstLine = s[:idx]
				break
			}
		}
		firstLine = strings.TrimSpace(firstLine)
		if !looksLikeRoomTitle(firstLine, titleSkip) {
			continue
		}
		if knownNames[strings.ToLower(firstLine)] {
			continue
		}
		body := strings.TrimSpace(strings.TrimPrefix(s, firstLine))
		out = append(out, roomAlias{displayName: firstLine, description: body})
	}
	return out
}

// findDescription returns the best description string for a room.
//
// Scoring priority (all descending/ascending as noted):
//  1. Quality score: weighted word overlap where later words in the room name
//     carry more weight (they are usually the more specific part of a compound
//     name, e.g. "anteroom" in "Crypt Anteroom").
//  2. Source: inline PRINT strings beat static S-table strings at equal quality
//     (inline strings come from room-description routines; S-table strings may
//     belong to other, already-discovered rooms).
//  3. Primary prefix: strings starting with a known description prefix beat
//     fallback strings at equal quality+source.
//  4. First keyword position: earlier occurrence wins among equal candidates
//     (keyword as sentence subject > keyword mentioned in passing).
func findDescription(roomName string, allStrings []parsedString) string {
	weights := significantWordsWeighted(roomName)

	type candidate struct {
		s        string
		quality  float64
		firstPos int
		primary  bool
		isInline bool
	}

	const bigPos = 1<<31 - 1
	best := candidate{firstPos: bigPos, quality: -1}

	for _, ps := range allStrings {
		// Fragments from mid-sentence concatenation start with a lowercase letter;
		// real room descriptions always begin with a proper sentence.
		// Trim leading whitespace first: Z-machine strings sometimes carry a
		// leading space for in-game formatting.
		if lead := strings.TrimLeft(ps.text, " \t"); len(lead) == 0 || lead[0] < 'A' || lead[0] > 'Z' {
			continue
		}
		quality := weightedOverlap(weights, significantWords(ps.text))
		if quality <= 0 {
			continue
		}
		isPrimary := false
		for _, pfx := range descPfx {
			if strings.HasPrefix(ps.text, pfx) {
				isPrimary = true
				break
			}
		}
		// Exit-description filter: skip strings that read like a list of exits.
		// Primary strings (starting with "You are", "This is", etc.) are room
		// descriptions by definition — they may mention directions in describing
		// the layout without being exit lists, so skip the filter for them.
		if !isPrimary && isExitDescription(ps.text) {
			continue
		}
		// Compute firstPos of the earliest word that stem-matches any keyword.
		sLow := strings.ToLower(ps.text)
		firstPos := len(ps.text)
		for _, tok := range strings.Fields(sLow) {
			tok = strings.Trim(tok, ".,!?;:'\"")
			for kw := range weights {
				if wordsMatch(kw, tok) {
					if i := strings.Index(sLow, tok); i >= 0 && i < firstPos {
						firstPos = i
					}
				}
			}
		}
		// Exclude fragments (embedded-quote truncation means no terminal punctuation).
		trimmed := strings.TrimRight(ps.text, " \t")
		if !strings.HasSuffix(trimmed, ".") && !strings.HasSuffix(trimmed, "!") && !strings.HasSuffix(trimmed, "?") {
			continue
		}
		if !isPrimary {
			// Short non-primary strings are usually one-liner game messages.
			if len(ps.text) < 80 {
				continue
			}
			// The keyword must appear near the start; a distant mention means
			// this string is describing something else and the match is incidental.
			if firstPos >= 80 {
				continue
			}
		} else {
			// Very short primary strings are item/object descriptions, not rooms.
			if len(ps.text) < 50 {
				continue
			}
		}

		// Scoring priority at equal quality:
		// 1. primary (starts with a known desc prefix) beats non-primary
		// 2. inline (from room routine) beats S-table (among same primary tier)
		// 3. earlier keyword position wins
		better := quality > best.quality+1e-9 ||
			(qualEq(quality, best.quality) && isPrimary && !best.primary) ||
			(qualEq(quality, best.quality) && isPrimary == best.primary && ps.isInline && !best.isInline) ||
			(qualEq(quality, best.quality) && isPrimary == best.primary && ps.isInline == best.isInline && firstPos < best.firstPos)
		if better {
			best = candidate{ps.text, quality, firstPos, isPrimary, ps.isInline}
		}
	}
	return best.s
}

func qualEq(a, b float64) bool { return a >= b-1e-9 && a <= b+1e-9 }

// significantWordsWeighted returns a map of significant word → weight where
// words later in the room name get proportionally higher weight.  This lets
// the more-specific part of a compound name (e.g. "anteroom" in "Crypt
// Anteroom") outweigh the broader prefix ("crypt") when matching descriptions.
func significantWordsWeighted(roomName string) map[string]float64 {
	raw := strings.Fields(strings.ToLower(roomName))
	// Collect in-order non-stop words.
	var ordered []string
	for _, w := range raw {
		w = strings.Trim(w, ".,!?;:'\"")
		if !stopWords[w] && len(w) > 1 {
			ordered = append(ordered, w)
		}
	}
	n := len(ordered)
	if n == 0 {
		return nil
	}
	weights := make(map[string]float64, n)
	for i, w := range ordered {
		weights[w] = float64(i+1) / float64(n)
	}
	return weights
}

// wordsMatch returns true when a and b are the same word or one is a prefix of
// the other (e.g. "timber"/"timbers", "jewel"/"jewelled", "draft"/"drafty").
// Both words must be at least 4 characters to avoid short-word false positives.
// For longer words (≥8 chars each) a 6-character common prefix also matches
// (e.g. "treasure"/"treasury", "technology"/"technological").
func wordsMatch(a, b string) bool {
	if a == b {
		return true
	}
	if len(a) >= 4 && len(b) >= 4 {
		if strings.HasPrefix(a, b) || strings.HasPrefix(b, a) {
			return true
		}
	}
	if len(a) >= 8 && len(b) >= 8 && a[:6] == b[:6] {
		return true
	}
	return false
}

// weightedOverlap returns the sum of weights for room keywords that stem-match
// any word in strWords.
func weightedOverlap(weights map[string]float64, strWords map[string]bool) float64 {
	total := 0.0
	for kw, weight := range weights {
		for sw := range strWords {
			if wordsMatch(kw, sw) {
				total += weight
				break
			}
		}
	}
	return total
}

var directionWords = map[string]bool{
	"north": true, "south": true, "east": true, "west": true,
	"northeast": true, "northwest": true, "southeast": true, "southwest": true,
	"up": true, "down": true,
	"upstream": true, "downstream": true,
	// Adjectival forms: "at the northern end" is as directional as "to the north".
	"northern": true, "southern": true, "eastern": true, "western": true,
}

// isExitDescription returns true when a string reads like a list of exits
// rather than a room description (3+ direction words is a reliable signal).
// Hyphens are split so "east-west" counts as "east" + "west".
func isExitDescription(s string) bool {
	count := 0
	for _, tok := range strings.Fields(strings.ToLower(s)) {
		tok = strings.Trim(tok, ".,!?;:'\"")
		for _, part := range strings.Split(tok, "-") {
			if directionWords[part] {
				count++
				if count >= 3 {
					return true
				}
			}
		}
	}
	return false
}

func looksLikeRoomTitle(s string, descStarters []string) bool {
	s = strings.TrimSpace(s)
	if len(s) == 0 || len(s) > 40 {
		return false
	}
	if s[0] < 'A' || s[0] > 'Z' {
		return false
	}
	for _, prefix := range descStarters {
		if strings.HasPrefix(s, prefix) {
			return false
		}
	}
	return true
}

// bestMatch returns the object name in rooms whose words best overlap with
// the candidate string. Returns "" if no significant overlap is found.
func bestMatch(candidate string, rooms map[int]string) string {
	candWords := significantWords(candidate)
	if len(candWords) == 0 {
		return ""
	}

	bestName := ""
	bestScore := 0
	for _, name := range rooms {
		score := wordOverlap(candWords, significantWords(name))
		if score > bestScore {
			bestScore = score
			bestName = name
		}
	}
	if bestScore == 0 {
		return ""
	}
	return bestName
}

var stopWords = map[string]bool{
	"the": true, "a": true, "an": true, "of": true,
	"in": true, "on": true, "at": true, "to": true,
	"and": true, "or": true,
	// Too generic to use as room-name discriminators:
	"room": true, "area": true, "passage": true, "place": true,
}

func significantWords(s string) map[string]bool {
	words := make(map[string]bool)
	for _, w := range strings.Fields(strings.ToLower(s)) {
		w = strings.Trim(w, ".,!?;:'\"")
		if !stopWords[w] && len(w) > 1 {
			words[w] = true
		}
	}
	return words
}

func wordWrap(s string, width int) []string {
	var lines []string
	for len(s) > width {
		cut := strings.LastIndex(s[:width], " ")
		if cut <= 0 {
			cut = width
		}
		lines = append(lines, s[:cut])
		s = strings.TrimSpace(s[cut:])
	}
	if s != "" {
		lines = append(lines, s)
	}
	return lines
}

func wordOverlap(a, b map[string]bool) int {
	count := 0
	for w := range a {
		if b[w] {
			count++
		}
	}
	return count
}

func detectRoomParent(objs []zmObject, discovered map[int]string) int {
	byID := make(map[int]*zmObject, len(objs))
	for i := range objs {
		byID[objs[i].id] = &objs[i]
	}
	votes := make(map[int]int)
	for id := range discovered {
		if o, ok := byID[id]; ok {
			votes[o.parent]++
		}
	}
	best, bestCnt := 0, 0
	for parent, cnt := range votes {
		if cnt > bestCnt {
			best, bestCnt = parent, cnt
		}
	}
	return best
}

func runInfodump(binary, story string) []zmObject {
	cmd := exec.Command(binary, "-o", story)
	out, err := cmd.Output()
	if err != nil {
		log.Fatalf("infodump: %v", err)
	}

	var objs []zmObject
	cur := zmObject{}

	flush := func() {
		if cur.id > 0 {
			objs = append(objs, cur)
		}
	}

	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := scanner.Text()
		if m := objHeader.FindStringSubmatch(line); m != nil {
			flush()
			cur = zmObject{}
			cur.id, _ = strconv.Atoi(m[1])
			continue
		}
		if m := objParent.FindStringSubmatch(line); m != nil {
			cur.parent, _ = strconv.Atoi(m[1])
			continue
		}
		if cur.name == "" {
			if m := objDesc.FindStringSubmatch(line); m != nil {
				cur.name = m[1]
			}
		}
	}
	flush()
	return objs
}

func loadBFS(path string) map[int]string {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("read bfs.json: %v", err)
	}
	var entries []roomEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		log.Fatalf("parse bfs.json: %v", err)
	}
	m := make(map[int]string, len(entries))
	for _, e := range entries {
		m[e.RoomID] = e.Title
	}
	return m
}

func printReport(rooms, discovered map[int]string, aliases map[string]roomAlias) {
	fmt.Printf("Z-machine rooms:  %d\n", len(rooms))
	fmt.Printf("Discovered rooms: %d\n\n", len(discovered))

	ids := make([]int, 0, len(rooms))
	for id := range rooms {
		ids = append(ids, id)
	}
	sort.Ints(ids)

	fmt.Println("Not in bfs.json:")
	missing := 0
	for _, id := range ids {
		name, found := rooms[id]
		if found {
			if _, disc := discovered[id]; !disc {
				alias := aliases[name]
				if alias.displayName != "" {
					fmt.Printf("  %4d  %s  (in-game: %q)\n", id, name, alias.displayName)
				} else {
					fmt.Printf("  %4d  %s\n", id, name)
				}
				if alias.description != "" {
					for _, l := range wordWrap(alias.description, 70) {
						fmt.Printf("        %s\n", l)
					}
				}
				missing++
			}
		}
	}
	fmt.Printf("\nMissing count: %d\n", missing)

	orphans := 0
	for id, title := range discovered {
		if _, ok := rooms[id]; !ok {
			if orphans == 0 {
				fmt.Println("\nIn bfs.json but not in Z-machine rooms (unexpected):")
			}
			fmt.Printf("  %4d  %s\n", id, title)
			orphans++
		}
	}
}
