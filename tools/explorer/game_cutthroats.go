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
	coordinateBranch := branch
	if branch == "sao-ocean" {
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
	skippingMcGintyBreakin := false
	injectedBoatCoordinates := false
	insertedPostCoordinateBoatHandoff := false
	skippingPostCoordinateBoatHandoff := false
	leviathanAfterGearGetAll := false
	leviathanDivesAfterGear := 0
	saoMaryMargaretSouths := 0
	pointLookoutSectionSEs := 0
	for _, wt := range commands {
		command := cutthroatsNormalizedCommand(wt.Command)
		sectionLower := strings.ToLower(wt.SectionName)
		if !cutthroatsKeepBranchCommand(wt, branch) {
			continue
		}
		if skippingPostCoordinateBoatHandoff {
			if strings.Contains(sectionLower, "both") {
				continue
			}
			skippingPostCoordinateBoatHandoff = false
		}
		if skippingMcGintyBreakin {
			if command == "go east" {
				skippingMcGintyBreakin = false
			} else {
				continue
			}
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
		if branch == "leviathan" && !rewroteMcGintyWindow && command == "look through window" && cutthroatsIsMcGintySection(wt.SectionName) {
			skippingMcGintyBreakin = true
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
				for _, command := range []string{
					"wait for johnny", "yes",
					"wait for johnny", "yes",
					"wait for johnny", "yes",
					"wait for johnny", "yes",
					"wait for johnny", "yes",
					"wait for johnny", "yes",
					"wait for johnny", "yes",
					"wait for johnny", "yes",
				} {
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
		if injectedBoatCoordinates && !insertedPostCoordinateBoatHandoff && strings.Contains(sectionLower, "both") {
			for _, command := range cutthroatsPostCoordinateBoatHandoff(branch) {
				extra := wt
				extra.Command = command
				repaired = append(repaired, extra)
			}
			insertedPostCoordinateBoatHandoff = true
			skippingPostCoordinateBoatHandoff = true
			continue
		}
		if command == "hide envelope under mattress" {
			extra := wt
			extra.Command = "hide envelope under bed"
			repaired = append(repaired, extra)
			continue
		}
		if cutthroatsIsCoordinateCommand(command) {
			if !injectedBoatCoordinates {
				for _, command := range cutthroatsCoordinateSequence(coordinateBranch) {
					extra := wt
					extra.Command = command
					repaired = append(repaired, extra)
				}
				injectedBoatCoordinates = true
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
		if branch == "leviathan" && strings.Contains(sectionLower, "leviathan") {
			if command == "get all" {
				leviathanAfterGearGetAll = true
				leviathanDivesAfterGear = 0
			} else if leviathanAfterGearGetAll && command == "turn on flashlight" {
				for range 4 {
					extra := wt
					extra.Command = "go up"
					repaired = append(repaired, extra)
				}
			} else if leviathanAfterGearGetAll && command == "dive" {
				leviathanDivesAfterGear++
				repaired = append(repaired, wt)
				if leviathanDivesAfterGear == 1 {
					extra := wt
					extra.Command = "open canister"
					repaired = append(repaired, extra)
				}
				continue
			} else if leviathanAfterGearGetAll && command == "open canister" {
				continue
			}
		}
		if branch == "sao" && strings.Contains(sectionLower, "sao vera") && command == "go south" {
			saoMaryMargaretSouths++
			repaired = append(repaired, wt)
			if saoMaryMargaretSouths == 2 {
				for _, command := range []string{"eat stew", "drink water"} {
					extra := wt
					extra.Command = command
					repaired = append(repaired, extra)
				}
			}
			continue
		}
		repaired = append(repaired, wt)
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
		return []string{"johnny, latitude is 25", "johnny, longitude is 25"}
	}
	if branch == "sao-ocean" {
		return []string{"johnny, latitude is 41", "johnny, longitude is 45"}
	}
	return []string{"johnny, latitude is 40", "johnny, longitude is 45"}
}

func cutthroatsCoordinateSequence(branch string) []string {
	if branch == "sao" || branch == "sao-ocean" {
		return cutthroatsCoordinateCommands(branch)
	}

	commands := []string{
		"go south", "go south", "go up", "go north",
		"wait", "wait", "wait", "wait", "wait",
		"wait", "wait", "wait", "wait",
	}
	commands = append(commands, cutthroatsCoordinateCommands(branch)...)
	commands = append(commands, "go south", "go down", "go north", "drink water", "go north")
	return commands
}

func cutthroatsPostCoordinateBoatHandoff(_ string) []string {
	return []string{
		"wait", "wait", "wait", "wait",
		"lie down", "wait", "stand",
		"get all", "go north", "go north",
	}
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
	if strings.EqualFold(room.Title, "Aft Deck") && strings.Contains(text, "compressor") {
		actions = append(actions, "dive")
	}
	if strings.EqualFold(room.Title, "Underwater") {
		actions = append(actions, "open canister", "dive")
	}
	return actions
}
