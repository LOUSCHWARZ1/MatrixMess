/* MatrixMess Web – Lokaler Raum-Cache (IndexedDB)
 *
 * Persistiert Raumliste, letzte Nachrichten und Metadaten, damit die App beim
 * Start sofort aus dem Cache rendert (gefühlte Startzeit < 1 s) und nur noch
 * inkrementell synct – statt bei jedem Reload einen vollen Initial-Sync auf
 * dem Main-Thread zu verarbeiten (P0 der UX-Analyse).
 *
 * Export-API:
 *   loadRoomCache(userId)  -> Promise<{rooms: object[], savedAt: number}|null>
 *   saveRoomCache(userId, roomsArray) -> Promise<void>   (roomsArray bereits serialisiert)
 *   clearRoomCache(userId) -> Promise<void>
 *   serializeRoom(room)    -> plain object (Maps -> Arrays, Events gekappt)
 *   deserializeRoom(obj)   -> room-Objekt mit rekonstruierten Maps/Indizes
 *
 * Bewusst simpel: EIN Datensatz pro Nutzer (kompletter Bestand). Bei üblichen
 * Account-Größen (≤ ein paar hundert Räume, 60 Events/Raum) sind Lesen und
 * debounced Schreiben unkritisch.
 */

const DB_NAME = 'mm-store';
const DB_VERSION = 1;
const STORE = 'roomCache';
const MAX_EVENTS_PER_ROOM = 60;
const MAX_MEMBERS_PER_ROOM = 400;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB nicht verfügbar'));
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
  return dbPromise;
}

function idbGet(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
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

function idbDelete(key) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

/** Ein Event für die Persistenz vorbereiten (reactions-Map -> Array). */
function serializeEvent(ev) {
  return {
    eventId: ev.eventId || null,
    sender: ev.sender || null,
    type: ev.type || null,
    content: ev.content || {},
    ts: ev.ts || 0,
    editedBody: ev.editedBody === undefined ? null : ev.editedBody,
    redacted: !!ev.redacted,
    encrypted: !!ev.encrypted,
    reactions: ev.reactions instanceof Map
      ? [...ev.reactions].map(([k, v]) => [k, { count: v.count || 0, mine: !!v.mine }])
      : [],
  };
}

function deserializeEvent(obj) {
  return {
    eventId: obj.eventId || null,
    sender: obj.sender || null,
    type: obj.type || null,
    content: obj.content || {},
    ts: obj.ts || 0,
    editedBody: obj.editedBody === undefined ? null : obj.editedBody,
    redacted: !!obj.redacted,
    encrypted: !!obj.encrypted,
    reactions: new Map((obj.reactions || []).map(([k, v]) => [k, { count: v.count || 0, mine: !!v.mine }])),
    pending: false,
    failed: false,
    txnId: null,
  };
}

/** Raum-Objekt in eine strukturierte, klonbare Form bringen. */
export function serializeRoom(room) {
  const members = [];
  if (room.members instanceof Map) {
    for (const [uid, m] of room.members) {
      members.push([uid, {
        displayname: (m && m.displayname) || null,
        avatarUrl: (m && m.avatarUrl) || null,
        membership: (m && m.membership) || null,
      }]);
      if (members.length >= MAX_MEMBERS_PER_ROOM) break;
    }
  }
  const events = [];
  const src = room.events || [];
  // Nur bestätigte Events persistieren (pending Echos sind nach Reload wertlos).
  for (let i = Math.max(0, src.length - MAX_EVENTS_PER_ROOM); i < src.length; i++) {
    const ev = src[i];
    if (ev.pending || ev.failed) continue;
    events.push(serializeEvent(ev));
  }
  const reactionIndex = [];
  if (room.reactionIndex instanceof Map) {
    for (const [rid, info] of room.reactionIndex) {
      reactionIndex.push([rid, { targetId: info.targetId, key: info.key, sender: info.sender }]);
    }
  }
  return {
    roomId: room.roomId,
    explicitName: room.explicitName || null,
    avatarMxc: room.avatarMxc || null,
    topic: room.topic || null,
    heroes: room.heroes || [],
    members,
    lastEventTs: room.lastEventTs || 0,
    lastPreview: room.lastPreview || '',
    lastPreviewSender: room.lastPreviewSender || null,
    unread: room.unread || 0,
    isEncrypted: !!room.isEncrypted,
    isDirect: !!room.isDirect,
    events,
    reactionIndex,
    prevBatch: room.prevBatch || null,
    lastReceiptEventId: room.lastReceiptEventId || null,
    bridgeProtocol: room.bridgeProtocol || null,
    bridgeHint: room.bridgeHint || null,
  };
}

/** Gegenstück zu serializeRoom: Maps/Indizes rekonstruieren. */
export function deserializeRoom(obj) {
  const events = (obj.events || []).map(deserializeEvent);
  const eventIndex = new Map();
  for (const ev of events) if (ev.eventId) eventIndex.set(ev.eventId, ev);
  return {
    roomId: obj.roomId,
    explicitName: obj.explicitName || null,
    avatarMxc: obj.avatarMxc || null,
    topic: obj.topic || null,
    heroes: obj.heroes || [],
    members: new Map(obj.members || []),
    lastEventTs: obj.lastEventTs || 0,
    lastPreview: obj.lastPreview || '',
    lastPreviewSender: obj.lastPreviewSender || null,
    unread: obj.unread || 0,
    isEncrypted: !!obj.isEncrypted,
    isDirect: !!obj.isDirect,
    typing: [],
    events,
    eventIndex,
    reactionIndex: new Map(obj.reactionIndex || []),
    pendingByTxn: new Map(),
    prevBatch: obj.prevBatch || null,
    paginating: false,
    lastReceiptEventId: obj.lastReceiptEventId || null,
    bridgeProtocol: obj.bridgeProtocol || null,
    bridgeHint: obj.bridgeHint || null,
  };
}

export async function loadRoomCache(userId) {
  if (!userId || typeof indexedDB === 'undefined') return null;
  try {
    const rec = await idbGet('rooms:' + userId);
    if (!rec || !Array.isArray(rec.rooms)) return null;
    return rec;
  } catch (e) {
    console.warn('[store] Raum-Cache konnte nicht geladen werden:', e);
    return null;
  }
}

export async function saveRoomCache(userId, roomsArray) {
  if (!userId || typeof indexedDB === 'undefined') return;
  try {
    await idbPut('rooms:' + userId, { rooms: roomsArray, savedAt: Date.now() });
  } catch (e) {
    console.warn('[store] Raum-Cache konnte nicht gespeichert werden:', e);
  }
}

export async function clearRoomCache(userId) {
  if (!userId || typeof indexedDB === 'undefined') return;
  try { await idbDelete('rooms:' + userId); } catch (e) { /* */ }
}
