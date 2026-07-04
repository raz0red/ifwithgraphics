package main

import (
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

type zork1Game struct {
	baseGame
}

func (zork1Game) StatefulSequences(room *frotz.Room) []actionSequence {
	if room.Title == "Cyclops Room" {
		return []actionSequence{
			{Name: "cyclops-ulysses-up", Commands: []string{"ulysses", "u"}},
			{Name: "cyclops-ulysses-east", Commands: []string{"ulysses", "e"}},
		}
	}
	return nil
}

func (zork1Game) RepairWalkthrough(commands []walkthroughCommand) []walkthroughCommand {
	commands = repairTopOfWell(commands)
	commands = repairZork1DeepCanyonRoute(commands)
	return commands
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

func repairZork1DeepCanyonRoute(commands []walkthroughCommand) []walkthroughCommand {
	var repaired []walkthroughCommand
	for i := 0; i < len(commands); i++ {
		if i+6 < len(commands) &&
			commands[i].Command == "go south" &&
			commands[i+1].Command == "go down" &&
			commands[i+2].Command == "go southeast" &&
			commands[i+3].Command == "go east" &&
			commands[i+4].Command == "go down" &&
			commands[i+5].Command == "go down" &&
			commands[i+6].Command == "take torch" {
			repaired = append(repaired, commands[i], commands[i+1])
			west := commands[i+2]
			west.Command = "go west"
			repaired = append(repaired, west, commands[i+2], commands[i+3], commands[i+4])
			i += 5
			continue
		}
		repaired = append(repaired, commands[i])
	}
	for i := range repaired {
		repaired[i].Step = i + 1
	}
	return repaired
}
