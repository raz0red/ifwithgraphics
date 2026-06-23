# Agent Project Context

This repository is for a project-based interactive fiction development environment.

The product is not only a player template. The central idea is a builder where users create projects, bring an existing interactive fiction file, inspect what is inside it, enrich it with generated or curated graphics, and eventually export a playable static web bundle.

## Current Understanding

- Users bring an existing IF file, starting with Z-machine/Z-code.
- Zork is the first test target, used to prove the ingestion and analysis workflow.
- Phase 1 is focused on parsing and understanding the story file, especially objects and likely rooms.
- ZTools `infodump` is the first likely parser/inspection tool.
- Because `infodump` is C, it fits the overall WASM direction: compile it with Emscripten and call it from JavaScript.
- The first demo can be simple: drag/drop a `.z3` or similar file, write it into Emscripten's in-memory filesystem, run `infodump`, capture `printf` output, and display the object dump.

## Architecture Direction

- `builder/` will be the development environment UI.
- `player/` will be the eventual web runtime/exported gameplay UI.
- `wasm-tools/builder/` will contain builder-side C tools compiled to JS/WASM, beginning with ZTools `infodump`.
- `wasm-tools/player/` will contain the player-side Z-machine interpreter compiled to JS/WASM.
- `samples/zcode/` can hold local test story files, but copyrighted story files should not be committed.

## Current Goal

Create the first builder-side WASM payload:

1. Add or vendor ZTools `infodump`.
2. Compile it with Emscripten to `.js` and `.wasm`.
3. Provide a simple browser builder screen with a drag/drop target.
4. Write the dropped story file into Emscripten FS.
5. Run `infodump` against that file.
6. Show the raw object dump in the UI.

Structured room extraction, image generation, and playable export come later.
