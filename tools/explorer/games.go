package main

import "github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"

// Game IDs are release.serial, as read from the story file header by
// readGameID. See tools/explorer/games/<name>/bfs.json for the recorded ID
// of each game already being explored.
const (
	zork1GameID      = "119.880429"
	zork2GameID      = "63.860811"
	zork3GameID      = "25.860811"
	planetfallGameID = "29.840118"
)

// Game encapsulates every piece of per-game special-casing the explorer
// needs. Every method has a no-op default via baseGame, so a concrete game
// only needs to override what it actually requires. Dispatch is keyed by
// the gameID read from the story file, not by filename or room-title
// checks scattered through the generic engine.
type Game interface {
	// ContextualActions returns extra actions appended to the generic
	// exploration actions for a room (window/boat/tree/etc. pattern
	// matching already covers most games; this is for anything beyond
	// that shared vocabulary).
	ContextualActions(room *frotz.Room) []string

	// StatefulSequences returns known state-dependent action sequences to
	// try at a room during BFS exploration.
	StatefulSequences(room *frotz.Room) []actionSequence

	// RepairWalkthrough post-processes a parsed walkthrough to fix known
	// transcription/emulation issues for this game.
	RepairWalkthrough(commands []walkthroughCommand) []walkthroughCommand

	// AdjustCommand rewrites a single walkthrough command based on
	// internal state this game has been tracking (see Observe).
	AdjustCommand(command string, room *frotz.Room) string

	// Observe lets a game track any internal state it needs as rooms are
	// visited during walkthrough replay.
	Observe(room *frotz.Room)

	// SaveAtWalkthroughStart reports whether runWalkthrough/
	// runWalkthroughToRoom should save immediately at the starting room.
	SaveAtWalkthroughStart() bool

	// ShouldSaveAfterStep reports whether the walkthrough engine should
	// save after a step, given whether that step actually moved the
	// player to a new room.
	ShouldSaveAfterStep(moved bool) bool

	// ShouldTriggerStatefulSequence reports whether tryStatefulSequences
	// should be triggered mid-walkthrough for this room/command pair.
	ShouldTriggerStatefulSequence(room *frotz.Room, command string) bool

	// ShouldRetryStep reports whether a step that landed on `next` (having
	// started at `before` via `command`) should be retried once more.
	ShouldRetryStep(before, next *frotz.Room, command string) bool

	// ShouldPreserveSave reports whether an existing save for this room
	// should be kept rather than overwritten (e.g. Zork III's Flathead
	// Ocean, whose description changes once the sailor event fires).
	ShouldPreserveSave(room *frotz.Room) bool
}

// baseGame implements Game with no-op defaults. Concrete games embed it and
// override only the methods they need.
type baseGame struct{}

func (baseGame) ContextualActions(*frotz.Room) []string                        { return nil }
func (baseGame) StatefulSequences(*frotz.Room) []actionSequence                { return nil }
func (baseGame) RepairWalkthrough(c []walkthroughCommand) []walkthroughCommand { return c }
func (baseGame) AdjustCommand(command string, _ *frotz.Room) string            { return command }
func (baseGame) Observe(*frotz.Room)                                           {}
func (baseGame) SaveAtWalkthroughStart() bool                                  { return true }
func (baseGame) ShouldSaveAfterStep(bool) bool                                 { return true }
func (baseGame) ShouldTriggerStatefulSequence(*frotz.Room, string) bool        { return false }
func (baseGame) ShouldRetryStep(_, _ *frotz.Room, _ string) bool               { return false }
func (baseGame) ShouldPreserveSave(*frotz.Room) bool                           { return false }

var gameRegistry = map[string]func() Game{
	zork1GameID:      func() Game { return &zork1Game{} },
	zork2GameID:      func() Game { return &zork2Game{} },
	zork3GameID:      func() Game { return &zork3Game{} },
	planetfallGameID: func() Game { return &planetfallGame{} },
}

// gameFor looks up the Game implementation for a gameID, falling back to
// the generic no-op baseGame for any unrecognized game (so adding a new
// game that needs no special-casing at all requires no registry change).
func gameFor(gameID string) Game {
	if ctor, ok := gameRegistry[gameID]; ok {
		return ctor()
	}
	return &baseGame{}
}

// shuttleProber is an optional capability implemented only by games with a
// timed-vehicle puzzle worth probing exhaustively (currently Planetfall's
// shuttle). main() type-asserts against this rather than the Game
// interface carrying a method only one game will ever implement.
type shuttleProber interface {
	ProbeShuttle(e *Explorer, walkthroughPath string) error
}
