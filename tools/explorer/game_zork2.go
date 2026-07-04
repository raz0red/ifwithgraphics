package main

import "strings"

type zork2Game struct {
	baseGame
}

func (zork2Game) RepairWalkthrough(commands []walkthroughCommand) []walkthroughCommand {
	commands = repairDingyCloset(commands)
	commands = repairZork2Walkthrough(commands)
	return commands
}

func repairZork2Walkthrough(commands []walkthroughCommand) []walkthroughCommand {
	var repaired []walkthroughCommand
	for i := 0; i < len(commands); i++ {
		wt := commands[i]
		if wt.Command == "stand" && followsClosedBalloonReturn(commands, i) {
			repaired = append(repaired, wt)
			exit := wt
			exit.Command = "out"
			repaired = append(repaired, exit)
			continue
		}
		if wt.SectionRoom == "Guarded Room" &&
			wt.Command == "get necklace" &&
			i+2 < len(commands) &&
			commands[i+1].Command == "get violin" &&
			isTakeSphereCommand(commands[i+2].Command) {
			repaired = append(repaired, wt, commands[i+1], commands[i+2])
			for _, command := range []string{"get crown", "get stamp", "get zorkmid", "get ruby"} {
				extra := wt
				extra.Command = command
				repaired = append(repaired, extra)
			}
			i += 2
			continue
		}
		if wt.SectionRoom == "Safety Depository" &&
			wt.Command == "go west" &&
			i >= 3 &&
			commands[i-1].Command == "go east" &&
			commands[i-2].Command == "drop portrait" &&
			commands[i-3].Command == "drop bills" {
			wt.Command = "go east"
		}
		repaired = append(repaired, wt)
	}
	for i := range repaired {
		repaired[i].Step = i + 1
	}
	return repaired
}

func followsClosedBalloonReturn(commands []walkthroughCommand, i int) bool {
	if i == 0 || commands[i].Command != "stand" {
		return false
	}
	for j := i - 1; j >= 0 && i-j <= 10; j-- {
		if commands[j].Command == "close receptacle" {
			return true
		}
		if commands[j].Command != "wait" && commands[j].Command != "drop card" && commands[j].Command != "drop matches" {
			return false
		}
	}
	return false
}

func repairDingyCloset(commands []walkthroughCommand) []walkthroughCommand {
	var repaired []walkthroughCommand
	for i := 0; i < len(commands); i++ {
		wt := commands[i]
		if wt.SectionRoom == "Dingy Closet" &&
			wt.Command == "robot, lift cage" &&
			i+1 < len(commands) &&
			isTakeSphereCommand(commands[i+1].Command) {
			trigger := wt
			trigger.Command = "take red sphere"
			lift := wt
			take := commands[i+1]
			take.Command = "take red sphere"
			repaired = append(repaired, trigger, lift, take)
			i++
			continue
		}
		if isTakeSphereCommand(wt.Command) {
			wt.Command = "take red sphere"
		}
		repaired = append(repaired, wt)
	}
	for i := range repaired {
		repaired[i].Step = i + 1
	}
	return repaired
}

func isTakeSphereCommand(command string) bool {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "get sphere", "take sphere", "get red sphere", "take red sphere":
		return true
	}
	return false
}
