import { ImageDB } from "./imagegen/imagedb.js";

var SETTINGS_KEY = "ifwg_settings";

export class IFWGConfig {

  /* ── Overridable getters ───────────────────────────────────────── */
  getWasmPath()  { return "./wasm/"; }
  getProvider()  { return "openai"; }
  getApiKey()    { return ""; }

  /* ── Overridable hooks ─────────────────────────────────────────── */
  onSave(filename, bytes)     {}
  onRestore(filename, cb)     { cb(null); }
  onGameLoaded(gameId, title) {}
  onSettingsChange(settings)  {}

  /* ── localStorage persistence (standalone) ─────────────────────── */
  static load() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; }
    catch (_) { return {}; }
  }

  static save(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
}

/* Standalone config — reads/writes API key from localStorage. */
export class StandaloneConfig extends IFWGConfig {
  constructor() {
    super();
    var s = IFWGConfig.load();
    this._provider = s.provider || "openai";
    this._apiKey   = s.apiKey   || "";
  }

  getProvider() { return this._provider; }
  getApiKey()   { return this._apiKey; }

  onSettingsChange(settings) {
    this._provider = settings.provider;
    this._apiKey   = settings.apiKey;
    IFWGConfig.save(settings);
  }

  onSave(filename, bytes) {
    ImageDB.put("save/" + filename, bytes).catch(function (e) {
      console.warn("onSave: IndexedDB put failed", e);
    });
  }

  onRestore(filename, cb) {
    ImageDB.get("save/" + filename).then(function (bytes) {
      cb(bytes || null);
    }).catch(function (e) {
      console.warn("onRestore: IndexedDB get failed", e);
      cb(null);
    });
  }
}
