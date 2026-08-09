package main

import (
	"slices"
	"testing"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

// The positive cases are refusals these games actually printed, taken from the
// DFS logs that the per-game door tables in game_witness.go and
// game_enchanter.go were originally built from. The negative cases are the
// reason the patterns are narrow: each obstacle costs two save/restore round
// trips, so matching ordinary prose is not merely untidy, it is slow.
func TestRefusalObstacles(t *testing.T) {
	tests := []struct {
		name string
		text string
		want []string
	}{
		{
			name: "witness names the door only in the refusal",
			text: "Too bad, but the tub door is closed.",
			want: []string{"tub door"},
		},
		{
			name: "disambiguation offers both doors",
			text: "(Which door do you mean, the garage door or the workshop door?)",
			want: []string{"garage door", "workshop door"},
		},
		{
			name: "possessive door name",
			text: "Too bad, but the butler's door is closed.",
			want: []string{"butler's door"},
		},
		{
			name: "locked rather than closed",
			text: "The front gate is locked.",
			want: []string{"front gate"},
		},
		{
			name: "open it first",
			text: "You'll have to open the trap door first.",
			want: []string{"trap door"},
		},
		{
			name: "go through the closed door",
			text: "You can't go through the closed door.",
			want: []string{"door"},
		},
		{
			name: "a plain room description names nothing to open",
			text: "This is a hallway. There are exits to the north and east.",
			want: nil,
		},
		{
			name: "a closed room is not an exit to force",
			text: "The kitchen is closed.",
			want: nil,
		},
		{
			name: "ordinary blocked-move prose",
			text: "You cannot go that way.",
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := refusalObstacles(tt.text)
			if !slices.Equal(got, tt.want) {
				t.Errorf("refusalObstacles(%q)\n got %q\nwant %q", tt.text, got, tt.want)
			}
		})
	}
}

// An obstacle is only useful paired with the direction that hit it, and the
// open has to be its own command with the move still to come.
func TestRefusalSequences(t *testing.T) {
	seqs := refusalSequences("tub door", "e")
	if len(seqs) != 2 {
		t.Fatalf("got %d sequences, want 2", len(seqs))
	}
	if got, want := seqs[0].Name, "refusal-open-tub-door-e"; got != want {
		t.Errorf("name = %q, want %q", got, want)
	}
	if got := seqs[0].Commands; !slices.Equal(got, []string{"open tub door", "e"}) {
		t.Errorf("open commands = %q", got)
	}
	if got := seqs[1].Commands; !slices.Equal(got, []string{"unlock tub door", "open tub door", "e"}) {
		t.Errorf("unlock commands = %q", got)
	}
}

// The same door named by two different blocked exits is two retries, but the
// same door named twice by one exit is one.
func TestRecordRefusalDeduplicates(t *testing.T) {
	e := &Explorer{refusals: make(map[int][]refusalHint)}
	e.recordRefusal(42, "e", "Too bad, but the tub door is closed.")
	e.recordRefusal(42, "e", "Too bad, but the tub door is closed.")
	e.recordRefusal(42, "n", "Too bad, but the tub door is closed.")
	e.recordRefusal(0, "n", "Too bad, but the tub door is closed.")

	if got := len(e.refusals[42]); got != 2 {
		t.Errorf("got %d hints, want 2: %+v", got, e.refusals[42])
	}
	if got := len(e.refusals[0]); got != 0 {
		t.Errorf("recorded a hint for an unidentified room: %+v", e.refusals[0])
	}
}

// Only a movement direction is a way out. The action list also carries
// contextual commands, and pairing an obstacle with "open door" once produced
// the sequence "unlock garage door, open garage door, open door", which moves
// nowhere.
func TestRecordRefusalIgnoresNonDirections(t *testing.T) {
	e := &Explorer{refusals: make(map[int][]refusalHint)}
	e.recordRefusal(102, "open door", "(Which door do you mean, the garage door or the workshop door?)")
	if got := len(e.refusals[102]); got != 0 {
		t.Errorf("recorded non-direction hints: %+v", e.refusals[102])
	}

	e.recordRefusal(102, "n", "Too bad, but the garage door is closed.")
	if got := len(e.refusals[102]); got != 1 {
		t.Fatalf("got %d hints for a real direction, want 1", got)
	}
}

// A hint is retried a bounded number of times. tryStatefulSequences clears a
// room's tried-set after recursing, so a hint that regenerated its sequences
// every pass looped until the depth limit killed the walk. This is that
// regression, and it also pins the budget: unbounded loops, zero never
// reopens a door that only unlocks later.
func TestRefusalSequencesRetryBudget(t *testing.T) {
	e := &Explorer{refusals: make(map[int][]refusalHint)}
	room := &frotz.Room{ID: 185, Title: "bathroom"}
	e.recordRefusal(room.ID, "e", "Too bad, but the tub door is closed.")

	names := map[string]bool{}
	for pass := 1; pass <= refusalRetryBudget; pass++ {
		seqs := e.refusalSequencesFor(room)
		if len(seqs) != 2 {
			t.Fatalf("pass %d gave %d sequences, want 2", pass, len(seqs))
		}
		for _, s := range seqs {
			if names[s.Name] {
				t.Errorf("duplicate sequence name %q would be skipped as already tried", s.Name)
			}
			names[s.Name] = true
		}
	}
	if after := e.refusalSequencesFor(room); len(after) != 0 {
		t.Errorf("exceeded the budget with %d more sequences: %+v", len(after), after)
	}
}
