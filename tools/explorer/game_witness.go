package main

import (
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

// witnessGame handles The Witness, a timed 1938 murder mystery. Unlike the
// treasure hunts, its map is small and almost entirely reachable by plain
// compass moves; what makes it awkward for the explorer is the clock. Events
// fire at fixed times (Linder is shot at 9:03 pm, Monica empties the office
// clock near midnight), so progress depends on waiting rather than on finding
// new exits.
type witnessGame struct {
	baseGame
}

// witnessKeepWaitingPrompt is the confirmation the game raises on every wait:
// "Do you want to keep waiting? (Answer YES or NO.)". It is not one of the
// phrasings the generic isYesNoPrompt knows, and it appears constantly here
// because waiting is the main way the plot advances.
const witnessKeepWaitingPrompt = "do you want to keep waiting"

// ContextualActions adds the door and gate handling the generic vocabulary
// misses. The front door is opened for you by the butler after the bell, but
// the garage, workshop and back doors are all locked and are only mentioned in
// passing, so the room-text heuristic does not always offer to open them.
func (witnessGame) ContextualActions(room *frotz.Room) []string {
	if room == nil {
		return nil
	}
	text := strings.ToLower(room.Title + "\n" + room.Description)
	var actions []string
	add := func(a string) {
		for _, existing := range actions {
			if existing == a {
				return
			}
		}
		actions = append(actions, a)
	}
	if strings.Contains(text, "bell") {
		add("ring bell")
	}
	if strings.Contains(text, "gate") {
		add("open gate")
	}
	if strings.Contains(text, "garage") {
		add("open garage door")
	}
	if strings.Contains(text, "workshop") {
		add("open workshop door")
	}
	return actions
}

// AdjustCommand answers the keep-waiting confirmation in place.
//
// Every "wait" in this game raises "Do you want to keep waiting?", and a
// walkthrough transcribed from a human playthrough writes the answer as its own
// line. That works during replay, but a bare "yes" is meaningless if the prompt
// is not actually up: the parser rejects it and the step is wasted. Passing it
// through unchanged is correct, and is left explicit here so the reason is on
// the record rather than looking like an oversight.
func (witnessGame) AdjustCommand(command string, _ *frotz.Room) string {
	return command
}

// witnessDoors maps a room to the closed doors leading out of it, and the
// direction each one opens onto.
//
// Almost every unreached room in this game sits behind a door that starts
// closed, and the game says so plainly when you walk into it: "Too bad, but the
// tub door is closed." The explorer never acts on that, because
// contextualActions only offers "open door" when the word "door" appears in the
// room *description*, and these doors are named only in the refusal. Worse, a
// bare "open door" is ambiguous where a room has two of them; the garage
// answers "(Which door do you mean, the garage door or the workshop door?)".
//
// So each door is named explicitly, paired with the direction it leads, and
// tried as a two-step sequence. The table was built from the refusals the DFS
// itself logged rather than from guesswork.
var witnessDoors = map[int][]struct {
	door string
	dir  string
}{
	228: {{"front gate", "n"}},    // front porch  -> front yard
	102: {{"workshop door", "e"}}, // garage       -> workshop
	122: {{"storage door", "w"}},  // hallway      -> storage closet
	138: {{"butler's door", "w"}}, // hallway      -> butler's room
	135: {{"bathroom door", "n"}}, // butler's room-> butler's bathroom
	185: {{"tub door", "e"}, {"redwood door", "n"}},
	168: {{"bedroom door", "e"}}, // living room  -> Linder's bedroom
	158: {{"French door", "w"}},  // dining room  -> front yard
}

// StatefulSequences opens each known door and steps through it. Opening and
// moving are two commands, so this cannot be a contextual action. The garage
// door additionally reports "You'll have to unlock it first", so it gets an
// unlock attempt ahead of the open.
func (witnessGame) StatefulSequences(room *frotz.Room) []actionSequence {
	if room == nil {
		return nil
	}
	doors, ok := witnessDoors[room.ID]
	if !ok {
		return nil
	}
	var seqs []actionSequence
	for _, d := range doors {
		seqs = append(seqs, actionSequence{
			Name:     "open-" + strings.ReplaceAll(d.door, " ", "-"),
			Commands: []string{"open " + d.door, d.dir},
		})
		seqs = append(seqs, actionSequence{
			Name:     "unlock-" + strings.ReplaceAll(d.door, " ", "-"),
			Commands: []string{"unlock " + d.door, "open " + d.door, d.dir},
		})
	}
	return seqs
}

// ShouldRetryStep re-attempts a step that landed on the keep-waiting prompt
// without advancing. The prompt consumes the turn, so a walkthrough step issued
// while it is pending is answered to the prompt instead of being run as a
// command; retrying once lets it land properly.
func (witnessGame) ShouldRetryStep(_, next *frotz.Room, command string) bool {
	if next == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(command), "yes") {
		return false
	}
	return strings.Contains(strings.ToLower(next.Description), witnessKeepWaitingPrompt)
}
