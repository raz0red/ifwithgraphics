import { Game } from "./game.js";

export var DB = (function () {
  var DB_NAME = "ifwg";
  var DB_VER  = 1;
  var STORE   = "data";
  var _db     = null;

  function _prefix(key) { return (Game.getId() || "unknown") + "/" + key; }

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(STORE);
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror   = function (e) { reject(e.target.error); };
    });
  }

  function get(key) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, "readonly").objectStore(STORE).get(_prefix(key));
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function put(key, value) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, _prefix(key));
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function clear() {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
        req.onsuccess = function () { resolve(); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  return { get: get, put: put, clear: clear };
})();
