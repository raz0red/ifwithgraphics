package main

import (
	"fmt"
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

// infidelGame handles Infidel (1983). The tomb is a single connected
// maze, but the walkthrough's section headers describe the layout in prose
// ("Axe/Shovel Area", "Tent (return)") rather than the game's room titles,
// and the tomb is littered with fatal pit drops and the pyramid collapse, so
// blind route search toward a mismatched section title is both futile and
// lethal. Like Wishbringer, section targeting is disabled and the walkthrough
// replays linearly.
//
// Two clocks threaten the run. The desert sun drives a thirst clock (a counter
// that climbs every turn on the surface): past a threshold the game warns
// "You'd better drink something, and soon!", then "you're gonna be history",
// and roughly a dozen turns later the player collapses of dehydration. A second
// hunger clock runs everywhere, warning "Your stomach growls in hunger." and
// ending with "it was you against hunger. And hunger won." The walkthrough
// fills the canteen at the Nile but never drinks, and it picks up the dried
// beef from the trunk but never eats, so it dies mid-excavation. RecoverStep
// drinks from the canteen or eats the beef whenever a step's output shows the
// warning.
type infidelGame struct {
	baseGame
}

func (infidelGame) RepairWalkthrough(commands []walkthroughCommand) []walkthroughCommand {
	for i := range commands {
		commands[i].SectionRoom = ""
	}
	return commands
}

// isThirsty reports whether a room description carries one of the thirst
// warnings. The mild and urgent warnings both appear inline in the room text
// that frotz emits with each turn marker, so the explorer can react to them.
func isThirsty(room *frotz.Room) bool {
	if room == nil {
		return false
	}
	text := strings.ToLower(room.Description)
	return strings.Contains(text, "better drink something") ||
		strings.Contains(text, "gonna be history")
}

// isHungry reports whether a room description carries the hunger warning
// "Your stomach growls in hunger.", which appears inline in the room text.
func isHungry(room *frotz.Room) bool {
	if room == nil {
		return false
	}
	return strings.Contains(strings.ToLower(room.Description), "stomach growls in hunger")
}

// ContextualActions adds the explicit entry/exit verbs the desert surface and
// tomb need: the player's tent and the work tent open with enter/leave, and
// the barge chamber requires boarding the barge. A thirsty room also gets a
// drink from the canteen and a hungry room an "eat food" so DFS sweeps on the
// surface can survive long enough to probe their exits.
func (infidelGame) ContextualActions(room *frotz.Room) []string {
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

	if isThirsty(room) {
		add("drink from canteen")
	}
	if isHungry(room) {
		add("eat food")
	}
	if strings.Contains(text, "tent") {
		add("enter tent")
		add("leave tent")
	}
	if strings.Contains(text, "pyramid") {
		add("enter pyramid")
	}
	if strings.Contains(text, "barge") {
		add("board barge")
		add("enter barge")
	}
	if strings.Contains(text, "rope") {
		add("climb rope")
	}
	return actions
}

// RecoverStep keeps the walkthrough fed and hydrated. When a step's output
// shows the hunger or thirst warning, the pre-step save is restored, the
// player eats the beef or drinks from the canteen (resetting the clocks), and
// the interrupted command is re-run, so the walkthrough stays linear and
// deterministic.
func (infidelGame) RecoverStep(e *Explorer, before, next *frotz.Room, command, savePath string) (*frotz.Room, error) {
	if next == nil || savePath == "" || (!isThirsty(next) && !isHungry(next)) {
		return next, nil
	}
	for attempt := 0; attempt < 3; attempt++ {
		if _, err := e.restoreGame(savePath); err != nil {
			return next, err
		}
		var room *frotz.Room
		var err error
		if isThirsty(next) {
			room, err = e.sendAndRead("drink from canteen")
			if err != nil {
				return next, err
			}
		}
		if isHungry(next) {
			room, err = e.sendAndRead("eat food")
			if err != nil {
				return next, err
			}
		}
		if room == nil || room.ID == 0 {
			room = next
		}
		retried, err := e.sendAndRead(command)
		if err != nil {
			return next, err
		}
		if retried.ID == 0 {
			retried = next
		}
		if !isThirsty(retried) && !isHungry(retried) {
			return retried, nil
		}
	}
	return next, fmt.Errorf("still hungry/thirsty at %s [id=%d] after eating/drinking", next.Title, next.ID)
}
