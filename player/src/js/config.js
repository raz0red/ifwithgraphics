import { DB } from "./db.js";
import { Game } from "./game.js";

/* Resolved relative to this module's own location, not the hosting page —
   works the same regardless of how deep the page is nested. */
const WASM_BASE = new URL("../wasm/", import.meta.url).href;

export class IFWGConfig {
  getWasmPath() {
    return WASM_BASE;
  }
  onSave(_filename, _bytes) {}
  onRestore(_filename, cb) {
    cb(null);
  }
  onGameLoaded(_gameId, _title) {}
  onValidationFailed(_error, _title, _options) {}
  /* Canonical game name a provided file must match (via aliases.json), or
     null to accept any story file (the standalone drop app). Game-specific
     pages override this so an unrecognized/wrong file is rejected. */
  getExpectedGame() {
    return null;
  }
}

/* Save-game bytes are tied to the exact compiled release (Z-machine memory
   layout, embedded object numbers, etc.), so they're scoped by the raw
   gameId — unlike images, a save isn't expected to be portable across
   different releases of the "same" game. */
function saveKey(filename) {
  const name = filename.replace(/.*\//, "");
  return `${Game.getId() || "unknown"}/saves/${name}`;
}

export class StandaloneConfig extends IFWGConfig {
  onSave(filename, bytes) {
    const key = saveKey(filename);
    console.info("[IFWG] onSave — key:%s bytes:%o", key, bytes?.length);
    DB.put(key, bytes)
      .then(() => {
        console.info("[IFWG] onSave — IndexedDB put OK key:%s", key);
      })
      .catch((e) => {
        console.warn("[IFWG] onSave — IndexedDB put FAILED", e);
      });
  }

  onRestore(filename, cb) {
    const key = saveKey(filename);
    console.info("[IFWG] onRestore — looking up key:%s", key);
    DB.get(key)
      .then((bytes) => {
        console.info("[IFWG] onRestore — found:%o bytes:%o", !!bytes, bytes?.length);
        cb(bytes || null);
      })
      .catch((e) => {
        console.warn("[IFWG] onRestore — IndexedDB get FAILED", e);
        cb(null);
      });
  }
}
