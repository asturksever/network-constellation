// Local persistence. Everything here stays on this device.
//
// A built graph for 10k people is roughly 3 MB of JSON once the rich classified
// objects are counted, which is past what localStorage will take and would block
// the main thread anyway. IndexedDB it is. localStorage keeps only the two tiny
// preferences that are not worth a transaction.

const DB_NAME = 'network-constellation';
// v2 added the per-person reads. Upgrades only ever add stores.
const DB_VERSION = 2;
const GRAPH = 'graph';
const EMPLOYERS = 'employers';
const PERSONS = 'persons';
const CURRENT = 'current';

export const KEY_STORAGE = 'nc.apiKey';
export const MODEL_STORAGE = 'nc.model';
export const AUTO_PERSON_STORAGE = 'nc.autoPerson';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('This browser has no IndexedDB.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GRAPH)) db.createObjectStore(GRAPH);
      if (!db.objectStoreNames.contains(EMPLOYERS)) db.createObjectStore(EMPLOYERS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(PERSONS)) db.createObjectStore(PERSONS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Another tab is holding the database open.'));
  });
  // A failed open must not be remembered, or one transient error poisons every
  // later read and write for the life of the page.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/**
 * Resolve on the transaction completing, not on the request succeeding. A put
 * that has "succeeded" can still be lost if the page navigates before the
 * transaction commits — which is exactly what an upload-then-reload does.
 */
function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted.'));
    result = fn(t.objectStore(store), v => { result = v; });
  }));
}

const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* ---------- the graph ---------- */

export async function loadGraph() {
  try {
    return await tx(GRAPH, 'readonly', (store, set) => {
      request(store.get(CURRENT)).then(set);
    });
  } catch {
    return null;   // a browser with storage switched off is not an error here
  }
}

export async function saveGraph({ D, people, sourceName }) {
  await tx(GRAPH, 'readwrite', store => {
    store.put({ savedAt: Date.now(), sourceName, D, people }, CURRENT);
  });
}

export async function clearGraph() {
  await tx(GRAPH, 'readwrite', store => { store.delete(CURRENT); });
}

/* ---------- employer enrichment ---------- */

export async function allEmployers() {
  try {
    const rows = await tx(EMPLOYERS, 'readonly', (store, set) => {
      request(store.getAll()).then(set);
    });
    return new Map((rows || []).map(r => [r.key, r]));
  } catch {
    return new Map();
  }
}

export async function putEmployers(records) {
  if (!records.length) return;
  await tx(EMPLOYERS, 'readwrite', store => {
    for (const r of records) store.put(r);
  });
}

export async function clearEmployers() {
  await tx(EMPLOYERS, 'readwrite', store => { store.clear(); });
}

/* ---------- per-person reads from Claude ---------- */
/* Keyed by a hash of the text that was sent (role, headline, employer), never
   by the person's name, so two people with the same headline share one read
   and a rebuilt file finds its cache again. */

export async function getPerson(key) {
  try {
    return await tx(PERSONS, 'readonly', (store, set) => {
      request(store.get(key)).then(set);
    });
  } catch {
    return null;
  }
}

export async function putPerson(record) {
  await tx(PERSONS, 'readwrite', store => { store.put(record); });
}

/* ---------- everything, gone ---------- */

export async function forgetAll() {
  try {
    localStorage.removeItem(KEY_STORAGE);
    localStorage.removeItem(MODEL_STORAGE);
    localStorage.removeItem(AUTO_PERSON_STORAGE);
  } catch { /* storage off */ }
  if (dbPromise) {
    try { (await dbPromise).close(); } catch { /* already closed */ }
    dbPromise = null;
  }
  await new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/**
 * Ask the browser not to evict this origin. Safari clears unused storage after
 * about seven days without it, and even with it the answer may be no — so the
 * UI says "stored in this browser", never "saved".
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}

/* ---------- the two small preferences ---------- */

export const prefs = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage off */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage off */ } }
};
