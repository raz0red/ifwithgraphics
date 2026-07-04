package main

import (
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

type zork3Game struct {
	baseGame
}

func (zork3Game) StatefulSequences(room *frotz.Room) []actionSequence {
	if room.Title == "Great Door" {
		return []actionSequence{
			{Name: "zork3-wait-for-earthquake", Commands: append(repeatCommand("wait", 90), "e")},
		}
	}
	if room.Title == "Flathead Ocean" {
		return []actionSequence{
			{Name: "zork3-flathead-to-endgame", Commands: zork3FlatheadToEndgameCommands()},
		}
	}
	if room.Title == "Room in a Puzzle" {
		return []actionSequence{
			{Name: "zork3-solve-royal-puzzle", Commands: zork3RoyalPuzzleCommands()},
		}
	}
	if room.Title == "Royal Puzzle Entrance" && !strings.Contains(room.Description, "Lying on the ground is a small note") {
		return []actionSequence{
			{Name: "zork3-enter-endgame", Commands: zork3EndgameCommands()},
		}
	}
	return nil
}

func (zork3Game) RepairWalkthrough(commands []walkthroughCommand) []walkthroughCommand {
	return repairZork3Walkthrough(commands)
}

func (zork3Game) ShouldPreserveSave(room *frotz.Room) bool {
	if room == nil || room.Title != "Flathead Ocean" {
		return false
	}
	return !strings.Contains(strings.ToLower(room.Description), "sailor")
}

func (zork3Game) ShouldTriggerStatefulSequence(room *frotz.Room, command string) bool {
	return room.Title == "Flathead Ocean" && command == "wait"
}

func zork3RoyalPuzzleCommands() []string {
	return []string{
		"push east wall", "s", "s", "se", "push south wall", "n", "ne",
		"push south wall", "take book", "push south wall", "e", "ne",
		"push west wall", "sw", "nw", "ne", "push south wall", "sw",
		"push east wall", "ne", "push south wall", "nw", "n", "n", "n",
		"push east wall", "sw", "s", "se", "ne", "n", "push west wall",
		"nw", "push south wall", "push south wall", "w", "nw", "nw",
		"push south wall", "se", "se", "se", "ne", "push west wall",
		"push west wall", "sw", "push north wall", "push north wall",
		"push north wall", "nw", "u",
	}
}

func zork3EndgameCommands() []string {
	return []string{
		"n", "open east door", "e", "get all", "w", "w",
		"n", "n", "w", "w", "n", "e", "ne",
		"look", "wait", "look", "sw", "ne", "look", "wait", "look", "sw", "ne", "look",
		"wake man", "give waybread to man", "open door",
		"n", "n", "put sword in beam", "s", "push button", "n", "n", "n",
		"read description", "raise short pole", "push yellow wall", "push yellow wall",
		"lower short pole", "push mahogany wall", "push mahogany wall", "push mahogany wall",
		"raise short pole", "push white wall", "push white wall", "push pine wall",
		"n", "open vial", "drink liquid", "n", "n", "n",
		"knock on door", "n", "w", "n", "n", "turn dial to 4", "push button",
		"s", "open cell door", "s", "dungeon master, go to parapet",
		"dungeon master, turn dial to 1", "dungeon master, push button",
		"unlock bronze door with key", "open bronze door", "s",
	}
}

func zork3FlatheadToEndgameCommands() []string {
	commands := []string{
		"hello", "hello sailor", "get vial",
		"e", "wait",
		"attack figure", "attack figure", "attack figure", "attack figure", "attack figure",
		"take hood", "take cloak",
		"e", "e", "e", "e", "e", "s",
		"examine seal", "s",
	}
	commands = append(commands, repeatCommand("wait", 90)...)
	commands = append(commands, "e", "n")
	commands = append(commands, zork3MuseumMachineCommandStrings()...)
	commands = append(commands, "read note", "d")
	commands = append(commands, zork3RoyalPuzzleCommands()...)
	commands = append(commands, zork3EndgameCommands()...)
	return commands
}

func zork3MuseumMachineCommandStrings() []string {
	return []string{
		"turn dial to 776",
		"push gold machine south",
		"open stone door",
		"push gold machine east",
		"put vial under seat",
		"enter machine",
		"push button",
		"wait",
		"take ring",
		"look under seat",
		"get vial",
		"wait",
		"wait",
		"wait",
		"wait",
		"open door",
		"go west",
		"open north door",
		"go north",
		"put ring under seat",
		"put vial under seat",
		"turn dial to 948",
		"get in",
		"push button",
		"look under seat",
		"get vial",
		"get out",
		"open wooden door",
		"go south",
		"go south",
	}
}

func repairZork3Walkthrough(commands []walkthroughCommand) []walkthroughCommand {
	var repaired []walkthroughCommand
	for i := 0; i < len(commands); i++ {
		if i+30 < len(commands) &&
			commands[i].Command == "read plaque" &&
			commands[i+1].Command == "examine gold machine" &&
			commands[i+2].Command == "push gold machine south" &&
			commands[i+3].Command == "open stone door" &&
			commands[i+4].Command == "push gold machine east" &&
			commands[i+5].Command == "read plaque" &&
			commands[i+6].Command == "turn dial to 776" &&
			commands[i+7].Command == "sit on seat" &&
			commands[i+8].Command == "push button" &&
			commands[i+9].Command == "look" &&
			commands[i+10].Command == "take ring" &&
			commands[i+11].Command == "wait" &&
			commands[i+12].Command == "open door" &&
			commands[i+13].Command == "go west" &&
			commands[i+14].Command == "open wooden door" &&
			commands[i+15].Command == "go north" &&
			commands[i+16].Command == "look under seat" &&
			commands[i+17].Command == "put ring under seat" &&
			commands[i+18].Command == "sit in gold machine" &&
			commands[i+19].Command == "turn dial to 948" &&
			commands[i+20].Command == "push button" &&
			commands[i+21].Command == "look under seat" &&
			commands[i+22].Command == "stand" &&
			commands[i+23].Command == "open door" &&
			commands[i+24].Command == "go south" &&
			commands[i+25].Command == "open stone door" &&
			commands[i+26].Command == "go east" &&
			commands[i+27].Command == "get all" &&
			commands[i+28].Command == "read plaque" &&
			commands[i+29].Command == "go west" &&
			commands[i+30].Command == "go south" {
			repaired = append(repaired, zork3MuseumMachineCommands(commands[i])...)
			i += 30
			continue
		}
		if i+7 < len(commands) &&
			commands[i].Command == "take cloak" &&
			commands[i+1].Command == "go east" &&
			commands[i+2].Command == "go east" &&
			commands[i+3].Command == "go east" &&
			commands[i+4].Command == "go south" &&
			commands[i+5].Command == "examine seal" &&
			commands[i+6].Command == "go south" &&
			commands[i+7].Command == "wait" {
			toCrawl := commands[i+1]
			toCrawl.TargetRoom = "Creepy Crawl"
			repaired = append(repaired, commands[i], toCrawl, commands[i+2], commands[i+3], commands[i+4], commands[i+5], commands[i+6])
			for j := 0; j < 90; j++ {
				wait := commands[i+7]
				wait.Command = "wait"
				repaired = append(repaired, wait)
			}
			i += 7
			continue
		}
		if i+3 < len(commands) &&
			commands[i].Command == "examine seal" &&
			commands[i+1].Command == "go south" &&
			commands[i+2].Command == "wait" &&
			commands[i+3].Command == "go east" {
			repaired = append(repaired, commands[i], commands[i+1])
			for j := 0; j < 90; j++ {
				wait := commands[i+2]
				wait.Command = "wait"
				repaired = append(repaired, wait)
			}
			repaired = append(repaired, commands[i+3])
			i += 3
			continue
		}
		if i+3 < len(commands) &&
			isZork3RepellentCommand(commands[i].Command) &&
			commands[i+1].Command == "go south" &&
			commands[i+2].Command == "go south" &&
			commands[i+3].Command == "go east" {
			repaired = append(repaired, commands[i], commands[i+1])
			respray := commands[i]
			respray.Command = "spray repellent on self"
			repaired = append(repaired, respray, commands[i+2], commands[i+3])
			i += 3
			continue
		}
		if i+4 < len(commands) &&
			commands[i].Command == "enter lake" &&
			(commands[i+1].Command == "dive" || commands[i+1].Command == "go down") &&
			commands[i+2].Command == "look" &&
			commands[i+3].Command == "go west" &&
			commands[i+4].Command == "go south" {
			repaired = append(repaired, commands[i], commands[i+3], commands[i+4])
			i += 4
			continue
		}
		if i+3 < len(commands) &&
			commands[i].Command == "get torch" &&
			commands[i+1].Command == "wait" &&
			commands[i+2].Command == "wait" &&
			commands[i+3].Command == "touch table" {
			repaired = append(repaired, commands[i])
			for j := 0; j < 5; j++ {
				wait := commands[i+1]
				wait.Command = "wait"
				repaired = append(repaired, wait)
			}
			touch := commands[i+3]
			touch.TargetRoom = "Room 8"
			repaired = append(repaired, touch)
			i += 3
			continue
		}
		if i+3 < len(commands) &&
			isZork3TakeRepellentCommand(commands[i].Command) &&
			commands[i+1].Command == "wait" &&
			commands[i+2].Command == "wait" &&
			commands[i+3].Command == "touch table" {
			repaired = append(repaired, commands[i], commands[i+1], commands[i+2])
			touch := commands[i+3]
			touch.TargetRoom = "Damp Passage"
			repaired = append(repaired, touch)
			i += 3
			continue
		}
		repaired = append(repaired, commands[i])
	}
	for i := 2; i < len(repaired); i++ {
		if repaired[i-2].Command == "get can" &&
			repaired[i-1].Command == "go up" &&
			repaired[i].Command == "go west" &&
			i+1 < len(repaired) &&
			isZork3RepellentCommand(repaired[i+1].Command) {
			repaired[i].Command = "go south"
		}
	}
	for i := range repaired {
		repaired[i].Step = i + 1
	}
	return repaired
}

func zork3MuseumMachineCommands(base walkthroughCommand) []walkthroughCommand {
	raw := zork3MuseumMachineCommandStrings()
	commands := make([]walkthroughCommand, len(raw))
	for i, command := range raw {
		commands[i] = base
		commands[i].Command = command
	}
	return commands
}

func isZork3RepellentCommand(command string) bool {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "apply repellent to me", "spray repellent on self":
		return true
	}
	return false
}

func isZork3TakeRepellentCommand(command string) bool {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "get can", "take can", "get repellent", "take repellent":
		return true
	}
	return false
}
