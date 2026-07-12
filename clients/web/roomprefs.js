/* MatrixMess Web – Raum-Präferenzen (roomprefs.js)
 *
 * Stummschalten (mit Ablaufzeit), Anpinnen (max. 5) und Archivieren einzelner
 * Chats. Reines Zustandsmodul nach dem Muster von spaces.js: Persistenz über
 * Matrix-account_data "io.matrixmess.roomprefs" (synct über Geräte) mit
 * localStorage "mm.roomprefs" als sofort verfügbarem Cache.
 *
 * Export-API:
 *   initRoomPrefs({ getAccountData, putAccountData, onChange }) -> Promise
 *   getRoomPrefs(roomId) -> { muteUntil, pinned, archived }
 *   isMuted(roomId)      -> boolean   (berücksichtigt Ablaufzeit)
 *   muteLabel(roomId)    -> string|null  (z. B. "bis 18:30", "für immer")
 *   setMute(roomId, muteUntil)   // 0 = aus, -1 = für immer, sonst Epoch-ms
 *   isPinned(roomId)     -> boolean
 *   pinOrder(roomId)     -> number    (Zeitstempel des Anpinnens, 0 = nicht)
 *   togglePin(roomId)    -> { pinned, ok }  // ok=false: Pin-Limit erreicht
 *   isArchived(roomId)   -> boolean
 *   setArchived(roomId, value)
 *   getNotifyMode(roomId) -> 'all' | 'mentions'
 *   setNotifyMode(roomId, mode)
 *   applyRemoteState(content)    // account_data-Update aus /sync (Echo-sicher)
 *   MAX_PINS, ROOMPREFS_ACCOUNT_DATA_TYPE
 */

export const ROOMPREFS_ACCOUNT_DATA_TYPE = 'io.matrixmess.roomprefs';
const LS_KEY = 'mm.roomprefs';
const PUT_DEBOUNCE_MS = 600;

export const MAX_PINS = 5;

let hooks = {
  getAccountData: null,
  putAccountData: null,
  onChange: null,
};

/* roomId -> { muteUntil: number (0|-1|ts), pinned: number (0|ts), archived: bool,
 *             notify: 'all'|'mentions' } */
let state = { rooms: {} };

let putTimer = null;
let lastSentJson = null; // eigenes Echo aus /sync erkennen (Lost-Update-Schutz)

function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* */ }
}

function sanitizeState(raw) {
  const out = { rooms: {} };
  if (!raw || typeof raw !== 'object') return out;
  const rooms = raw.rooms;
  if (!rooms || typeof rooms !== 'object' || Array.isArray(rooms)) return out;
  for (const [roomId, p] of Object.entries(rooms)) {
    // Prototype-Pollution verhindern (Schluessel stammen aus account_data).
    if (roomId === '__proto__' || roomId === 'constructor' || roomId === 'prototype') continue;
    if (typeof roomId !== 'string' || !roomId || !p || typeof p !== 'object') continue;
    const entry = {
      muteUntil: typeof p.muteUntil === 'number' && (p.muteUntil === -1 || p.muteUntil > 0) ? p.muteUntil : 0,
      pinned: typeof p.pinned === 'number' && p.pinned > 0 ? p.pinned : 0,
      archived: !!p.archived,
      notify: p.notify === 'mentions' ? 'mentions' : 'all',
    };
    if (entry.muteUntil || entry.pinned || entry.archived || entry.notify !== 'all') {
      out.rooms[roomId] = entry;
    }
  }
  return out;
}

function buildPayload() {
  return { version: 1, rooms: JSON.parse(JSON.stringify(state.rooms)) };
}

function schedulePut() {
  if (typeof hooks.putAccountData !== 'function') return;
  clearTimeout(putTimer);
  putTimer = setTimeout(() => {
    const payload = buildPayload();
    lastSentJson = JSON.stringify(sanitizeState(payload));
    Promise.resolve(hooks.putAccountData(ROOMPREFS_ACCOUNT_DATA_TYPE, payload)).catch((e) => {
      console.warn('[roomprefs] account_data konnte nicht geschrieben werden:', e);
    });
  }, PUT_DEBOUNCE_MS);
}

function changed() {
  saveLocal();
  schedulePut();
  if (typeof hooks.onChange === 'function') {
    try { hooks.onChange(); } catch (e) { console.error('[roomprefs] onChange-Fehler:', e); }
  }
}

function entryFor(roomId) {
  return state.rooms[roomId] || { muteUntil: 0, pinned: 0, archived: false, notify: 'all' };
}

function setEntry(roomId, patch) {
  const cur = entryFor(roomId);
  const next = Object.assign({}, cur, patch);
  // Abgelaufene Stummschaltungen bei Gelegenheit mit aufräumen.
  if (next.muteUntil > 0 && next.muteUntil <= Date.now()) next.muteUntil = 0;
  if (!next.muteUntil && !next.pinned && !next.archived && next.notify !== 'mentions') {
    delete state.rooms[roomId];
  } else {
    state.rooms[roomId] = next;
  }
  changed();
}

/* ========================================================================
 * Öffentliche API
 * ====================================================================== */

export async function initRoomPrefs(opts) {
  const o = opts || {};
  hooks = {
    getAccountData: typeof o.getAccountData === 'function' ? o.getAccountData : null,
    putAccountData: typeof o.putAccountData === 'function' ? o.putAccountData : null,
    onChange: typeof o.onChange === 'function' ? o.onChange : null,
  };

  state = sanitizeState(loadLocal());

  if (hooks.getAccountData) {
    try {
      const remote = await hooks.getAccountData(ROOMPREFS_ACCOUNT_DATA_TYPE);
      if (remote && typeof remote === 'object') {
        state = sanitizeState(remote);
        saveLocal();
      }
    } catch (e) {
      console.warn('[roomprefs] account_data nicht ladbar, nutze lokalen Cache:', e);
    }
  }
}

export function getRoomPrefs(roomId) {
  return Object.assign({}, entryFor(roomId));
}

export function isMuted(roomId) {
  const m = entryFor(roomId).muteUntil;
  if (!m) return false;
  if (m === -1) return true;
  return Date.now() < m;
}

/** Menschlich lesbares Label der aktiven Stummschaltung (oder null). */
export function muteLabel(roomId) {
  const m = entryFor(roomId).muteUntil;
  if (!m || (m > 0 && m <= Date.now())) return null;
  if (m === -1) return 'für immer';
  const d = new Date(m);
  const sameDay = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return 'bis ' + time;
  return 'bis ' + d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ', ' + time;
}

/** muteUntil: 0 = aufheben, -1 = für immer, sonst Epoch-ms. */
export function setMute(roomId, muteUntil) {
  if (typeof roomId !== 'string' || !roomId) return;
  const v = typeof muteUntil === 'number' ? muteUntil : 0;
  setEntry(roomId, { muteUntil: v === -1 || v > 0 ? v : 0 });
}

export function isPinned(roomId) {
  return entryFor(roomId).pinned > 0;
}

export function pinOrder(roomId) {
  return entryFor(roomId).pinned || 0;
}

/** Max. MAX_PINS gleichzeitig – wie bei WhatsApp bewusst knapp gehalten. */
export function togglePin(roomId) {
  if (typeof roomId !== 'string' || !roomId) return { pinned: false, ok: false };
  if (isPinned(roomId)) {
    setEntry(roomId, { pinned: 0 });
    return { pinned: false, ok: true };
  }
  const count = Object.values(state.rooms).filter((p) => p.pinned > 0).length;
  if (count >= MAX_PINS) return { pinned: false, ok: false };
  setEntry(roomId, { pinned: Date.now() });
  return { pinned: true, ok: true };
}

export function isArchived(roomId) {
  return !!entryFor(roomId).archived;
}

export function setArchived(roomId, value) {
  if (typeof roomId !== 'string' || !roomId) return;
  setEntry(roomId, { archived: !!value });
}

export function getNotifyMode(roomId) {
  return entryFor(roomId).notify === 'mentions' ? 'mentions' : 'all';
}

export function setNotifyMode(roomId, mode) {
  if (typeof roomId !== 'string' || !roomId) return;
  setEntry(roomId, { notify: mode === 'mentions' ? 'mentions' : 'all' });
}

/** account_data-Update aus /sync übernehmen; eigenes Echo wird ignoriert. */
export function applyRemoteState(content) {
  const incoming = sanitizeState(content);
  const json = JSON.stringify(incoming);
  if (json === lastSentJson) return;
  if (json === JSON.stringify(sanitizeState(state))) return; // keine Änderung
  state = incoming;
  saveLocal();
  if (typeof hooks.onChange === 'function') {
    try { hooks.onChange(); } catch (e) { console.error('[roomprefs] onChange-Fehler:', e); }
  }
}
