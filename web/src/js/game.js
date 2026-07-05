let _id = null;
let _version = null;

export const Game = {
  setId(id) { _id = id; },
  getId()   { return _id; },
  /* Z-machine version byte (from the story file header). V1-V3 games are
     spec-guaranteed to keep the current room in Global Variable 0 (used by
     the interpreter's own built-in status line); V4+ has no such guarantee,
     so any "room ID" for those is only ever a best-effort guess (see
     ifwg_find_object_by_name in the WASM bridge) — not reliable enough to
     key anything by. */
  setVersion(v) { _version = v; },
  getVersion()  { return _version; }
};
