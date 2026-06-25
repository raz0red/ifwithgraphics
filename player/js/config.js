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
    DB.put(`saves/${name}`, bytes).catch(e => {
      console.warn("onSave: IndexedDB put failed", e);
    });
  }

  onRestore(filename, cb) {
    const name = filename.replace(/.*\//, "");
    DB.get(`saves/${name}`).then(bytes => {
      cb(bytes || null);
    }).catch(e => {
      console.warn("onRestore: IndexedDB get failed", e);
      cb(null);
    });
  }
}
