# IF With Graphics (IFWG)

**IF With Graphics** brings AI-generated artwork to classic text adventure games. Load any Z-machine story file, play it as a text adventure, and watch Apple II-style pixel art appear for each room you visit. Images are generated on the fly and cached locally so they never repeat.

> Image generation requires an API key. Games with pre-rendered artwork play without one.

---

<p align="center">
  <img src="assets/screenshot.png" width="90%">
  <br>
  <i>West of House - Zork I</i>
</p>

<p align="center">
  <img src="assets/screenshot2.png" width="90%">
  <br>
  <i>The Troll Room - Zork I</i>
</p>

---

## What It Is

Classic interactive fiction is rich, strange, and deeply atmospheric. This project explores what happens when those worlds are illustrated without losing the feel of the original parser experience.

The aesthetic is deliberately retro: limited palettes, dithered pixel art, scan-line overlays, and a layout that feels closer to an Apple IIe than a modern game. The text adventure experience stays at the center. The artwork frames it.

---

## Features

- A curated library of games with pre-generated artwork (Zork I–III, Planetfall,
  Cutthroats) that play instantly in the browser with no API key
- Drag and drop any Z-machine story file (`.z3`, `.z5`, `.z8`, and other formats) and play
- AI image generated for each room, cached locally in the browser
- Save and restore work transparently via normal game commands (`SAVE` / `RESTORE`,
  stored in the browser)
- Two image generation providers: OpenAI and Google Gemini
- Status bar, animated room transitions, retro disk LED while images load
- Scales to any viewport size
- Full-screen forms and menus — filling out Bureaucracy's licence application, or
  building a character in Beyond Zork — render as a faithful, properly laid-out
  screen with a real cursor, not garbled text
- Persistent status readouts (like a character's stats in Beyond Zork) stay on
  screen continuously instead of flickering in and out between turns
- Small in-game "sensory" cues — a scenery/exit icon a game draws alongside the
  room text — get their own dedicated display instead of getting spliced into
  the story prose
- Handles games that don't structure their status bar or room titles the
  normal way (a persistent "Mode" indicator instead of a room name, addresses
  built from text the player typed in) so images still track the right room

**Supported games:**

| Version | Examples |
|---------|----------|
| V1-V3 | Zork I/II/III, Hitchhiker's Guide, Planetfall, Wishbringer, Enchanter |
| V4 | Trinity, A Mind Forever Voyaging, Bureaucracy |
| V5 | Beyond Zork |
| V6 | Not yet supported (Zork Zero, Shogun, Journey — these use a fully custom windowing system with no standard status line) |

---

## Image Generation

Images are generated using an Apple II dithered pixel art prompt paired with reference images to lock in the aesthetic. Results are cropped, compressed to WebP, and cached in IndexedDB. Once an image exists for a room it is never regenerated unless you clear the cache.

**Which provider looks best?**

OpenAI (`gpt-image-2-2026-04-21`) produces the most convincing retro pixel art. The April 2026 release in particular does excellent style transfer from the reference images and is the recommended choice for the classic Apple II theme.

Gemini is faster and cheaper and works well for a more painterly or cinematic look, but does not match the pixel art fidelity of the OpenAI model for this use case.

---


## Roadmap

- Slash commands (`/restart`, `/regen`, `/export`, `/help`) intercepted before they reach the interpreter
- Expanding the pre-generated game library and the browsable game catalog
- Theme system so the visual style is swappable without touching core code
- Embeddable export packages with a standalone launcher
- V6 support (Zork Zero, Shogun, Journey)

---

## License

License information has not been finalized yet.
