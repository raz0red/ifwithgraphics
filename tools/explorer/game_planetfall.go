package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

// planetfallGame tracks its own enunciator-color state, read off the "Comm
// Room" description and later needed to push the right Machine Shop button.
type planetfallGame struct {
	baseGame
	enunciatorColor string
}

func (g *planetfallGame) ContextualActions(room *frotz.Room) []string {
	text := strings.ToLower(room.Title + "\n" + room.Description)
	if room.Title == "Helipad" && strings.Contains(text, "vehicle") {
		return []string{"enter helicopter", "enter vehicle"}
	}
	return nil
}

func (g *planetfallGame) StatefulSequences(room *frotz.Room) []actionSequence {
	switch room.Title {
	case "Alfie Control East":
		return []actionSequence{
			{Name: "planetfall-alfie-to-lawanda", Commands: planetfallShuttleCommands(8, 6, 7)},
		}
	case "Reactor Control":
		return []actionSequence{
			{Name: "planetfall-reactor-elevator", Commands: []string{"push button", "e"}},
		}
	case "Main Lab":
		return []actionSequence{
			{Name: "planetfall-bio-locks", Commands: []string{
				"open bio-lock",
				"se",
				"e",
			}},
			{Name: "planetfall-radiation-locks", Commands: []string{
				"s",
				"take lab uniform",
				"wear lab uniform",
				"n",
				"open radiation-lock door",
				"ne",
				"e",
			}},
		}
	case "Bio Lock East":
		return []actionSequence{
			{Name: "planetfall-floyd-mini-card-to-384", Commands: []string{
				"look through window",
				"wait",
				"open door",
				"close door",
				"wait",
				"open door",
				"close door",
				"take miniaturization card",
				"w",
				"w",
				"w",
				"s",
				"s",
				"slide miniaturization card through slot",
				"type 384",
				"e",
				"n",
				"n",
				"w",
			}},
		}
	case "Computer Room":
		return []actionSequence{
			{Name: "planetfall-miniaturize-384", Commands: []string{
				"s",
				"slide miniaturization card through slot",
				"type 384",
				"e",
				"n",
				"n",
				"w",
			}},
		}
	case "Miniaturization Booth":
		return []actionSequence{
			{Name: "planetfall-miniaturize-384-direct", Commands: []string{
				"slide miniaturization card through slot",
				"type 384",
				"e",
				"n",
				"n",
				"w",
			}},
		}
	case "Rec Area":
		return []actionSequence{
			{Name: "planetfall-rec-conference", Commands: []string{
				"turn dial to 12",
				"open door",
				"n",
			}},
		}
	}
	return nil
}

func (g *planetfallGame) Observe(room *frotz.Room) {
	if room == nil || room.Title != "Comm Room" {
		return
	}
	lower := strings.ToLower(room.Description)
	for _, color := range []string{"red", "blue", "green", "yellow", "gray", "brown", "black"} {
		if strings.Contains(lower, "a "+color+" colored light is flashing on the enunciator panel") {
			g.enunciatorColor = color
			return
		}
	}
}

func (g *planetfallGame) AdjustCommand(command string, room *frotz.Room) string {
	if room == nil || room.Title != "Machine Shop" || command != "push button" || g.enunciatorColor == "" {
		return command
	}
	return "push " + g.enunciatorColor + " button"
}

func (g *planetfallGame) SaveAtWalkthroughStart() bool { return false }

func (g *planetfallGame) ShouldSaveAfterStep(moved bool) bool { return moved }

func (g *planetfallGame) ShouldRetryStep(before, next *frotz.Room, command string) bool {
	return before.Title == "Deck Nine" && command == "go port" && next.Title == "Deck Nine" &&
		strings.Contains(strings.ToLower(next.Description), "door to port slides open")
}

func planetfallShuttleCommands(accelWaits, coastWaits, brakeWaits int) []string {
	commands := []string{
		"slide shuttle card through slot",
		"push lever",
	}
	commands = append(commands, repeatCommand("wait", accelWaits)...)
	commands = append(commands,
		"pull lever",
	)
	commands = append(commands, repeatCommand("wait", coastWaits)...)
	commands = append(commands,
		"pull lever",
	)
	commands = append(commands, repeatCommand("wait", brakeWaits)...)
	commands = append(commands,
		"open door",
		"w",
		"n",
	)
	return commands
}

func planetfallShuttleProbeCommands(accelWaits, coastWaits, brakeWaits int, exit []string) []string {
	commands := []string{
		"slide shuttle card through slot",
		"push lever",
	}
	commands = append(commands, repeatCommand("wait", accelWaits)...)
	commands = append(commands, "pull lever")
	commands = append(commands, repeatCommand("wait", coastWaits)...)
	commands = append(commands, "pull lever")
	commands = append(commands, repeatCommand("wait", brakeWaits)...)
	commands = append(commands, exit...)
	return commands
}

func runShuttleProbeCommands(e *Explorer, current *frotz.Room, commands []string) (*frotz.Room, error) {
	for _, command := range commands {
		next, err := e.sendAndRead(command)
		if err != nil {
			return current, err
		}
		current = next
		if isDeathPrompt(current) || isIncapacitated(current) {
			return current, nil
		}
	}
	return current, nil
}

// ProbeShuttle exhaustively searches accel/coast/brake wait counts and exit
// routes for the Alfie shuttle timing puzzle, logging every successful
// landing. Only invoked via the -probe-shuttle CLI flag.
func (g *planetfallGame) ProbeShuttle(e *Explorer, walkthroughPath string) error {
	if walkthroughPath == "" {
		return fmt.Errorf("probe shuttle requires -walkthrough")
	}
	start, savePath, err := e.runWalkthroughToRoom(walkthroughPath, "Alfie Control East")
	if err != nil {
		return err
	}
	log.Printf("probe saved %s [id=%d] at %s", start.Title, start.ID, savePath)

	type result struct {
		accel int
		coast int
		brake int
		exit  []string
		room  *frotz.Room
	}
	var hits []result
	exitRoutes := [][]string{
		{"open door", "w", "n"},
		{"open door", "e", "n"},
		{"open door", "w", "s"},
		{"open door", "e", "s"},
	}

	for accel := 5; accel <= 9; accel++ {
		for coast := 0; coast <= 6; coast++ {
			for brake := 4; brake <= 16; brake++ {
				for _, exit := range exitRoutes {
					room, err := e.restoreGameFresh(savePath)
					if err != nil {
						return fmt.Errorf("probe restore before accel=%d coast=%d brake=%d: %w", accel, coast, brake, err)
					}
					room, err = runShuttleProbeCommands(e, room, planetfallShuttleProbeCommands(accel, coast, brake, exit))
					if err != nil {
						if rerr := e.restartSession(); rerr == nil {
							_, _ = e.restoreGame(savePath)
						}
						continue
					}
					if room == nil || isDeathPrompt(room) || isIncapacitated(room) {
						continue
					}
					if room.Title != "Alfie Control East" && room.Title != "Shuttle Car Alfie" && room.Title != "Kalamontee Platform" {
						hits = append(hits, result{accel: accel, coast: coast, brake: brake, exit: exit, room: room})
						log.Printf("SHUTTLE HIT accel=%d coast=%d brake=%d exit=%s -> %s [id=%d]",
							accel, coast, brake, strings.Join(exit, ","), room.Title, room.ID)
					}
				}
			}
		}
	}
	if len(hits) == 0 {
		return fmt.Errorf("probe found no shuttle landing")
	}
	best := hits[0]
	fmt.Printf("accel=%d coast=%d brake=%d exit=%s -> %s [id=%d]\n",
		best.accel, best.coast, best.brake, strings.Join(best.exit, ","), best.room.Title, best.room.ID)
	return nil
}
