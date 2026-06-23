# Phase 1: Builder-side `infodump` WASM Spike

The first implementation milestone is to prove that the builder can inspect a Z-machine story file in the browser.

## Goal

Build a minimal browser workflow:

1. User drags/drops a `.z3`, `.z5`, or similar Z-code file.
2. JavaScript writes the file into Emscripten's in-memory filesystem.
3. A WASM-compiled `infodump` runs against that file.
4. The builder captures `printf` output.
5. The UI displays the object dump.

## Non-goals

- No image generation yet.
- No playable runtime yet.
- No room inference beyond what the raw dump makes visible.
- No static export yet.
- No need for polished project management UI yet.

## Proposed Initial Structure

```text
builder/
  package.json
  index.html
  src/
    App.tsx
    main.tsx
    wasm/
      infodumpClient.ts
    components/
      FileDrop.tsx
      DumpViewer.tsx

wasm-tools/
  builder/
    ztools/
      src/
      build/
      scripts/

samples/
  zcode/
    README.md
```

## Success Criteria

- A story file can be selected in the browser.
- The file reaches the WASM module through Emscripten FS.
- `infodump` executes successfully.
- Object-related output is visible in the builder UI.
- The flow is documented well enough for another developer to reproduce.

## Later Improvement

Once the basic loop works, modify or wrap `infodump` so the builder can receive structured data directly instead of parsing terminal-style dump text.
