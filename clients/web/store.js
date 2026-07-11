/* MatrixMess Web – Lokaler Raum-Cache (IndexedDB)
 *
 * Persistiert Raumliste, letzte Nachrichten und Metadaten, damit die App beim
 * Start sofort aus dem Cache rendert (gefühlte Startzeit < 1 s) und nur noch
 * inkrementell synct – statt bei jedem Reload einen vollen Initial-Sync auf
 * dem Main-Thread zu verarbeiten (P0 der UX-Analyse).
 *
 * Export-API:
 *   loadRoomCache(userId)  -> Promise<{rooms: object[], syncToken: string|null, savedAt: number}|null>
 *   saveRoomCache(userId, roomsArray, syncToken) -> Promise<void>   (roomsArray bereits serialisiert)
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

/** Ein Event für die Persistenz vorbereiten (reactions-Map -> Array).
 *  In E2EE-Räumen wird NIE Klartext geschrieben: Es wird der Original-
 *  Ciphertext persistiert (das Event heilt sich nach dem Laden über die
 *  reguläre Entschlüsselungs-Warteschlange). Ohne Ciphertext -> null
 *  (Event auslassen statt Klartext speichern). */
function serializeEvent(ev, encryptedRoom) {
  if (encryptedRoom) {
    // Systemzeilen stammen aus State-Events – die sind nie verschlüsselt
    // und dürfen als Klartext in den Cache.
    if (ev.type === 'mm.system') {
      return {
        eventId: ev.eventId || null,
        sender: ev.sender || null,
        type: 'mm.system',
        content: ev.content || {},
        ts: ev.ts || 0,
        editedBody: null,
        redacted: false,
        encrypted: false,
        reactions: [],
      };
    }
    const cipher = ev.type === 'm.room.encrypted' ? ev.content : ev.rawContent;
    if (!cipher || typeof cipher !== 'object') return null;
    return {
      eventId: ev.eventId || null,
      sender: ev.sender || null,
      type: 'm.room.encrypted',
      content: cipher,
      ts: ev.ts || 0,
      editedBody: null,
      redacted: !!ev.redacted,
      encrypted: true,
      reactions: [], // Aggregate enthalten Klartext (Emoji) – nicht persistieren
    };
  }
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
      ? [...ev.reactions].map(([k, v]) => [k, {
          count: v.count || 0,
          mine: !!v.mine,
          myEventId: v.myEventId || null, // ohne ID wäre die eigene Reaktion nicht mehr entfernbar
        }])
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
    reactions: new Map((obj.reactions || []).map(([k, v]) => [k, {
      count: v.count || 0,
      mine: !!v.mine,
      myEventId: v.myEventId || null,
    }])),
    pending: false,
    failed: false,
    txnId: null,
    rawContent: null,
  };
}

/** Raum-Objekt in eine strukturierte, klonbare Form bringen. */
export function serializeRoom(room) {
  const enc = !!room.isEncrypted;
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
  let confirmed = 0;
  for (const ev of src) if (!ev.pending && !ev.failed) confirmed++;
  for (let i = Math.max(0, src.length - MAX_EVENTS_PER_ROOM); i < src.length; i++) {
    const ev = src[i];
    if (ev.pending || ev.failed) continue;
    const sev = serializeEvent(ev, enc);
    if (sev) events.push(sev);
  }
  // Wurden Events gekappt/ausgelassen, zeigt prevBatch VOR die Lücke:
  // Rückwärts-Paginieren würde die fehlende Mitte still überspringen.
  // Dann lieber ohne Token neu verankern (nächster limited Sync setzt ihn).
  const truncated = events.length < confirmed;
  const reactionIndex = [];
  if (!enc && room.reactionIndex instanceof Map) {
    for (const [rid, info] of room.reactionIndex) {
      reactionIndex.push([rid, { targetId: info.targetId, key: info.key, sender: info.sender }]);
    }
  }
  const readReceipts = [];
  if (room.readReceipts instanceof Map) {
    for (const [uid, rec] of room.readReceipts) {
      readReceipts.push([uid, { eventId: (rec && rec.eventId) || null, ts: (rec && rec.ts) || 0 }]);
    }
  }
  return {
    roomId: room.roomId,
    explicitName: room.explicitName || null,
    avatarMxc: room.avatarMxc || null,
    topic: room.topic || null,
    canonicalAlias: room.canonicalAlias || null,
    heroes: room.heroes || [],
    members,
    lastEventTs: room.lastEventTs || 0,
    // E2EE: Vorschau ist Klartext – nicht persistieren (heilt nach Entschlüsselung).
    lastPreview: enc ? '' : (room.lastPreview || ''),
    lastPreviewSender: enc ? null : (room.lastPreviewSender || null),
    unread: room.unread || 0,
    isEncrypted: enc,
    isDirect: !!room.isDirect,
    events,
    reactionIndex,
    prevBatch: truncated ? null : (room.prevBatch || null),
    lastReceiptEventId: room.lastReceiptEventId || null,
    readReceipts,
    markedUnread: !!room.markedUnread,
    joinedCount: room.joinedCount || 0,
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
    canonicalAlias: obj.canonicalAlias || null,
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
    readReceipts: new Map(obj.readReceipts || []),
    markedUnread: !!obj.markedUnread,
    joinedCount: obj.joinedCount || 0,
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

export async function saveRoomCache(userId, roomsArray, syncToken) {
  if (!userId || typeof indexedDB === 'undefined') return;
  try {
    // syncToken gehört ZUM Raumbestand: Beim Restore wird der Sync exakt ab
    // diesem Token fortgesetzt – so entstehen keine Lücken zwischen (debounced)
    // Cache-Stand und (sofort gespeichertem) localStorage-Token.
    await idbPut('rooms:' + userId, { rooms: roomsArray, syncToken: syncToken || null, savedAt: Date.now() });
  } catch (e) {
    console.warn('[store] Raum-Cache konnte nicht gespeichert werden:', e);
  }
}

export async function clearRoomCache(userId) {
  if (!userId || typeof indexedDB === 'undefined') return;
  try { await idbDelete('rooms:' + userId); } catch (e) { /* */ }
}
