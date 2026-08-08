# Canonical backfill: Zork I–III and Planetfall

Status: **not started**. This is the next substantial piece of work.

Zork I, Zork II, Zork III and Planetfall were explored and illustrated before
the room-ID-keyed image system existed. They have no `canonicalGameId` and no
`id/` image directories, so every room that shares a title with another room
shares its picture. Cutthroats, Wishbringer, Infidel, Enchanter and (once
generated) The Witness all use the newer scheme.

## Where things stand

Measured with `task zcompare` on 2026-08-08.

| Game | Rooms found | Z-machine rooms | Missing | Rooms collapsed onto shared art | Images now | Images if canonical |
| --- | --- | --- | --- | --- | --- | --- |
| zork1 | 108 | 110 | 2 | **32** | 78 slug, 0 id | 110 id |
| zork2 | 81 | 86 | 5 | 8 | 78 slug, 0 id | 86 id |
| zork3 | 55 | 89 | **34** | 13 | 57 slug, 0 id | 89 id |
| planetfall | 92 | 105 | 13 | not yet counted | 100 slug, 0 id | 105 id |

For contrast, the games already on the newer scheme:

| Game | Rooms | canonicalGameId | id images |
| --- | --- | --- | --- |
| cutthroats | 68 | 23.840809 | 68 |
| wishbringer | 52 | 69.850920 | 52 |
| infidel | 77 | 22.830916 | 77 |
| enchanter | 74 | 29.860820 | 74 |
| witness | 28 | not set yet | not generated yet |

## The two problems are separate

### 1. Going canonical (cheap, high value)

`tools/imagegen` already writes `player/images/<game>/id/<roomId>.webp` for
every room unconditionally. The Zorks have none purely because they were
generated before that behaviour existed. So this is a re-run plus one line in
`player/src/context/games.json`, with no explorer work at all.

**Most of the existing art can be kept.** Regenerating everything is not
necessary: where a room's title is unique within its game, the existing
`<slug>.webp` *is* that room's picture, so it can simply be copied to
`id/<roomId>.webp` at no cost. Only duplicate-titled rooms need new art, and
even then one room per title group can keep the existing image.

Measured 2026-08-08:

| Game | Rooms | Reusable as-is | Need generating | Orphan slugs |
| --- | --- | --- | --- | --- |
| zork1 | 108 | 76 | 32 | 2 |
| zork2 | 81 | 73 | 8 | 5 |
| zork3 | 55 | 42 | 13 | 15 |
| planetfall | 92 | **91** | **1** | 14 |
| **total** | **336** | **282** | **54** | 36 |

Every current room's title already has an image (no missing slugs), so the
reuse path has no gaps. This takes the estimate from ~390 API calls down to
**54**, plus whatever the currently-missing rooms need once they are explored.

Two caveats:

- For a duplicated title, the existing image was generated from **one** of
  those rooms' descriptions, and which one is not recorded. Assigning it to the
  first room with that title in `bfs.json` is a reasonable convention, but it
  is a convention, not a fact.
- The orphan slugs are images whose titles no longer appear in `bfs.json`,
  left over from earlier exploration runs. Harmless, but they are why the slug
  counts exceed the unique-title counts.

The backfill is a small script: walk `bfs.json`, and for each room copy
`player/images/<game>/<slug(title)>.webp` to
`player/images/<game>/id/<roomId>.webp` when the title is unique or the room is
the first of its group. Then run `imagegen` normally, which skips every `id/`
file that now exists and generates only the remainder.

The payoff is concentrated in the duplicate titles:

- **zork1** — 15x `Maze`, 5x `Dead End`, 5x `Frigid River`, 4x `Forest`,
  4x `Coal Mine`. 32 rooms currently share 5 pictures.
- **zork2** — 9x `Oddly-angled Room`.
- **zork3** — 8x `Land of Shadow`, plus pairs of `Dark Place`,
  `Museum Entrance`, `Technology Museum`, `Jewel Room`, `Hallway`.

Note the Zork I maze in particular: fifteen rooms that are meant to feel
disorienting but currently look identical, which is arguably fine, so decide
deliberately rather than by default. Wishbringer's four `Underground` rooms
were split via `variants.json`; the same option exists here.

### 2. Re-exploring (expensive, only Zork III really needs it)

Zork III is missing 34 of 89. They fall into two clusters rather than being
scattered:

- **The Royal Puzzle** — `84 Royal Puzzle Entrance`, nine `Narrow Room`
  entries, `130 Side Room`. This is the sliding-sandstone-block puzzle where
  you move by pushing walls, so compass-direction DFS structurally cannot
  enumerate it. Needs `StatefulSequences` in a `zork3Game` driver.
- **Museum / Machine area** — `5 Technology Museum`, `173 Museum Entrance`,
  `70 Machine Room`, `20 Ladder Top`, `57 Ladder Bottom`, `36 Parapet`, plus a
  corridor-and-cell ring (`19`, `43`, `162`, `190`, three `Hallway`, three
  `Prison Cell`). Mostly behind the time-travel and mirror-box sequences.

Some entries are not real rooms and should not be chased: `138 Dead End`
answers "If you insist.... Poof, you're dead!", `162 West Corridor` is the
string "West  +", and `46 Treasury of Zork` is the endgame. Compare The
Witness, where `221 limbo` and `239 [X]` are similar artefacts — its true
total is 28 of 30.

## Do this first: refusal-driven contextual actions

The single highest-value change in the explorer, and it should come **before**
any Zork III driver work, because it may retire a chunk of those 34 on its own.

`contextualActions()` in `tools/explorer/main.go` only offers `open door` when
the word "door" appears in the **room description**. Blocked exits announce
themselves in the **refusal message** instead, which nothing reads. This has
now cost real rooms twice:

- **Enchanter** — the temple prints the bare word `Temple`, but walking north
  or south replies "The north/south cell door is closed." Cost 1 room
  (`54 Cell`), fixed with a per-game `StatefulSequences`.
- **The Witness** — 7 of 28 rooms sat behind doors named only in refusals
  ("Too bad, but the tub door is closed"). Fixed with a 7-entry door table in
  `game_witness.go`, built by grepping the refusals the DFS itself logged.

Zork III's corridor-and-cell ring is exactly this shape. A generic fix would
likely retire both per-game door tables as well.

**Design note:** a bare `open door` is not always enough. Where a room has two
doors the parser asks for disambiguation, e.g. the Witness garage replies
"(Which door do you mean, the garage door or the workshop door?)". So the
generic version needs to extract the door's *name* from the refusal, not just
notice that one exists. The refusals are highly regular:

```
Too bad, but the <name> is closed.
The <name> is closed.
You'll have to unlock it first.
```

## Suggested order

1. **Refusal-driven contextual actions** (generic, retires per-game tables,
   may reduce Zork III's 34 before anyone writes a driver).
2. **Zork I canonical** — biggest win per API call, no explorer work, flagship
   game. ~110 calls.
3. **Zork II canonical** — ~86 calls.
4. **Planetfall** — investigate its 13 missing *before* regenerating, or the
   re-run is wasted. ~105 calls.
5. **Zork III last** — needs the Royal Puzzle driver first, otherwise you pay
   for images twice. ~89 calls.

Rough total if all four are done: **54 API calls** for the duplicate-titled
rooms, plus generation for the 54 currently-missing rooms once they are
explored, plus explorer work for Zork III. The naive "regenerate everything"
figure would have been 390, so the reuse step is worth doing first.

## Also sweep: bad captures

An audit of every `bfs.json` on 2026-08-08 found a small number of rooms whose
recorded description is wrong or useless. These produce art generated from the
wrong text, so they are worth fixing during the backfill.

**Stubs — the description is just the room name:**

| Room | Note |
| --- | --- |
| `zork3 98 Button Room` | the Zork III walkthrough logs "walkthrough target miss at step 162: could not reach walkthrough target Button Room", so it was never properly entered. Its image is an invented wall of coloured buttons and is wrong. Fixing it falls out of fixing the Zork III walkthrough. |
| `enchanter 122 Temple` | the same empty description hid the two cell doors and cost room 54 until a per-game sequence was added |
| `witness 132 hallway` | captured on a revisit after the game switched to short prompts |

**Wrong room — the text belongs to a different room:**

| Room | Note |
| --- | --- |
| `witness 168 living room` | holds the hallway's description. Phong escorts you two rooms in one turn, so the accumulated text starts in the hallway while global 0 already reads living room |

The Witness is the only game with the escort failure; it needs a game that moves
you between rooms within a single turn.

**Accurate but useless — dark rooms.** Several Zork I, Zork II and Zork III
rooms were captured without a light source, so their description is "You have
moved into a dark place. It is pitch black. You might be eaten by a grue."
(`zork1 30 Sandy Beach`, `zork1 155 Sandy Cave`, `zork3 177/155 Dark Place`,
`zork2 207 Room 8`, others). The capture is correct; the art generated from it
cannot be. Re-capture these with a lamp lit during the backfill.

**Root cause for stubs and escorts.** `Room.Description` is "every row that
changed since the last prompt", while `roomId` is read from global 0 at prompt
time. The two disagree whenever a turn spans rooms, and the buffer is nearly
empty when a revisit reprints only the room name. `trimToTitle` in
`tools/explorer/main.go` is meant to handle the first case but requires the
title alone on its own line, which games using `(living room)` or "You are now
in the living room." never satisfy.

Two candidate fixes, both general:

- Teach `trimToTitle` the `(name)` and "You are now in the name" forms.
- When a captured description is no longer than the room title, send `look` and
  use that instead. Note this costs a turn, which matters in clock-driven games
  like The Witness and Deadline, so it should probably be opt-in per game.

## Mechanics worth remembering

- `task zcompare story=<path> bfs=<path>` reports Z-machine rooms versus
  discovered, and prints the description of anything missing. Its descriptions
  come from the **static story-file string** and are not what the game prints:
  it has been caught wrong three times (Enchanter rooms 47, 156 and 54). Use it
  to find *which* rooms are missing, never for their text.
- `imagegen` skips any room whose `id/<roomId>.webp` already exists, so runs
  are resumable and a second pass only fills gaps.
- `imagegen` has **no retry**. A failed call drops that room for the run, and
  `concurrency=4` reliably loses about two rooms to rate limits. Use
  `concurrency=2`, or re-run to fill gaps. Adding bounded retry with backoff on
  429/5xx is a small, worthwhile change.
- `limit=N` is racy: the check happens before `done` is incremented, so
  `concurrency` workers can all start at once. `limit=2 concurrency=3` produced
  4 images. Keep `concurrency <= limit`, or point `rooms=` at a subset file.
- The explorer's `-loop` mode accumulates across runs and only ever adds rooms,
  so it cannot regress an existing `bfs.json`. It never exits on its own.
- Story files live in gitignored `tmp*/` directories and are not committed.
