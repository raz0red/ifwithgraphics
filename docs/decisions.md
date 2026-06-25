# Decisions

Key decisions so future contributors understand why the repo is shaped the way it is.

---

## Format: Z-machine / Z-code

Start with Z-machine story files (`.z1`–`.z8`).

Z-code is the most widely supported classic IF format, with a published specification and mature C interpreters. Zork I was the first test case. Frotz (dumb frontend) compiled via Emscripten is the interpreter.

## Browser-first, Zero Install

Compile C tooling with Emscripten; expose everything to JavaScript through Emscripten's in-memory filesystem (MEMFS). Users drag a story file into the browser — no native runtime, no server.

## Builder / Player Separation

The builder (`builder/`) is a debug/inspection UI for the WASM bridge. The player (`player/`) is the runtime the end user actually plays. They share the same WASM binary but the builder is never shipped with a game.

## Embeddable Player Widget

`IFWGPlayer.create(div, config)` renders only the game viewport (status bar, scene image, scene text, command input). It returns `{ loadGame(source) }` and nothing else.

All launcher chrome — drop zone, file picker, drag/drop wiring, settings panel — lives in the host HTML page. Multiple top-level HTML files can share the player library and each own their own launch experience (standalone, embed, webRcade, etc.).

## Config as Lifecycle Hooks Only

`IFWGConfig` has four methods: `getWasmPath`, `onSave`, `onRestore`, `onGameLoaded`. All four are called by the player module into the config — never the other way around.

Image settings are not on the config because the player module never reads them. `ImageGen` owns its own settings through `ImageGenSettings` / `getSettings()` / `setSettings()`, persisted to localStorage.

## Game Identity via Z-machine Header

The game ID is `release.serial` read directly from the raw story file bytes before anything is written to MEMFS:

```
release = bytes[0x02..0x03]  (16-bit big-endian)
serial  = bytes[0x12..0x17]  (6 ASCII chars)
id      = release + "." + serial   →  "119.870917" for Trinity
```

SHA-256 of the file was the original approach but is packaging-dependent — the same game repackaged produces a different hash, breaking the image cache. The Z-machine header fields are stable across packaging formats.

## IndexedDB Key Structure

One IndexedDB database (`ifwg`), one object store (`data`), game-scoped key prefix for all entries:

```
<gameId>/saves/<basename>    →  save file bytes (Uint8Array)
<gameId>/images/<roomId>     →  generated image (data URL)
```

`DB` in `js/db.js` reads the current game ID from the `Game` singleton and prepends it automatically. Nothing in the storage layer needs to know which game is loaded.

## Save / Restore via C-side Hook

The player types `save` and `restore` as normal game commands — no JS-level interception.

On the C side: `fastmem.c` fires `window.ifwgOnSave(filename)` via `EM_ASM` after a successful `z_save`. `dinput.c` silently accepts the default filename for save/restore under Emscripten (no filesystem prompt). JS reads the bytes from MEMFS and persists to IndexedDB. On the next `loadGame`, the save bytes are written back into MEMFS before the engine starts.

## Image Cache Always Checked First

`ImageGen.generate()` checks IndexedDB before anything else. API generation is only attempted on a cache miss when the caller passes an `onCacheMiss` callback (which `core.js` only does when the room description is ≥ 25 words). This means:

- Cached images are served after `restore` even though frotz only prints `"Ok."` (1 word)
- Cached images are served with no API key configured
- Short descriptions (cutscenes, transitions) never trigger an API call but still surface cached art

## JS Source Layout

All player JavaScript lives under `player/js/`. `player/index.html` (standalone launcher) and `player/player.css` stay at the root. Prompt reference images are in `player/prompt/`.

The barrel `player/js/index.js` is the esbuild entry point. `npm run build` in `player/` produces a minified ESM bundle at `player/dist/ifwg-player.js`. `index.html` has both the dev (individual modules) and prod (bundle) import variants side by side, one commented out.
