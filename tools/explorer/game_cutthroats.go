package main

import (
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

type cutthroatsGame struct {
	baseGame
}

var cutthroatsBranch string

func (cutthroatsGame) RepairWalkthrough(commands []walkthroughCommand) []walkthroughCommand {
	branch := strings.ToLower(strings.TrimSpace(cutthroatsBranch))
	if branch == "" {
		return commands
	}
	if branch == "sao vera" {
		branch = "sao"
	}
	if branch != "sao" && branch != "leviathan" {
		return commands
	}

	repaired := make([]walkthroughCommand, 0, len(commands))
	answeredInitialDeal := false
	rewroteMcGintyWindow := false
	answeredMcGintyWait := false
	answeredPeteWait := false
	pointLookoutSectionSEs := 0
	for _, wt := range commands {
		command := cutthroatsNormalizedCommand(wt.Command)
		if !cutthroatsKeepBranchCommand(wt, branch) {
			continue
		}
		if command == "wait" && answeredPeteWait {
			answeredPeteWait = false
			continue
		}
		if command == "wait" && answeredMcGintyWait {
			answeredMcGintyWait = false
			continue
		}
		if rewroteMcGintyWindow && cutthroatsIsMcGintySection(wt.SectionName) {
			switch command {
			case "wait", "look through window":
				continue
			case "open window":
				rewroteMcGintyWindow = false
			}
		}
		if !rewroteMcGintyWindow && command == "look through window" && cutthroatsIsMcGintySection(wt.SectionName) {
			commands := []string{"look through window"}
			for _, command := range commands {
				extra := wt
				extra.Command = command
				repaired = append(repaired, extra)
			}
			rewroteMcGintyWindow = true
			continue
		}
		if command == "wait for mcginty" {
			for _, command := range []string{"wait for mcginty", "yes", "wait"} {
				extra := wt
				extra.Command = command
				repaired = append(repaired, extra)
			}
			answeredMcGintyWait = true
			continue
		}
		if command == "wait for pete" {
			branchAnswer := "yes"
			if branch == "leviathan" {
				branchAnswer = "no"
			}
			for _, command := range []string{
				"wait for pete", "yes",
				"wait", "wait", "wait", "wait", "wait", "wait",
				branchAnswer,
				"wait", "wait", "wait",
			} {
				extra := wt
				extra.Command = command
				repaired = append(repaired, extra)
			}
			answeredPeteWait = true
			continue
		}
		if command == "wait for johnny" {
			if strings.Contains(strings.ToLower(wt.SectionName), "both") {
				for _, command := range []string{"wait", "yes", "wait", "wait", "wait"} {
					extra := wt
					extra.Command = command
					repaired = append(repaired, extra)
				}
			} else {
				for _, command := range []string{"wait for johnny", "yes"} {
					extra := wt
					extra.Command = command
					repaired = append(repaired, extra)
				}
			}
			continue
		}
		if command == "se" && strings.Contains(strings.ToLower(wt.SectionName), "point lookout") {
			pointLookoutSectionSEs++
			if pointLookoutSectionSEs == 2 {
				extra := wt
				extra.Command = "wait"
				repaired = append(repaired, extra)
			}
		}
		if cutthroatsIsCoordinateCommand(command) {
			continue
		}
		if command == "get envelope" && cutthroatsIsMcGintySection(wt.SectionName) {
			// The envelope only remains briefly after McGinty leaves.
		}
		repaired = append(repaired, wt)
		if command == "show envelope to johnny" || command == "give envelope to johnny" {
			for _, command := range cutthroatsCoordinateCommands(branch) {
				extra := wt
				extra.Command = command
				repaired = append(repaired, extra)
			}
		}
		if !answeredInitialDeal && command == "yes" {
			extra := wt
			extra.Command = "yes"
			repaired = append(repaired, extra)
			answeredInitialDeal = true
		}
	}
	for i := range repaired {
		repaired[i].Step = i + 1
	}
	return repaired
}

func cutthroatsNormalizedCommand(command string) string {
	command = strings.ToLower(strings.TrimSpace(command))
	switch command {
	case "say yes":
		return "yes"
	case "say no":
		return "no"
	default:
		return command
	}
}

func cutthroatsKeepBranchCommand(wt walkthroughCommand, branch string) bool {
	section := strings.ToLower(strings.TrimSpace(wt.SectionName))
	switch {
	case strings.HasPrefix(section, "if sao vera"):
		return branch == "sao"
	case strings.HasPrefix(section, "if leviathan"):
		return branch == "leviathan"
	case strings.Contains(section, "sao vera"):
		return branch == "sao"
	case strings.Contains(section, "step 3a"):
		return branch == "sao"
	case strings.Contains(section, "leviathan"):
		return branch == "leviathan"
	case strings.Contains(section, "step 3b"):
		return branch == "leviathan"
	default:
		return true
	}
}

func cutthroatsIsMcGintySection(section string) bool {
	section = strings.ToLower(section)
	return strings.Contains(section, "secret meeting") ||
		strings.Contains(section, "mcginty") ||
		strings.Contains(section, "weasel")
}

func cutthroatsIsCoordinateCommand(command string) bool {
	command = strings.TrimSpace(strings.ToLower(command))
	return strings.Contains(command, "latitude is ") || strings.Contains(command, "longitude is ")
}

func cutthroatsCoordinateCommands(branch string) []string {
	if branch == "leviathan" {
		return []string{"latitude is 25", "longitude is 25"}
	}
	return []string{"latitude is 40", "longitude is 45"}
}

func (cutthroatsGame) AdjustCommand(command string, _ *frotz.Room) string {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "say yes":
		return "yes"
	case "say no":
		return "no"
	case "get up":
		return "stand up"
	case "withdraw 500":
		return "withdraw $500"
	case "johnny, latitude is 40":
		return "latitude is 40"
	case "johnny, longitude is 45":
		return "longitude is 45"
	case "johnny, latitude is 25":
		return "latitude is 25"
	case "johnny, longitude is 25":
		return "longitude is 25"
	default:
		return command
	}
}

// ContextualActions — the game opens with the player lying on the bed in
// "Your Room, on the bed"; blind directional movement does nothing until
// the player explicitly gets up, so the generic exploration loop needs a
// hint here or it never leaves the first room.
func (cutthroatsGame) ContextualActions(room *frotz.Room) []string {
	text := strings.ToLower(room.Title + "\n" + room.Description)
	var actions []string
	if strings.Contains(text, "on the bed") || strings.Contains(text, "you are lying") {
		actions = append(actions, "stand up", "get up")
	}
	return actions
}
