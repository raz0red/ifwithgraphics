package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/raz0red/ifwithgraphics/tools/explorer/internal/frotz"
)

type enchanterGame struct {
	baseGame
}

// templeRoomID is the temple floor between the two tower cells.
const templeRoomID = 122

// The Control Room southeast of the Engine Room is deliberately not pursued
// here. Its only approach is across the Infernal Machine, and the hammer kills
// anyone who tries: across every run the player died 870 times out of 870
// attempts, while the turtle (which the walkthrough hastens with exex and sends
// on the errand) crossed safely 292 times, saved by its shell as much as its
// speed. Hastening the player instead does not help, because exex will not stay
// committed to memory for the cast. The room's own text describes the approach
// as machinery "which would surely crush you if you were to attempt to enter
// it", and its description has never once been printed by the game. It is
// turtle-only by design, so 73 rooms is the reachable total.

// StatefulSequences opens the temple's cell doors.
//
// The temple has a cell door to the north and another to the south, and both
// start closed. Neither is mentioned in the room description — the game prints
// the bare word "Temple" and nothing else — so the generic contextual-action
// heuristic in contextualActions(), which only adds "open door" when the room
// text contains "door", never tries to open either one. The doors announce
// themselves solely in the refusal message when you walk into them ("The south
// cell door is closed."), which the heuristic never reads.
//
// The north cell is the one the walkthrough already reaches, by being captured
// at the Junction and thrown in. The south cell has no other route in, so
// without this it stays undiscovered. Opening the door and stepping through
// takes two commands, hence a sequence rather than a contextual action.
//
// A plain "open" is enough from the temple side; the rezrov spell is not
// needed, despite the north door reporting itself "locked from the outside"
// when tried from inside the cell.
func (enchanterGame) StatefulSequences(room *frotz.Room) []actionSequence {
	if room == nil || room.ID != templeRoomID {
		return nil
	}
	return []actionSequence{
		{Name: "temple-south-cell-open", Commands: []string{"open south cell door", "s"}},
		{Name: "temple-north-cell-open", Commands: []string{"open north cell door", "n"}},
	}
}

// probeInventoryDone gates the temporary Map Room inventory diagnostic.
var probeInventoryDone bool

// probeInventory inspects the player's state at the Map Room (temporary
// diagnostic) and restores the save afterwards so the walkthrough continues.
func (e *Explorer) probeInventory(current *frotz.Room) {
	if current.ID == 0 {
		return
	}
	probe := func(cmd string) string {
		room, err := e.sendAndRead(cmd)
		if err != nil {
			return fmt.Sprintf("<err: %v>", err)
		}
		return strings.TrimSpace(room.Description)
	}
	log.Printf("PROBE-INV at %s [id=%d]:\n%s", current.Title, current.ID, probe("inventory"))
	if _, sp, serr := e.saveGame(current); serr == nil {
		others := []string{"sacrificial dagger", "battered lantern", "bread", "jug", "black candle", "brittle scroll", "badly worn pencil"}
		dropAll := func() {
			for _, item := range others {
				p := probe("drop " + item)
				_ = p
			}
		}
		// drop all except the book, then get map (measures book+map vs 100)
		dropAll()
		log.Printf("PROBE-MEASURE all-but-book => get map: %s", probe("get map"))
		if _, rerr := e.restoreGame(sp); rerr != nil {
			log.Printf("PROBE restore failed: %v", rerr)
		}
		// add back one item at a time
		for _, item := range others {
			dropAll()
			probe("get " + item)
			res := probe("get map")
			log.Printf("PROBE-MEASURE book + %-14q => get map: %s", item, res)
			if _, rerr := e.restoreGame(sp); rerr != nil {
				log.Printf("PROBE restore failed: %v", rerr)
			}
		}
	} else {
		log.Printf("PROBE-INV save failed: %v", serr)
	}
}

// AdjustCommand gives Enchanter's spells their required targets. The parser
// rejects a bare "melbor" and "izyuk" with "That spell requires a target.";
// the walkthrough transcribes both without one, so replay needs to append the
// implicit self-target.
func (enchanterGame) AdjustCommand(command string, _ *frotz.Room) string {
	switch strings.ToLower(strings.TrimSpace(command)) {
	case "melbor":
		return "melbor me"
	case "izyuk":
		return "izyuk me"
	default:
		return command
	}
}

// isZifmiaSummon reports whether command is the adventurer summoning cast (as
// opposed to "gnusto zifmia"/"learn zifmia", which merely study the spell).
func isZifmiaSummon(command string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(command)), "zifmia ")
}

// RecoverStep keeps the mirror-halls summon on schedule. The adventurer NPC
// patrols on a randomized timer, so the walkthrough's "zifmia adventurer" step
// can land while he is elsewhere; the cast then fails with the Thaumaturgy 201
// note ("summoning of beings works only if the being can be seen"). A cast —
// even a failed one — costs the spell, so recovery must undo it: restore the
// pre-step save (taken on arrival at the halls, before the spells were
// studied), re-study the mirror spells, and then wait until he stops before
// the glass before summoning him. The walkthrough's following "vaxum
// adventurer" step calms him.
func (enchanterGame) RecoverStep(e *Explorer, before, next *frotz.Room, command, savePath string) (*frotz.Room, error) {
	if next == nil || !isZifmiaSummon(command) {
		return next, nil
	}
	if strings.Contains(next.Description, "appears before you") {
		return next, nil
	}
	if savePath == "" {
		return next, nil
	}
	for attempt := 0; attempt < 2; attempt++ {
		if _, err := e.restoreGame(savePath); err != nil {
			return next, err
		}
		if err := reStudyMirrorSpells(e); err != nil {
			return next, err
		}
		summoned, err := summonAdventurer(e)
		if err != nil {
			return next, err
		}
		if summoned != nil {
			return summoned, nil
		}
	}
	return next, fmt.Errorf("adventurer never stopped in the mirror halls at %s [id=%d]", before.Title, before.ID)
}

// reStudyMirrorSpells re-runs the walkthrough's own spell studies, which the
// restore undid. All four are deterministic from the restored save, so the
// adventurer's patrol picks up exactly where the failed attempt left off.
func reStudyMirrorSpells(e *Explorer) error {
	for _, cmd := range []string{"learn zifmia", "learn melbor", "learn vaxum", "melbor me"} {
		if _, err := e.sendAndRead(cmd); err != nil {
			return fmt.Errorf("re-study %q: %w", cmd, err)
		}
	}
	return nil
}

// summonAdventurer waits in the halls until the adventurer comes into view
// behind the mirror, then summons him. It returns (nil, nil) if he never
// stops within the window, letting the caller retry from a fresh restore.
func summonAdventurer(e *Explorer) (*frotz.Room, error) {
	for w := 0; w < 40; w++ {
		room, err := e.sendAndRead("wait")
		if err != nil {
			return nil, err
		}
		if !strings.Contains(room.Description, "comes into view") {
			continue
		}
		summoned, err := e.sendAndRead("zifmia adventurer")
		if err != nil {
			return nil, err
		}
		if strings.Contains(summoned.Description, "appears before you") {
			return summoned, nil
		}
		if strings.Contains(summoned.Description, "committed to memory") {
			return nil, fmt.Errorf("zifmia forgotten before the adventurer appeared")
		}
	}
	return nil, nil
}
