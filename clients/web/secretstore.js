/* MatrixMess Web – Geheimnis-Speicher (secretstore.js)
 *
 * Legt Geheimnisse (Access-Token, Krypto-Pickle-Key) NICHT im Klartext ab,
 * sondern verschlüsselt mit einem AES-GCM-Schlüssel, der als
 * NICHT-EXTRAHIERBARER CryptoKey in IndexedDB liegt. JavaScript (und damit
 * ein XSS) kann den Rohschlüssel nie auslesen – nur ver-/entschlüsseln, und
 * das nur im selben Origin. Damit sind die Geheimnisse „at rest" opak; ein
 * XSS kann sie nicht mehr einfach mitnehmen und woanders wiederverwenden.
 *
 * Fällt bewusst auf localStorage-Klartext zurück, wenn WebCrypto oder
 * IndexedDB fehlen (z. B. sehr alte Browser) – dann bleibt die App
 * funktionsfähig, nur ohne die zusätzliche Härtung.
 *
 * API (alles async):
 *   setSecret(name, value:string)
 *   getSecret(name) -> string | null
 *   removeSecret(name)
 */

const DB_NAME = 'mm-secure';
const STORE = 'kv';
const KEY_ID = '__aeskey__';
const FALLBACK_PREFIX = 'mm.sec.';

let dbPromise = null;
let keyPromise = null;

function hasCrypto() {
  return typeof indexedDB !== 'undefined'
    && typeof crypto !== 'undefined'
    && crypto.subtle
    && typeof crypto.subtle.generateKey === 'function';
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB'));
  });
  return dbPromise;
}

function idbGet(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
    r.onerror = () => reject(r.error);
  }));
}

function idbPut(key, value) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbDel(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

/** Den nicht-extrahierbaren AES-GCM-Schlüssel holen oder einmalig erzeugen. */
function getKey() {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    let key = await idbGet(KEY_ID);
    if (key) return key;
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,              // extractable = false: Rohschlüssel nie auslesbar
      ['encrypt', 'decrypt']
    );
    await idbPut(KEY_ID, key); // CryptoKey wird per Structured Clone gespeichert
    return key;
  })();
  return keyPromise;
}

function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toB64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export async function setSecret(name, value) {
  if (value === null || value === undefined) return removeSecret(name);
  if (!hasCrypto()) {
    try { localStorage.setItem(FALLBACK_PREFIX + name, String(value)); } catch (e) { /* */ }
    return;
  }
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(String(value));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    await idbPut('secret:' + name, { iv: toB64(iv), ct: toB64(ct) });
    // Etwaigen Klartext-Fallback aufräumen.
    try { localStorage.removeItem(FALLBACK_PREFIX + name); } catch (e) { /* */ }
  } catch (e) {
    // Falls Verschlüsselung scheitert: lieber Klartext-Fallback als Datenverlust.
    try { localStorage.setItem(FALLBACK_PREFIX + name, String(value)); } catch (e2) { /* */ }
  }
}

export async function getSecret(name) {
  if (hasCrypto()) {
    try {
      const rec = await idbGet('secret:' + name);
      if (rec && rec.iv && rec.ct) {
        const key = await getKey();
        const pt = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct));
        return new TextDecoder().decode(pt);
      }
    } catch (e) { /* auf Fallback zurückfallen */ }
  }
  try {
    const v = localStorage.getItem(FALLBACK_PREFIX + name);
    return v === null ? null : v;
  } catch (e) { return null; }
}

export async function removeSecret(name) {
  if (hasCrypto()) { try { await idbDel('secret:' + name); } catch (e) { /* */ } }
  try { localStorage.removeItem(FALLBACK_PREFIX + name); } catch (e) { /* */ }
}
