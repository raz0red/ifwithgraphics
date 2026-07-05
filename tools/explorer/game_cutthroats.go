package main

import (
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

type cutthroatsGame struct {
	baseGame
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
