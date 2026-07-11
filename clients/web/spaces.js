/**
 * MatrixMess Web – Bereichs-/Space-System (spaces.js)
 *
 * Reines Zustands-Modul: Unterteilt Chats in Bereiche ("Spaces"), unabhängig
 * davon, aus welcher Bridge sie stammen. Die gesamte Bereichs-UI (Baum-
 * Navigation, Kontextmenü-Checkliste, Chat-Picker, Inline-Erstellung) lebt
 * im Integrator (app.js) – dieses Modul verwaltet nur Daten + Persistenz.
 *
 * Bereichs-Arten:
 *  - 'all'    : Pseudo-Bereich "Alle" (zeigt jeden Raum)
 *  - 'main'   : "Main" – Favoriten aus allen Quellen
 *  - 'bridge' : automatisch erkannte Bridge-Bereiche (WhatsApp, Signal,
 *               Telegram, Instagram, Discord, Sonstige Bridges);
 *               IDs: 'bridge:whatsapp', 'bridge:signal', 'bridge:telegram',
 *               'bridge:instagram', 'bridge:discord', 'bridge:bridge'
 *  - 'custom' : selbst erstellte Bereiche (Titel + Icon + Akzentfarbe);
 *               IDs: 'custom:<zufall>'
 *
 * Ein Raum kann in MEHREREN Bereichen gleichzeitig liegen (Mehrfach-
 * Zuordnung).
 *
 * Icons: `icon` ist ein SVG-Icon-Name aus icons.js (z. B. 'folder',
 * 'brand-whatsapp'). Ältere gespeicherte Zustände können noch Emoji
 * enthalten – Renderer sollten dafür einen Text-Fallback haben.
 *
 * Persistenz:
 *  - primär Matrix-account_data, Typ "io.matrixmess.spaces" (synct über
 *    Geräte): { version, favorites, assignments, customSpaces }
 *  - localStorage "mm.spaces" als Cache/Fallback
 *
 * ======================= EXPORT-API =======================
 *
 * initSpaces(opts) -> Promise<void>
 *   opts = {
 *     getRooms()            -> Array<Room> | Map | Iterable  (aktuelle Räume),
 *     getAccountData(type)  -> Promise<object|null>          (Matrix account_data lesen),
 *     putAccountData(type, obj) -> Promise                   (Matrix account_data schreiben),
 *     onChange()                                             (wird bei JEDER Änderung gerufen;
 *                                                             der Integrator rendert dann neu)
 *   }
 *   Lädt den Zustand: erst localStorage-Cache, dann account_data
 *   ("io.matrixmess.spaces"); bei Fehler bleibt der lokale Fallback aktiv.
 *
 * getSpacesList() -> [{ id, title, icon, accent, kind:'all'|'main'|'bridge'|'custom', count }]
 *   Reihenfolge: 'all' zuerst, dann 'main', dann Bridge-Bereiche (nur solche
 *   mit >= 1 Raum), dann Custom-Bereiche. accent ist ein CSS-Farbwert.
 *
 * detectBridge(room) -> 'whatsapp'|'signal'|'telegram'|'instagram'|'discord'|'bridge'|null
 *   Signale: room.bridgeProtocol (vom Integrator aus m.bridge /
 *   uk.half-shot.bridge State-Events gesetzt) und room.bridgeHint
 *   (Sender-Prefix-Heuristik, z. B. "@whatsapp_…", "@_discord_…").
 *   Unbekannte, aber vorhandene Bridge-Signale ergeben 'bridge'.
 *
 * isFavorite(roomId) -> boolean
 * toggleFavorite(roomId) -> boolean   // neuer Favoriten-Zustand
 *
 * getRoomSpaceIds(roomId) -> Array<string>
 *   Manuell zugeordnete Bereichs-IDs (custom/bridge). Der Favoriten-Status
 *   ("main") läuft über isFavorite/toggleFavorite.
 * setRoomSpaceIds(roomId, ids)
 *   Schreibt die Zuordnung; 'main' in ids setzt zusätzlich den Favoriten-
 *   Status, 'all' wird ignoriert, unbekannte IDs werden verworfen.
 *
 * createCustomSpace({ title, icon, accent }) -> string  // neue Bereichs-ID
 * updateCustomSpace(id, { title?, icon?, accent? }) -> boolean
 * deleteCustomSpace(id) -> boolean
 *   accent ist eine ID aus SPACES_ACCENTS (z. B. 'violet').
 *
 * SPACES_ACCENTS -> [{ id, label, css }]   // die 8 Akzentfarben
 * SPACE_ICON_PRESETS -> Array<string>      // SVG-Icon-Namen für neue Bereiche
 */

export const SPACES_ACCOUNT_DATA_TYPE = 'io.matrixmess.spaces';
const ACCOUNT_DATA_TYPE = SPACES_ACCOUNT_DATA_TYPE;
const LS_STATE = 'mm.spaces';

const PUT_DEBOUNCE_MS = 600;

/** Die 8 wählbaren Akzentfarben für eigene Bereiche. */
export const SPACES_ACCENTS = [
  { id: 'violet',   label: 'Violett', css: '#8B4DF7' },
  { id: 'blue',     label: 'Blau',    css: '#3478F6' },
  { id: 'teal',     label: 'Türkis',  css: '#30B0C7' },
  { id: 'green',    label: 'Grün',    css: '#34C759' },
  { id: 'orange',   label: 'Orange',  css: '#FF9500' },
  { id: 'pink',     label: 'Pink',    css: '#FF2D55' },
  { id: 'red',      label: 'Rot',     css: '#FF3B30' },
  { id: 'graphite', label: 'Graphit', css: '#8E8E93' },
];

/** SVG-Icon-Vorschläge (icons.js-Namen) für neue Bereiche. */
export const SPACE_ICON_PRESETS = [
  'folder', 'users', 'heart', 'home', 'briefcase', 'gamepad', 'globe', 'sparkles',
];

/* Bekannte Bridges in stabiler Reihenfolge. 'bridge' = Sonstige Bridges. */
const BRIDGES = [
  { id: 'whatsapp',  title: 'WhatsApp',         icon: 'brand-whatsapp',  accent: '#25D366' },
  { id: 'signal',    title: 'Signal',           icon: 'brand-signal',    accent: '#3A76F0' },
  { id: 'telegram',  title: 'Telegram',         icon: 'brand-telegram',  accent: '#2AABEE' },
  { id: 'instagram', title: 'Instagram',        icon: 'brand-instagram', accent: '#E1306C' },
  { id: 'discord',   title: 'Discord',          icon: 'brand-discord',   accent: '#5865F2' },
  { id: 'bridge',    title: 'Sonstige Bridges', icon: 'link',            accent: '#8E8E93' },
];

const KNOWN_BRIDGE_IDS = ['whatsapp', 'signal', 'telegram', 'instagram', 'discord'];

/* ========================================================================
 * Modul-Zustand
 * ====================================================================== */

let hooks = {
  getRooms: null,
  getAccountData: null,
  putAccountData: null,
  onChange: null,
};

/* Persistenter, geräteübergreifender Zustand (account_data + Cache). */
let state = {
  favorites: [],     // [roomId]
  assignments: {},   // roomId -> [spaceId]
  customSpaces: [],  // [{ id, title, icon, accent }]
};

let putTimer = null;
let lastSentJson = null; // eigenes Echo aus /sync erkennen (Lost-Update-Schutz)

/* ========================================================================
 * Hilfsfunktionen
 * ====================================================================== */

function loadLocal(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveLocal(key, obj) {
  try {
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) { /* z. B. Privatmodus – Cache ist optional */ }
}

function accentCss(accentId) {
  const found = SPACES_ACCENTS.find((a) => a.id === accentId);
  return (found || SPACES_ACCENTS[0]).css;
}

function bridgeDef(bridgeId) {
  return BRIDGES.find((b) => b.id === bridgeId) || null;
}

/** Räume vom Integrator holen – Array, Map oder Iterable werden akzeptiert. */
function allRooms() {
  try {
    const r = typeof hooks.getRooms === 'function' ? hooks.getRooms() : null;
    if (!r) return [];
    if (Array.isArray(r)) return r;
    if (typeof r.values === 'function') return Array.from(r.values());
    return Array.from(r);
  } catch (e) {
    return [];
  }
}

function roomAssignedTo(roomId, spaceId) {
  const ids = state.assignments[roomId];
  return Array.isArray(ids) && ids.includes(spaceId);
}

function customSpaceById(id) {
  return state.customSpaces.find((s) => s.id === id) || null;
}

/** Darf ein Raum diesem Bereich manuell zugeordnet werden? */
function assignableSpaceExists(id) {
  if (typeof id !== 'string') return false;
  if (id.startsWith('bridge:')) return !!bridgeDef(id.slice(7));
  return !!customSpaceById(id);
}

function newSpaceId() {
  return 'custom:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Rohdaten (account_data / localStorage) in einen sauberen Zustand wandeln. */
function sanitizeState(raw) {
  const out = { favorites: [], assignments: {}, customSpaces: [] };
  if (!raw || typeof raw !== 'object') return out;

  if (Array.isArray(raw.favorites)) {
    out.favorites = raw.favorites.filter((s) => typeof s === 'string' && s);
  }
  if (raw.assignments && typeof raw.assignments === 'object' && !Array.isArray(raw.assignments)) {
    for (const [roomId, ids] of Object.entries(raw.assignments)) {
      if (!Array.isArray(ids)) continue;
      const clean = [];
      for (const id of ids) {
        if (typeof id === 'string' && id && !clean.includes(id)) clean.push(id);
      }
      if (clean.length) out.assignments[roomId] = clean;
    }
  }
  if (Array.isArray(raw.customSpaces)) {
    for (const sp of raw.customSpaces) {
      if (!sp || typeof sp !== 'object' || typeof sp.id !== 'string' || !sp.id) continue;
      if (out.customSpaces.some((s) => s.id === sp.id)) continue;
      out.customSpaces.push({
        id: sp.id,
        title: typeof sp.title === 'string' && sp.title.trim() ? sp.title.trim() : 'Bereich',
        icon: typeof sp.icon === 'string' && sp.icon ? sp.icon : 'folder',
        accent: SPACES_ACCENTS.some((a) => a.id === sp.accent) ? sp.accent : 'violet',
      });
    }
  }
  return out;
}

/* ---------- Persistenz ---------- */

function schedulePutAccountData() {
  if (typeof hooks.putAccountData !== 'function') return;
  clearTimeout(putTimer);
  putTimer = setTimeout(() => {
    const payload = {
      version: 1,
      favorites: state.favorites.slice(),
      assignments: { ...state.assignments },
      customSpaces: state.customSpaces.map((s) => ({ ...s })),
    };
    lastSentJson = JSON.stringify(sanitizeState(payload));
    Promise.resolve(hooks.putAccountData(ACCOUNT_DATA_TYPE, payload)).catch((e) => {
      console.warn('[spaces] account_data konnte nicht geschrieben werden (lokaler Cache bleibt):', e);
    });
  }, PUT_DEBOUNCE_MS);
}

/** account_data-Update aus /sync live übernehmen; eigenes Echo wird ignoriert. */
export function applyRemoteState(content) {
  const incoming = sanitizeState(content);
  const json = JSON.stringify(incoming);
  if (json === lastSentJson) return;
  if (json === JSON.stringify(sanitizeState(state))) return; // keine Änderung
  state = incoming;
  saveLocal(LS_STATE, state);
  notifyChange();
}

function notifyChange() {
  if (typeof hooks.onChange === 'function') {
    try { hooks.onChange(); } catch (e) { console.error('[spaces] onChange-Fehler:', e); }
  }
}

/** Zentrale "es hat sich etwas geändert"-Routine für synchbaren Zustand. */
function changed() {
  saveLocal(LS_STATE, state);
  schedulePutAccountData();
  notifyChange();
}

/* ---------- Interne Setter (ohne changed(), für Sammel-Updates) ---------- */

function setFavoriteInternal(roomId, value) {
  const idx = state.favorites.indexOf(roomId);
  if (value && idx === -1) state.favorites.push(roomId);
  if (!value && idx !== -1) state.favorites.splice(idx, 1);
}

function setRoomSpaceIdsInternal(roomId, ids) {
  const clean = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !id) continue;
    if (id === 'main') { setFavoriteInternal(roomId, true); continue; }
    if (id === 'all') continue;
    if (assignableSpaceExists(id) && !clean.includes(id)) clean.push(id);
  }
  if (clean.length) state.assignments[roomId] = clean;
  else delete state.assignments[roomId];
}

/* ========================================================================
 * Öffentliche API – Zustand
 * ====================================================================== */

export async function initSpaces(opts) {
  const o = opts || {};
  hooks = {
    getRooms: typeof o.getRooms === 'function' ? o.getRooms : null,
    getAccountData: typeof o.getAccountData === 'function' ? o.getAccountData : null,
    putAccountData: typeof o.putAccountData === 'function' ? o.putAccountData : null,
    onChange: typeof o.onChange === 'function' ? o.onChange : null,
  };

  // 1) Lokaler Cache (sofort verfügbar)
  state = sanitizeState(loadLocal(LS_STATE));

  // 2) account_data als primäre Quelle (überschreibt den Cache)
  if (hooks.getAccountData) {
    try {
      const remote = await hooks.getAccountData(ACCOUNT_DATA_TYPE);
      if (remote && typeof remote === 'object') {
        state = sanitizeState(remote);
        saveLocal(LS_STATE, state);
      }
    } catch (e) {
      console.warn('[spaces] account_data nicht ladbar, nutze lokalen Cache:', e);
    }
  }
}

export function getSpacesList() {
  const rooms = allRooms();
  const list = [];

  list.push({
    id: 'all', title: 'Alle', icon: 'chat', accent: 'var(--accent)', kind: 'all',
    count: rooms.length,
  });
  list.push({
    id: 'main', title: 'Main', icon: 'star', accent: 'var(--accent)', kind: 'main',
    count: rooms.filter((r) => r && state.favorites.includes(r.roomId)).length,
  });

  for (const b of BRIDGES) {
    const id = 'bridge:' + b.id;
    const count = rooms.filter(
      (r) => r && (detectBridge(r) === b.id || roomAssignedTo(r.roomId, id))
    ).length;
    if (count >= 1) {
      list.push({ id, title: b.title, icon: b.icon, accent: b.accent, kind: 'bridge', count });
    }
  }

  for (const sp of state.customSpaces) {
    list.push({
      id: sp.id, title: sp.title, icon: sp.icon, accent: accentCss(sp.accent), kind: 'custom',
      count: rooms.filter((r) => r && roomAssignedTo(r.roomId, sp.id)).length,
    });
  }

  return list;
}

export function detectBridge(room) {
  if (!room) return null;
  const signals = [];
  if (typeof room.bridgeProtocol === 'string' && room.bridgeProtocol) {
    signals.push(room.bridgeProtocol.toLowerCase());
  }
  if (typeof room.bridgeHint === 'string' && room.bridgeHint) {
    signals.push(room.bridgeHint.toLowerCase());
  }
  if (!signals.length) return null;
  for (const s of signals) {
    for (const id of KNOWN_BRIDGE_IDS) {
      if (s.includes(id)) return id;
    }
  }
  return 'bridge'; // Bridge-Signal vorhanden, aber kein bekannter Dienst
}

export function isFavorite(roomId) {
  return state.favorites.includes(roomId);
}

export function toggleFavorite(roomId) {
  if (typeof roomId !== 'string' || !roomId) return false;
  setFavoriteInternal(roomId, !isFavorite(roomId));
  changed();
  return isFavorite(roomId);
}

export function getRoomSpaceIds(roomId) {
  const ids = state.assignments[roomId];
  return Array.isArray(ids) ? ids.slice() : [];
}

export function setRoomSpaceIds(roomId, ids) {
  if (typeof roomId !== 'string' || !roomId) return;
  setRoomSpaceIdsInternal(roomId, ids);
  changed();
}

export function createCustomSpace(opts) {
  const o = opts || {};
  const space = {
    id: newSpaceId(),
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : 'Bereich',
    icon: typeof o.icon === 'string' && o.icon ? o.icon : 'folder',
    accent: SPACES_ACCENTS.some((a) => a.id === o.accent) ? o.accent : 'violet',
  };
  state.customSpaces.push(space);
  changed();
  return space.id;
}

export function updateCustomSpace(id, patch) {
  const space = customSpaceById(id);
  if (!space) return false;
  const p = patch || {};
  if (typeof p.title === 'string' && p.title.trim()) space.title = p.title.trim();
  if (typeof p.icon === 'string' && p.icon) space.icon = p.icon;
  if (SPACES_ACCENTS.some((a) => a.id === p.accent)) space.accent = p.accent;
  changed();
  return true;
}

export function deleteCustomSpace(id) {
  const idx = state.customSpaces.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  state.customSpaces.splice(idx, 1);
  for (const [roomId, ids] of Object.entries(state.assignments)) {
    const filtered = ids.filter((x) => x !== id);
    if (filtered.length) state.assignments[roomId] = filtered;
    else delete state.assignments[roomId];
  }
  changed();
  return true;
}
