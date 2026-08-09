package main

import (
	"regexp"
	"strings"
)

// A blocked exit usually names whatever is blocking it, but only when you walk
// into it. The room description says nothing: the hallway in The Witness reads
// as an ordinary hallway, and it is the refusal that says "Too bad, but the
// storage door is closed." contextualActions only ever sees descriptions, so
// every one of these exits looked like a wall.
//
// Two games have already been patched around this by hand, with a table of
// door names per room in game_enchanter.go and game_witness.go, together worth
// eight rooms that the DFS had walked past. Both tables were built by reading
// the refusals the DFS itself had logged and discarded. Parsing them directly
// is the same work done once, for every game.
//
// The patterns stay deliberately narrow. A wrong guess here is not free: each
// obstacle costs two save/restore round trips per direction, and a phrase like
// "the door is closed" lifted out of ordinary prose would spend them on
// nothing. Everything matched here is a refusal a game gives for a blocked
// exit, and the obstacle is always the noun the game itself named.
var refusalPatterns = []*regexp.Regexp{
	// "The door is closed.", "Too bad, but the tub door is closed."
	regexp.MustCompile(`(?i)\bthe ([a-z][a-z' -]{0,28}?) is (?:closed|locked|shut|barred)\b`),
	// "You'll have to open the gate first."
	regexp.MustCompile(`(?i)\bopen the ([a-z][a-z' -]{0,28}?)\s+first\b`),
	// "You can't go through the closed door."
	regexp.MustCompile(`(?i)\bthrough the (?:closed|locked) ([a-z][a-z' -]{0,28}?)\b`),
}

// A bare "open door" is not always enough. Asked to open a door in the garage,
// The Witness answers "(Which door do you mean, the garage door or the
// workshop door?)", which resolves nothing and burns the turn. When the game
// offers the alternatives, take both and name them explicitly.
var refusalChoicePattern = regexp.MustCompile(`(?i)which [a-z ]{1,20}? do you mean, the ([a-z][a-z' -]{0,28}?) or the ([a-z][a-z' -]{0,28}?)\?`)

// Nouns that name a place or a fixture rather than something openable. "The
// kitchen is closed" is not an exit to force, and "open floor" is nonsense.
var refusalStopWords = map[string]bool{
	"door": false, // openable, listed only to document that it is wanted

	"room": true, "kitchen": true, "office": true, "hallway": true,
	"floor": true, "ceiling": true, "wall": true, "ground": true,
	"path": true, "way": true, "road": true, "sky": true,
	"shop": true, "store": true, "bank": true, "museum": true,
	"game": true, "story": true, "book": true, "case": true,
}

// refusalHint pairs an obstacle a game named with the direction that ran into
// it, so the retry moves the way that was actually blocked rather than
// guessing.
type refusalHint struct {
	Obstacle string
	Dir      string
	// Emits bounds how often this hint may be retried. tryStatefulSequences
	// clears e.tried for a room after recursing, so a hint that rebuilt its
	// sequences every pass fired until the depth limit killed the walk.
	Emits int
}

// refusalRetryBudget is how many times one obstacle is worth re-attempting.
//
// One, measured rather than assumed. The obvious reasoning says a locked door
// deserves several tries, because the key usually turns up later in the walk.
// Tried against The Witness with its hand-written door table disabled, a
// budget of 3 found 26 rooms from 108 sequences, while a budget of 1 found 27
// from 34. The retries do not wait for a better game state, they perturb the
// one the walk is in: every extra sequence is another save, restore and set of
// turns, and the room lost at 3 was one that 1 had reached.
const refusalRetryBudget = 1

// refusalObstacles pulls the names of whatever blocked an exit out of a
// game's refusal text, in the order the game mentioned them, without repeats.
func refusalObstacles(text string) []string {
	if text == "" {
		return nil
	}
	var found []string
	seen := map[string]bool{}
	add := func(raw string) {
		name := normalizeObstacle(raw)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		found = append(found, name)
	}

	for _, m := range refusalChoicePattern.FindAllStringSubmatch(text, -1) {
		add(m[1])
		add(m[2])
	}
	for _, re := range refusalPatterns {
		for _, m := range re.FindAllStringSubmatch(text, -1) {
			add(m[1])
		}
	}
	return found
}

// normalizeObstacle trims a captured noun phrase down to something worth
// sending as "open <name>", or returns "" if it is not worth a turn.
func normalizeObstacle(raw string) string {
	name := strings.ToLower(strings.TrimSpace(raw))
	name = strings.Trim(name, " -'")
	if len(name) < 3 || strings.Count(name, " ") > 3 {
		return ""
	}
	// A leading article survives phrasings like "but the the door"; drop it.
	name = strings.TrimPrefix(name, "the ")
	// Judge the head noun, so "storage door" and "butler's door" are kept
	// while "dining room" and "front path" are not.
	fields := strings.Fields(name)
	if len(fields) == 0 || refusalStopWords[fields[len(fields)-1]] {
		return ""
	}
	return name
}

// refusalSequences turns one discovered obstacle into the commands worth
// trying. Opening and moving are two commands, so this cannot be a contextual
// action: it has to be a sequence, and the door has to still be open when the
// move is sent. The unlock variant exists because some doors report "You'll
// have to unlock it first" only after the open is attempted.
func refusalSequences(obstacle, dir string) []actionSequence {
	slug := strings.NewReplacer(" ", "-", "'", "").Replace(obstacle)
	return []actionSequence{
		{
			Name:     "refusal-open-" + slug + "-" + dir,
			Commands: []string{"open " + obstacle, dir},
		},
		{
			Name:     "refusal-unlock-" + slug + "-" + dir,
			Commands: []string{"unlock " + obstacle, "open " + obstacle, dir},
		},
	}
}
