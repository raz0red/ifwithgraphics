# Roadmap

## Phase 1: Z-code Inspection Spike

Goal: prove that the browser builder can accept a Z-machine story file and inspect it using a C tool compiled to WASM.

Deliverables:

- A dedicated builder-side WASM tool area.
- ZTools `infodump` compiled with Emscripten.
- A simple builder UI with drag/drop file input.
- The dropped file written into Emscripten's in-memory filesystem.
- `infodump` invoked from JavaScript.
- Raw object dump output visible in the UI.

## Phase 2: Normalize The Dump

Goal: turn raw inspection output into a project model.

Likely deliverables:

- Parse objects, object names, parent/child/sibling relationships, and properties.
- Identify likely rooms or locations.
- Store a normalized JSON model for review.
- Add a UI for browsing objects and likely rooms.

## Phase 3: Player Runtime Spike

Goal: prove that a Z-machine game can run in the browser in a custom player UI.

Likely deliverables:

- Compile a Z-machine interpreter to WASM.
- Load a story file.
- Send player commands from JavaScript.
- Capture text output into frontend state.
- Render transcript, command input, and status information.

## Phase 4: Graphics Workflow

Goal: let creators attach or generate visuals for rooms.

Likely deliverables:

- Room/image manifest.
- One-image preview workflow for the starting location.
- Style controls for retro/pixel/dithered presentation.
- Batch generation or batch import workflow.
- Review and replacement flow.

## Phase 5: Static Export

Goal: export a finished illustrated IF project as static web files.

Likely deliverables:

- Bundle player UI, WASM runtime, story file, manifest, and image assets.
- Export as a static folder or zip.
- Support hosting on static providers such as GitHub Pages or itch.io.
