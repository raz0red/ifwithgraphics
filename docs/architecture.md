# Architecture

This project is a development environment for illustrated interactive fiction projects.

Users will bring an existing interactive fiction story file, starting with Z-machine/Z-code. The builder will inspect the file, extract a useful internal model, help the creator attach or generate graphics, and eventually export a standalone playable web version.

## Major Areas

### Builder

The builder is the authoring/development environment. It owns project management, file ingestion, story inspection, room/object review, image workflow, build settings, and export.

The first builder milestone is a browser UI that accepts a Z-code file and runs a WASM-compiled inspection tool against it.

### Builder WASM Tools

Builder-side WASM tools are for analysis, not gameplay.

The first tool is expected to be ZTools `infodump`, compiled from C with Emscripten. JavaScript will pass a story file to it through Emscripten's in-memory filesystem and initially capture its normal `printf` output.

This raw output can later be replaced or supplemented by a cleaner structured JSON API.

### Player

The player is the runtime web app that exported projects will use. It will eventually run the IF game in the browser through a Z-machine interpreter compiled to WASM, wrapped by a modern web UI.

The player is separate from the builder so the authoring tools do not leak into the shipped game.

### Player WASM Runtime

The player-side WASM runtime will likely be based on a C Z-machine interpreter such as Frotz or a similar engine. Its job is to run the game interactively in the exported web app.

## Proposed Folder Shape

```text
builder/
  src/
    wasm/
    components/

player/
  src/
    wasm/
    components/

wasm-tools/
  builder/
    ztools/
      src/
      build/
      scripts/
  player/
    frotz/
      src/
      build/
      scripts/

samples/
  zcode/

docs/

.agents/
```

## Guiding Split

- Builder WASM answers: what is inside this IF file?
- Player WASM answers: can we run this IF file interactively?
