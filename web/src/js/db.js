import { Game } from "./game.js";

const DB_NAME = "ifwg";
const DB_VER  = 1;
const STORE   = "data";
let _db = null;

const _prefix = key => `${Game.getId() || "unknown"}/${key}`;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

async function get(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(_prefix(key));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function put(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(value, _prefix(key));
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

export const DB = { get, put };
