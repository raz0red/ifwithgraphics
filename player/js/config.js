import { DB } from "./db.js";

export class IFWGConfig {
  getWasmPath()                  { return "./wasm/"; }
  onSave(_filename, _bytes)      {}
  onRestore(_filename, cb)       { cb(null); }
  onGameLoaded(_gameId, _title)  {}
}

export class StandaloneConfig extends IFWGConfig {
  onSave(filename, bytes) {
    var name = filename.replace(/.*\//, "");
    DB.put("saves/" + name, bytes).catch(function (e) {
      console.warn("onSave: IndexedDB put failed", e);
    });
  }

  onRestore(filename, cb) {
    var name = filename.replace(/.*\//, "");
    DB.get("saves/" + name).then(function (bytes) {
      cb(bytes || null);
    }).catch(function (e) {
      console.warn("onRestore: IndexedDB get failed", e);
      cb(null);
    });
  }
}
