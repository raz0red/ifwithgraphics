# IF With Graphics (IFWG)

**IF With Graphics** brings artwork to your classic IF adventure games. Load any Z-machine story file, play it as a text adventure, and watch Apple II-style pixel art appear for each room you visit — generated on the fly and cached locally so it never repeats.

> Image generation requires an image gen API key. Games with pre-rendered artwork play without one.

---

<p align="center">
  <img src="assets/screenshot.png" width="90%">
  <br>
  <i>West of House — Zork I</i>
</p>

<p align="center">
  <img src="assets/screenshot2.png" width="90%">
  <br>
  <i>The Troll Room — Zork I</i>
</p>

---

## What It Is

Classic interactive fiction is rich, strange, and deeply atmospheric. This project explores what happens when those worlds are illustrated without losing the feel of the original parser experience.

The target aesthetic is deliberately retro: limited palettes, dithered pixel art, scan-line overlays, and a layout that feels closer to an Apple IIe than a modern game UI. The original text adventure interaction stays at the center — the artwork frames it, not the other way around.

---

## Current State

The player is fully functional. You can drag and drop any Z-machine story file (`.z1`–`.z5`) and play it end to end.

**Working now:**
- Z-machine interpreter via [frotz](https://gitlab.com/DavidGriffith/frotz) compiled to WebAssembly (Emscripten)
- Room detection for V1–V3 games (spec-mandated global 0) and V4+ games (object name lookup)
- AI image generation via OpenAI or Gemini — Apple II dithered pixel art, one image per room; automatic retry (up to 2 retries) on API failure
- Room image caching in IndexedDB — images stored as WebP (0.9 quality); old PNG cache entries automatically migrated on first access; never regenerated unless cleared
- **Save/restore** — C-side `EM_ASM` hook fires after `z_save`; save bytes persisted to IndexedDB and pre-populated into MEMFS on next load; fully transparent to the player (one slot per game)
- **Stable game ID** — Z-machine header `release.serial` (e.g. `"119.870917"` for Trinity); stable across different packaging formats, no file hashing
- **Embeddable player widget** — `IFWGPlayer.create(div, config)` returns `{ loadGame(source) }`; launcher UI (drop zone, settings) lives in the host page, not the player module
- **Game prompt capture** — when a game prints an inline prompt before waiting for input (e.g. Wishbringer's `(Please type YES or NO.)`), it is captured from the Z-machine screen buffer and displayed in the command row in place of the normal `>` prompt
- **Description debounce** — some games yield the same room multiple times in quick succession (preamble text before the actual room description); a 150 ms settling window ensures image generation always uses the final, complete description
- Animated slide transitions between rooms, blind-reveal for new images
- Line-snapped text pagination (SPACE to scroll, any key for press-any-key prompts)
- V4 game support — `os_read_key` handled correctly; tested with Trinity and A Mind Forever Voyaging
- Status bar with room name and score/moves
- Retro disk LED animation while images generate; centered loading/error status text
- Scales to any viewport size via fluid `clamp()`-based typography

**Supported game versions:**
| Version | Example Games | Room ID method |
|---------|--------------|----------------|
| V1–V3 | Zork I/II/III, Hitchhiker's Guide, Planetfall, Wishbringer, Enchanter | Global 0 (spec-mandated, always reliable) |
| V4 | Trinity, A Mind Forever Voyaging, Bureaucracy | Object name lookup; falls back to room title when ID is 0 |
| V5 | Beyond Zork, Shogun | Object name lookup |

---

## Architecture

### Full Stack

```mermaid
flowchart TD
    subgraph Browser
        HTML["index.html\n(launcher — drop zone, settings)"]
        CORE["js/core.js\nIFWGPlayer.create(div, config)"]
        RENDER["js/render.js\ngame viewport DOM"]
        ENGINE["js/engine.js\nWASM bridge"]
        CONFIG["js/config.js\nIFWGConfig · StandaloneConfig"]
        DB["js/db.js\nIndexedDB · game-scoped keys"]
        GAME["js/game.js\ncurrent game ID singleton"]
        IMAGEGEN["js/imagegen/\nImageGen · ImageGenSettings\nOpenAI · Gemini"]
        WASM_JS["wasm/ifwg.js\nEmscripten module loader"]
    end

    subgraph WASM ["WASM (ifwg.wasm)"]
        BRIDGE["bridge/ifwg_interp.c\nyield · step · start"]
        API["bridge/ifwg_api.c\ninspect · objects · header"]
        FROTZ["frotz dumb frontend\nos_read_line · os_read_key"]
        CORE_C["frotz common\nZ-machine interpreter"]
    end

    FS["Emscripten FS (MEMFS)\nstory file · save files"]

    HTML -->|"IFWGPlayer.create(div, config)"| CORE
    HTML -->|"player.loadGame(source)"| CORE
    CORE --> RENDER
    CORE --> ENGINE
    CORE --> CONFIG
    CORE --> GAME
    CORE --> IMAGEGEN
    ENGINE -->|"_ifwg_interp_step()"| WASM_JS
    WASM_JS --> BRIDGE
    BRIDGE -->|"window.enteredRoom()"| ENGINE
    BRIDGE -->|"window.ifwgOnSave()"| ENGINE
    BRIDGE --> FROTZ
    FROTZ --> CORE_C
    CORE_C --> FS
    API --> CORE_C
    IMAGEGEN --> DB
    CONFIG --> DB
    DB --> GAME
```

### Player Directory Layout

```
player/
├── index.html          ← standalone launcher (drop zone, settings, drag/drop)
├── player.css
├── js/
│   ├── index.js        ← barrel export / bundle entry point
│   ├── core.js         ← IFWGPlayer.create(div, config)
│   ├── render.js       ← game viewport DOM only
│   ├── engine.js       ← WASM bridge, save hook
│   ├── config.js       ← IFWGConfig base, StandaloneConfig
│   ├── db.js           ← generic IndexedDB, game-scoped key prefix
│   ├── game.js         ← current game ID singleton
│   ├── imagegen/
│   │   ├── index.js    ← ImageGen, ImageGenSettings, prompt builder
│   │   ├── openai.js   ← OpenAI provider
│   │   ├── gemini.js   ← Gemini provider
│   │   └── providers.json ← provider metadata (models, labels)
│   └── ui/
│       ├── image.js    ← scene image, placeholder, LED animation
│       ├── input.js    ← command input, cursor
│       └── text.js     ← text pagination, slide transitions
├── prompt/
│   ├── prompt1.png     ← reference images sent with every OpenAI request
│   └── prompt2.png
└── wasm/               ← generated by Makefile, gitignored
```

### Player API

`IFWGPlayer.create(container, config)` renders the game viewport into `container` and returns a player object. All launcher UI (drop zone, file picker, settings panel) lives in the host page.

```javascript
const config = new StandaloneConfig();
const player = IFWGPlayer.create(document.getElementById("app"), config);

player.loadGame(file);              // File object (drag/drop or file picker)
player.loadGame("path/to/game.z5"); // URL — fetched automatically
player.loadGame(bytes);             // Uint8Array or ArrayBuffer
```

### Config & Hooks

`IFWGConfig` is the base class. Override only what your environment needs.

```javascript
class IFWGConfig {
  getWasmPath()                  // → "./wasm/"  (path to wasm/ directory)
  onSave(filename, bytes)        // called after z_save — persist bytes externally
  onRestore(filename, cb)        // called before engine start — cb(bytes | null)
  onGameLoaded(gameId, title)    // called when a game starts
}
```

`StandaloneConfig` extends `IFWGConfig` with IndexedDB persistence for saves and image cache. Keys are scoped by game ID: `<gameId>/saves/<file>` and `<gameId>/images/<roomId>`.

### Image Settings

Image settings are owned by `ImageGen`, not by the config. The host page reads and writes them directly.

```javascript
import { ImageGen, ImageGenSettings } from "./js/imagegen/index.js";

const s = ImageGen.getSettings();   // returns ImageGenSettings
s.getProvider();                    // "openai" | "gemini"
s.getApiKey();                      // key for the currently selected provider
s.getModel();                       // selected model, or provider default

// API keys are stored per-provider; switching providers does not clear other keys
ImageGen.setSettings(new ImageGenSettings("openai", { openai: "sk-…", gemini: "AI…" }));
```

`ImageGen.generate()` always checks the IndexedDB cache first. API calls only happen on a cache miss when the description is substantial enough (≥ 10 words). Cached images are served regardless of whether an API key is configured. On failure the call is retried up to 2 times before surfacing an error.

**Provider notes:**

| Provider | Best for | Notes |
|----------|----------|-------|
| OpenAI (`gpt-image-2-2026-04-21`) | Retro Apple II pixel art | Produces the most authentic dithered pixel art aesthetic; reference images (prompt1/2.png) guide style directly. Recommended for the classic theme. |
| Gemini | Realistic / cinematic | Faster and cheaper; generates natively at 16:9 so no letterbox crop is needed. Better for photorealistic styles. |

### Save / Restore

Save and restore are transparent — the player types `save` / `restore` as normal game commands.

**C side (WASM):**
- `fastmem.c` — `EM_ASM` fires `window.ifwgOnSave(filename)` after a successful `z_save`
- `dinput.c` — `os_read_file_name` silently accepts the default filename for save/restore under Emscripten (no filesystem prompt)

**JS side:**
- `engine.js` reads the saved bytes from MEMFS via `FS.readFile`, passes them to `config.onSave`
- `StandaloneConfig.onSave` stores bytes to IndexedDB under `<gameId>/saves/<basename>`
- On `loadGame`, `config.onRestore` is called before the engine starts; if bytes exist they are written into MEMFS before frotz runs

**Save filename convention:**

Frotz derives the save name as `basename(storyFile)` with the extension stripped, then `.qzl` appended — e.g. `zork1.z3` → `zork1.qzl`. The JS side derives the same name so the IndexedDB key and MEMFS path always match. One save slot per game.

### Game Identity

The game ID is read directly from the Z-machine header before the story file is written to MEMFS — no file hashing, no round-trip through C.

```
release  = bytes[0x02..0x03]  (16-bit big-endian)
serial   = bytes[0x12..0x17]  (6 ASCII chars)
gameId   = release + "." + serial   →  e.g. "119.870917"
```

This is set on `Game` (singleton) when a game loads. `DB` prepends it automatically to every key.

### WASM Yield / Resume Flow

The bridge uses `setjmp`/`longjmp` to yield control at each input boundary without blocking the browser's main thread.

```mermaid
sequenceDiagram
    participant JS as engine.js
    participant Bridge as ifwg_interp.c
    participant Frotz as frotz interpreter
    participant Room as current room

    JS->>Bridge: _ifwg_interp_start(storyPath)
    Bridge->>Frotz: interpret()
    Frotz->>Room: executes opcodes...
    Room->>Frotz: os_read_line / os_read_key
    Frotz->>Bridge: ifwg_yield() / ifwg_yield_key()
    Bridge->>Bridge: ifwg_dumb_get_cursor_prompt()
    Note over Bridge: reads cursor row from screen buffer\ncaptures game prompt text (e.g. "Please type YES or NO.")
    Bridge->>JS: window.enteredRoom(id, title, desc, status, isKeyPress, cursorPrompt)
    Note over Bridge: longjmp → returns from setjmp
    JS-->>JS: render description, update prompt label, generate image, await input
    JS->>Bridge: _ifwg_interp_step(command)
    Bridge->>Frotz: populate input buffer
    Bridge->>Frotz: interpret() resumes at read opcode
```

---

## Image Generation Pipeline

```mermaid
flowchart TD
    ROOM["Room entered\n(new roomKey, id > 0)"]
    WC{"wordCount\n≥ 10?"}
    IDB{"IndexedDB\ncache hit?"}
    WEBP{"Already\nWebP?"}
    SHOW["Display image\n(blind-reveal animation)"]
    MIGRATE["Crop + compress\nto WebP · update cache"]
    KEY{"API key\nconfigured?"}
    GEN["Call provider API\n(prompt + reference images)\nRetry up to 2×"]
    PROCESS["Crop black bars\n+ compress to WebP"]
    CACHE["Store in IndexedDB"]
    PLACEHOLDER["Show empty placeholder"]

    ROOM --> IDB
    IDB -->|Miss| WC
    IDB -->|Hit| WEBP
    WEBP -->|Yes| SHOW
    WEBP -->|No - migrate| MIGRATE --> SHOW
    WC -->|No| PLACEHOLDER
    WC -->|Yes| KEY
    KEY -->|No| PLACEHOLDER
    KEY -->|Yes| GEN
    GEN -->|success| PROCESS
    GEN -->|all retries failed| PLACEHOLDER
    PROCESS --> CACHE
    CACHE --> SHOW
```

> **Note:** The IndexedDB cache is always checked first — cache hits are served even without an API key and even when the room description is short (e.g. after a `restore`). Images are stored as WebP (0.9 quality); any older PNG entries are migrated automatically on first access. API generation is only attempted on a cache miss with a substantial description (≥ 10 words). Rooms with ID 0 (meta-mode screens such as AMFV's Communications Mode) are never sent to image gen.

---

## Development Setup

### WASM Build

The WASM module is built inside a Docker container with Emscripten.

```bash
# Start the container with a volume mount (first time)
docker run -dit --name ifwg-emsdk-3.1.1 \
  -p 5173:5173 \
  -v "$(pwd):/src" \
  emscripten/emsdk:3.1.1 bash

# Serve the player
docker exec ifwg-emsdk-3.1.1 \
  bash -c "cd /src && python3 -m http.server 5173 --bind 0.0.0.0 &"

# Build WASM
docker exec -w /src/wasm ifwg-emsdk-3.1.1 make
```

Open `http://localhost:5173/player/` in a browser.

### Player JS

```bash
cd player
npm install

npm run lint    # ESLint
npm run build   # esbuild → dist/ifwg-player.js (~16 KB minified)
```

`index.html` has both import variants side by side — comment/uncomment to switch:

```javascript
/* Dev — individual modules (no build step required) */
import { IFWGPlayer } from "./js/core.js";
...

/* Prod — minified bundle
import { IFWGPlayer, StandaloneConfig, ImageGen, ImageGenSettings } from "./dist/ifwg-player.js";
*/
```

---

## Builder (Internal Tool)

The `builder/` directory contains a debug interface for the WASM bridge — load a story file and call individual bridge functions (dump header, dump objects, dump dictionary, walk the object tree, find text) without running the full player UI.

Useful for testing bridge API changes and inspecting Z-machine internals. Internal tool only.

---

## Roadmap

### Near term

- **Slash commands** — `/restart`, `/regen`, `/clear`, `/save`, `/restore`, `/export`, `/help` intercepted before commands reach frotz
- **Pre-generated image library** — commit artwork for major Infocom games directly to this repo under `presets/`; players never need an API key for known games
- **AI room explorer** — Claude agent plays IF games headlessly via frotz, collects room descriptions → JSON review → batch image gen → preset server

### Longer term

- **Theme system** — pluggable theme interface covering CSS, image gen prompt, and text rendering style; the current Apple II look becomes the default `classic` theme; additional themes (e.g. `modern`) live in `themes/` subfolders and can produce a completely different look and feel without touching core
- **`/export`** — produce a distributable game package (story file + images + player + webRcade feed manifest)
- **Standalone launcher** — prebuilt Go binaries that serve files relative to themselves and open the browser; included in `/export` packages
- **Embed variant** — minimal host page that boots a specific game directly via `player.loadGame(url)` with no launcher UI
- **webRcade integration** — direct embedding via the config hooks; save/restore via webRcade's cloud platform

---

## License

License information has not been finalized yet.
