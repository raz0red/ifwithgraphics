package main

import (
	"fmt"
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

// wishbringerGame tracks the Magick word the pelican traces on the cloud
// (drawn from a small random set each game) so the walkthrough's "say" step
// uses the word actually revealed, and recovers from Boot Patrol arrests.
type wishbringerGame struct {
	baseGame
	magicWord string
}

// ResetTriedPerSave opts Wishbringer into per-save direction retries. The
// village is two different maps depending on world state — Festeron by day,
// Witchville after nightfall — and the tide and Boot Patrol gate individual
// exits on top of that, so a direction blocked from one saved position is
// often open from another.
func (*wishbringerGame) ResetTriedPerSave() bool { return true }

// ContextualActions adds Wishbringer-specific entry actions so the DFS can
// step into the village buildings (library, museum, church, police station,
// theatre, cottage) whose interiors are unreachable by plain directions. The
// generic engine covers windows/boats/trees etc.; Wishbringer's doors need
// explicit entry verbs.
func (wishbringerGame) ContextualActions(room *frotz.Room) []string {
	if room == nil {
		return nil
	}
	text := strings.ToLower(room.Title + "\n" + room.Description)
	var actions []string
	add := func(a string) {
		for _, x := range actions {
			if x == a {
				return
			}
		}
		actions = append(actions, a)
	}

	if strings.Contains(text, "door") {
		add("open door")
		add("enter")
		add("go in")
	}

	buildings := []string{
		"library", "museum", "church", "police", "theatre", "theater",
		"cottage", "shop", "store", "post office", "station", "school",
		"saloon", "bank", "barbershop", "inn", "hotel",
	}
	for _, b := range buildings {
		if strings.Contains(text, b) {
			add("enter " + b)
		}
	}

	// The entrance to the Tidal Pool is north off Pleasure Wharf; the generic
	// directional sweep already covers it, but the beach side of the pool may
	// need a nudge as well.
	if strings.Contains(text, "wharf") || strings.Contains(text, "tidal") {
		add("south")
		add("north")
	}
	return actions
}

// StatefulSequences opens closed doors (open then enter in a single attempt,
// since the DFS restores after every action and would otherwise lose the
// opened-door state) and waits out the tide to reach the Tidal Pool.
func (wishbringerGame) StatefulSequences(room *frotz.Room) []actionSequence {
	if room == nil {
		return nil
	}
	text := strings.ToLower(room.Title + "\n" + room.Description)
	var seqs []actionSequence

	if strings.Contains(text, "door") {
		seqs = append(seqs, actionSequence{
			Name:     "enter-through-door",
			Commands: []string{"open door", "enter"},
		})
		seqs = append(seqs, actionSequence{
			Name:     "enter-through-door-in",
			Commands: []string{"open door", "in"},
		})
	}

	if strings.Contains(text, "wharf") || strings.Contains(text, "tidal") {
		var cmds []string
		for i := 0; i < 12; i++ {
			cmds = append(cmds, "wait", "north")
		}
		seqs = append(seqs, actionSequence{
			Name:     "wait-for-tide",
			Commands: cmds,
		})
	}

	return seqs
}

// RepairWalkthrough neutralizes section-room targeting for Wishbringer.
// The story's timed puzzles (the 6pm fog, the witch's whistle, the troll
// toll) make the generic "land exactly on the next section's room, else
// restore the section save and brute-force neighboring commands" recovery
// counterproductive: section headers that don't match real room titles
// caused restores and misapplied commands during replay. Clearing
// SectionRoom disables that auto-targeting in parseWalkthrough, so every
// step replays linearly exactly as verified in direct play.
func (wishbringerGame) RepairWalkthrough(commands []walkthroughCommand) []walkthroughCommand {
	for i := range commands {
		commands[i].SectionRoom = ""
	}
	return commands
}

// jailCellRoomID is the room the Boot Patrol throws the player into, and the
// only way the walkthrough legitimately ends up there is by climbing up from
// the crypt passage (Underground 66) during the blanket/worm section. Arriving
// from any street or park room during the riot/curfew means the patrol caught
// the player mid-step.
const jailCellRoomID = 90

func isJailPassageRoom(id int) bool {
	switch id {
	case 66, 69, 90, 127, 139, 220:
		return true
	}
	return false
}

// RecoverStep keeps the walkthrough linear when the Boot Patrol arrests the
// player at a random moment (the fountain during the riot, or the streets
// after curfew). Landing in the Jail Cell from a street room restores the
// pre-step save, waits for the patrol to move on, and re-attempts the
// interrupted command a bounded number of times.
func (g *wishbringerGame) RecoverStep(e *Explorer, before, next *frotz.Room, command, savePath string) (*frotz.Room, error) {
	if next == nil || next.ID != jailCellRoomID || savePath == "" {
		return next, nil
	}
	if before == nil || isJailPassageRoom(before.ID) {
		return next, nil
	}

	// Unintended curfew arrest (the player has no way out of the cell), so
	// restore the pre-step save and retry. frotz's PRNG is a C static that
	// save/restore does not reset, so every restore replays identical turn
	// outcomes; waiting a different number of turns per attempt consumes a
	// different amount of RNG and shifts the patrol's phase.
	for attempt := 0; attempt < 12; attempt++ {
		if _, err := e.restoreGame(savePath); err != nil {
			return next, err
		}
		arrested := false
		for waits := 0; waits <= attempt && !arrested; waits++ {
			current, err := e.sendAndRead("wait")
			if err != nil {
				return next, err
			}
			arrested = current.ID == jailCellRoomID
		}
		if arrested {
			continue
		}
		retried, err := e.sendAndRead(command)
		if err != nil {
			return next, err
		}
		if retried.ID != jailCellRoomID {
			return retried, nil
		}
	}
	return next, fmt.Errorf("still arrested by the Boot Patrol after 12 attempts at %q", command)
}

// Observe reads the Magick word off the pelican's lighthouse scene the first
// time it appears, so AdjustCommand can later substitute it into the tower
// entrance "say" step.
func (g *wishbringerGame) Observe(room *frotz.Room) {
	if room == nil || g.magicWord != "" {
		return
	}
	lower := strings.ToLower(room.Title + "\n" + room.Description)
	const marker = "traces a word on a passing cloud:"
	i := strings.Index(lower, marker)
	if i < 0 {
		return
	}
	word := strings.TrimSpace(lower[i+len(marker):])
	for j := 0; j < len(word); j++ {
		if (word[j] < 'a' || word[j] > 'z') && word[j] != '\'' && word[j] != ';' {
			word = word[:j]
			break
		}
	}
	if word != "" {
		g.magicWord = word
	}
}

// AdjustCommand substitutes the pelican's Magick word into the walkthrough's
// "say sorkin" step, in case the word drawn for this game differs.
func (g *wishbringerGame) AdjustCommand(command string, room *frotz.Room) string {
	if g.magicWord != "" && strings.HasPrefix(strings.ToLower(strings.TrimSpace(command)), "say ") {
		return "say " + g.magicWord
	}
	return command
}
