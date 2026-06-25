import { DB } from "./db.js";

export class IFWGConfig {
  getWasmPath()                  { return "./wasm/"; }
  onSave(_filename, _bytes)      {}
  onRestore(_filename, cb)       { cb(null); }
  onGameLoaded(_gameId, _title)  {}
}

export class StandaloneConfig extends IFWGConfig {
  onSave(filename, bytes) {
    const name = filename.replace(/.*\//, "");
    console.info("[IFWG] onSave — key:saves/%s bytes:%o", name, bytes?.length);
    DB.put(`saves/${name}`, bytes).then(() => {
      console.info("[IFWG] onSave — IndexedDB put OK key:saves/%s", name);
    }).catch(e => {
      console.warn("[IFWG] onSave — IndexedDB put FAILED", e);
    });
  }

  onRestore(filename, cb) {
    const name = filename.replace(/.*\//, "");
    console.info("[IFWG] onRestore — looking up key:saves/%s", name);
    DB.get(`saves/${name}`).then(bytes => {
      console.info("[IFWG] onRestore — found:%o bytes:%o", !!bytes, bytes?.length);
      cb(bytes || null);
    }).catch(e => {
      console.warn("[IFWG] onRestore — IndexedDB get FAILED", e);
      cb(null);
    });
  }
}
