/**
 * MatrixMess Web – Bereichs-/Space-System (spaces.js)
 *
 * Unterteilt Chats in Bereiche ("Spaces"), unabhängig davon, aus welcher
 * Bridge sie stammen. Vanilla-JS als natives ES-Modul, keine Frameworks,
 * kein Build-Step. DOM wird ausschließlich per document.createElement +
 * textContent/append aufgebaut (kein innerHTML mit dynamischen Daten).
 *
 * Bereichs-Arten:
 *  - 'all'    : Pseudo-Bereich "Alle" (zeigt jeden Raum)
 *  - 'main'   : "Main" – Favoriten aus allen Quellen
 *  - 'bridge' : automatisch erkannte Bridge-Bereiche (WhatsApp, Signal,
 *               Telegram, Instagram, Discord, Sonstige Bridges);
 *               IDs: 'bridge:whatsapp', 'bridge:signal', 'bridge:telegram',
 *               'bridge:instagram', 'bridge:discord', 'bridge:bridge'
 *  - 'custom' : selbst erstellte Bereiche (Titel + Emoji + Akzentfarbe);
 *               IDs: 'custom:<zufall>'
 *
 * Ein Raum kann in MEHREREN Bereichen gleichzeitig liegen (Mehrfach-
 * Zuordnung); die Navigation bewegt sich immer in genau EINEM aktiven
 * Bereich.
 *
 * Persistenz:
 *  - primär Matrix-account_data, Typ "io.matrixmess.spaces" (synct über
 *    Geräte): { version, favorites, assignments, customSpaces }
 *  - localStorage "mm.spaces" als Cache/Fallback
 *  - Collapsed-Zustand der Main-Sektionen NUR lokal: "mm.spacesCollapsed"
 *  - aktiver Bereich NUR lokal: "mm.spacesActive"
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
 * getActiveSpaceId() -> string
 * setActiveSpace(id)            // wechselt den aktiven Bereich (lokal persistiert)
 *
 * roomInActiveSpace(room) -> boolean
 *   Filterfunktion für die Raumliste:
 *   'all' -> true; 'main' -> Favorit; 'bridge:xyz' -> detectBridge(room)==='xyz'
 *   ODER manuell zugeordnet; 'custom:...' -> zugeordnet.
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
 * renderSpaceBar(containerEl)
 *   Rendert die horizontale Chip-Leiste in containerEl (komplett selbst,
 *   inkl. Events). Aktiver Bereich wird mit Akzentfarbe hervorgehoben; der
 *   "+"-Chip öffnet den Verwaltungs-Dialog (Erstellen/Umbenennen/Löschen
 *   eigener Bereiche). Die Leiste rendert sich bei Änderungen selbst neu.
 *
 * openAssignDialog(roomId, roomName)
 *   Modal: Favoriten-Toggle (Main) + Checkboxen aller Custom-Bereiche +
 *   Anzeige des automatisch erkannten Bridge-Bereichs. "Speichern" schreibt
 *   die Zuordnung.
 *
 * groupRoomsForMain(rooms) -> [{ key, title, icon, collapsed, rooms: [...] }]
 *   Gruppiert Räume nach Herkunft in Sektionen (Matrix, je Bridge) in
 *   stabiler Reihenfolge; nur nicht-leere Sektionen.
 *
 * toggleSectionCollapsed(key)
 *   Klappt eine Main-Sektion ein/aus (Zustand lokal persistent).
 *
 * SPACES_ACCENTS -> [{ id, label, css }]   // die 8 Akzentfarben
 */

import { icon } from './icons.js';

const ACCOUNT_DATA_TYPE = 'io.matrixmess.spaces';
const LS_STATE = 'mm.spaces';
const LS_COLLAPSED = 'mm.spacesCollapsed';
const LS_ACTIVE = 'mm.spacesActive';

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

/* Bekannte Bridges in stabiler Reihenfolge. 'bridge' = Sonstige Bridges. */
const BRIDGES = [
  { id: 'whatsapp',  title: 'WhatsApp',         icon: '🟢', accent: '#25D366' },
  { id: 'signal',    title: 'Signal',           icon: '🔷', accent: '#3A76F0' },
  { id: 'telegram',  title: 'Telegram',         icon: '✈️', accent: '#2AABEE' },
  { id: 'instagram', title: 'Instagram',        icon: '📸', accent: '#E1306C' },
  { id: 'discord',   title: 'Discord',          icon: '🎮', accent: '#5865F2' },
  { id: 'bridge',    title: 'Sonstige Bridges', icon: '🌉', accent: '#8E8E93' },
];

const KNOWN_BRIDGE_IDS = ['whatsapp', 'signal', 'telegram', 'instagram', 'discord'];

const EMOJI_PRESETS = [
  '📁', '⭐', '💼', '🏠', '👨‍👩‍👧', '❤️', '🎮', '🎓',
  '🎵', '⚽', '✈️', '🛒', '💡', '🍕', '🐾', '📷',
];

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

let collapsed = {};          // Sektions-Key -> bool (nur lokal)
let activeSpaceId = 'all';   // nur lokal

let spaceBarEl = null;       // zuletzt gerenderter Space-Bar-Container
let putTimer = null;
let activeModal = null;

/* ========================================================================
 * Hilfsfunktionen
 * ====================================================================== */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

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

/** Existiert der Bereich (als navigierbares Ziel)? */
function spaceExists(id) {
  if (id === 'all' || id === 'main') return true;
  if (typeof id !== 'string') return false;
  if (id.startsWith('bridge:')) return !!bridgeDef(id.slice(7));
  return !!customSpaceById(id);
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
        icon: typeof sp.icon === 'string' && sp.icon ? sp.icon : '📁',
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
    Promise.resolve(hooks.putAccountData(ACCOUNT_DATA_TYPE, payload)).catch((e) => {
      console.warn('[spaces] account_data konnte nicht geschrieben werden (lokaler Cache bleibt):', e);
    });
  }, PUT_DEBOUNCE_MS);
}

function notifyChange() {
  if (spaceBarEl && spaceBarEl.isConnected) renderSpaceBar(spaceBarEl);
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

  const col = loadLocal(LS_COLLAPSED);
  collapsed = col && typeof col === 'object' && !Array.isArray(col) ? col : {};

  const act = loadLocal(LS_ACTIVE);
  activeSpaceId = typeof act === 'string' && act ? act : 'all';

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

  if (!spaceExists(activeSpaceId)) {
    activeSpaceId = 'all';
    saveLocal(LS_ACTIVE, activeSpaceId);
  }
}

export function getSpacesList() {
  const rooms = allRooms();
  const list = [];

  list.push({
    id: 'all', title: 'Alle', icon: '💬', accent: 'var(--accent)', kind: 'all',
    count: rooms.length,
  });
  list.push({
    id: 'main', title: 'Main', icon: '⭐', accent: 'var(--accent)', kind: 'main',
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

export function getActiveSpaceId() {
  return activeSpaceId;
}

export function setActiveSpace(id) {
  const next = spaceExists(id) ? id : 'all';
  if (next === activeSpaceId) return;
  activeSpaceId = next;
  saveLocal(LS_ACTIVE, activeSpaceId);
  notifyChange();
}

export function roomInActiveSpace(room) {
  if (!room) return false;
  const id = activeSpaceId;
  if (id === 'all') return true;
  if (id === 'main') return isFavorite(room.roomId);
  if (id.startsWith('bridge:')) {
    return detectBridge(room) === id.slice(7) || roomAssignedTo(room.roomId, id);
  }
  return roomAssignedTo(room.roomId, id);
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
    icon: typeof o.icon === 'string' && o.icon ? o.icon : '📁',
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
  if (activeSpaceId === id) {
    activeSpaceId = 'all';
    saveLocal(LS_ACTIVE, activeSpaceId);
  }
  changed();
  return true;
}

/* ========================================================================
 * Öffentliche API – Main-Sektionen
 * ====================================================================== */

export function groupRoomsForMain(rooms) {
  let arr;
  if (Array.isArray(rooms)) arr = rooms;
  else if (rooms && typeof rooms.values === 'function') arr = Array.from(rooms.values());
  else arr = [];

  const sections = [{ key: 'matrix', title: 'Matrix', icon: '🌐', rooms: [] }];
  for (const b of BRIDGES) sections.push({ key: b.id, title: b.title, icon: b.icon, rooms: [] });
  const byKey = new Map(sections.map((s) => [s.key, s]));

  for (const room of arr) {
    if (!room) continue;
    const bridge = detectBridge(room);
    byKey.get(bridge || 'matrix').rooms.push(room);
  }

  return sections
    .filter((s) => s.rooms.length > 0)
    .map((s) => ({
      key: s.key,
      title: s.title,
      icon: s.icon,
      collapsed: !!collapsed[s.key],
      rooms: s.rooms,
    }));
}

export function toggleSectionCollapsed(key) {
  if (typeof key !== 'string' || !key) return;
  collapsed[key] = !collapsed[key];
  saveLocal(LS_COLLAPSED, collapsed);
  notifyChange();
}

/* ========================================================================
 * Space-Leiste (Chips)
 * ====================================================================== */

export function renderSpaceBar(containerEl) {
  if (!containerEl) return;
  spaceBarEl = containerEl;
  containerEl.classList.add('mm-space-bar');
  containerEl.replaceChildren();

  for (const sp of getSpacesList()) {
    const chip = el('button', 'mm-space-chip');
    chip.type = 'button';
    chip.style.setProperty('--sp-accent', sp.accent);
    const isActive = sp.id === activeSpaceId;
    if (isActive) chip.classList.add('active');
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    chip.title = sp.title;

    const chipIcon = el('span', 'mm-space-chip-icon');
    if (sp.kind === 'all') chipIcon.append(icon('chat', 14));
    else if (sp.kind === 'main') chipIcon.append(icon('star-filled', 14));
    else chipIcon.textContent = sp.icon;
    chip.append(chipIcon);
    chip.append(el('span', 'mm-space-chip-title', sp.title));
    if (typeof sp.count === 'number' && sp.count > 0) {
      chip.append(el('span', 'mm-space-chip-count', String(sp.count)));
    }
    chip.addEventListener('click', () => setActiveSpace(sp.id));
    containerEl.append(chip);
  }

  const addChip = el('button', 'mm-space-chip mm-space-chip-add');
  addChip.type = 'button';
  addChip.title = 'Bereiche verwalten';
  addChip.setAttribute('aria-label', 'Bereiche verwalten');
  const addIcon = el('span', 'mm-space-chip-icon');
  addIcon.append(icon('plus', 15));
  addChip.append(addIcon);
  addChip.addEventListener('click', () => openManageDialog());
  containerEl.append(addChip);
}

/* ========================================================================
 * Leichtes Modal (Overlay, ESC / Klick außerhalb schließt, fokusfähig)
 * ====================================================================== */

function openModal(titleText) {
  if (activeModal) activeModal.close();

  const overlay = el('div', 'mm-sp-overlay');
  const panel = el('div', 'mm-sp-modal');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', titleText);
  panel.tabIndex = -1;

  const header = el('div', 'mm-sp-modal-header');
  const title = el('h3', 'mm-sp-modal-title', titleText);
  const closeBtn = el('button', 'mm-sp-close');
  closeBtn.append(icon('x', 16));
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Schließen');
  header.append(title, closeBtn);

  const body = el('div', 'mm-sp-modal-body');
  const footer = el('div', 'mm-sp-modal-footer');
  panel.append(header, body, footer);
  overlay.append(panel);

  const prevFocus = document.activeElement;
  let closed = false;

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    if (activeModal === api) activeModal = null;
    if (prevFocus && typeof prevFocus.focus === 'function') {
      try { prevFocus.focus(); } catch (e) { /* egal */ }
    }
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown, true);

  document.body.append(overlay);
  panel.focus();

  const api = { overlay, panel, body, footer, close };
  activeModal = api;
  return api;
}

function footerButton(labelText, primary) {
  const btn = el('button', primary ? 'mm-sp-btn primary' : 'mm-sp-btn', labelText);
  btn.type = 'button';
  return btn;
}

/* ========================================================================
 * Zuordnungs-Dialog (Raum -> Bereiche)
 * ====================================================================== */

export function openAssignDialog(roomId, roomName) {
  if (typeof roomId !== 'string' || !roomId) return;
  const modal = openModal('Bereiche zuordnen');

  modal.body.append(el('div', 'mm-sp-dialog-sub', roomName || roomId));

  // --- Favorit (Main) ---
  let favChecked = isFavorite(roomId);
  const favRow = el('label', 'mm-sp-check mm-sp-check-fav');
  const favInput = document.createElement('input');
  favInput.type = 'checkbox';
  favInput.checked = favChecked;
  favInput.addEventListener('change', () => { favChecked = favInput.checked; });
  const favIcon = el('span', 'mm-sp-check-icon');
  favIcon.append(icon('star-filled', 16));
  favRow.append(
    favInput,
    favIcon,
    el('span', 'mm-sp-check-label', 'Main (Favorit)'),
  );
  modal.body.append(favRow);

  // --- Automatisch erkannter Bridge-Bereich (nur Anzeige) ---
  const room = allRooms().find((r) => r && r.roomId === roomId) || null;
  const bridge = room ? detectBridge(room) : null;
  if (bridge) {
    const def = bridgeDef(bridge);
    const info = el('div', 'mm-sp-bridge-info');
    info.append(
      el('span', 'mm-sp-check-icon', def ? def.icon : '🌉'),
      el('span', 'mm-sp-bridge-info-text',
        'Automatisch erkannt: ' + (def ? def.title : 'Bridge')),
    );
    modal.body.append(info);
  }

  // --- Custom-Bereiche als Checkboxen ---
  const current = new Set(getRoomSpaceIds(roomId));
  const checkedCustom = new Set(
    state.customSpaces.map((s) => s.id).filter((id) => current.has(id))
  );

  modal.body.append(el('div', 'mm-sp-group-label', 'Eigene Bereiche'));

  if (!state.customSpaces.length) {
    modal.body.append(el('div', 'mm-sp-empty-hint', 'Noch keine eigenen Bereiche vorhanden.'));
    const createBtn = footerButton('Neuen Bereich erstellen', false);
    createBtn.classList.add('mm-sp-inline-btn');
    createBtn.addEventListener('click', () => {
      modal.close();
      openManageDialog(true);
    });
    modal.body.append(createBtn);
  } else {
    for (const sp of state.customSpaces) {
      const row = el('label', 'mm-sp-check');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checkedCustom.has(sp.id);
      input.addEventListener('change', () => {
        if (input.checked) checkedCustom.add(sp.id);
        else checkedCustom.delete(sp.id);
      });
      const dot = el('span', 'mm-sp-dot');
      dot.style.setProperty('--sp-accent', accentCss(sp.accent));
      row.append(
        input,
        el('span', 'mm-sp-check-icon', sp.icon),
        el('span', 'mm-sp-check-label', sp.title),
        dot,
      );
      modal.body.append(row);
    }
  }

  // --- Footer ---
  const cancelBtn = footerButton('Abbrechen', false);
  cancelBtn.addEventListener('click', modal.close);
  const saveBtn = footerButton('Speichern', true);
  saveBtn.addEventListener('click', () => {
    // Manuelle Bridge-Zuordnungen (per API gesetzt) bleiben erhalten.
    const keepBridges = getRoomSpaceIds(roomId).filter((id) => id.startsWith('bridge:'));
    setFavoriteInternal(roomId, favChecked);
    setRoomSpaceIdsInternal(roomId, [...keepBridges, ...checkedCustom]);
    changed();
    modal.close();
  });
  modal.footer.append(cancelBtn, saveBtn);
}

/* ========================================================================
 * Verwaltungs-Dialog (eigene Bereiche erstellen/umbenennen/löschen)
 * ====================================================================== */

function openManageDialog(startWithCreate) {
  const modal = openModal('Bereiche verwalten');
  // editing: null = Listenansicht, 'new' = Erstellen, sonst Bereichs-ID
  let editing = startWithCreate ? 'new' : null;

  function renderList() {
    modal.body.replaceChildren();
    modal.footer.replaceChildren();

    if (!state.customSpaces.length) {
      modal.body.append(el('div', 'mm-sp-empty-hint',
        'Noch keine eigenen Bereiche. Erstelle einen Bereich, um Chats frei zu gruppieren.'));
    }

    for (const sp of state.customSpaces) {
      const row = el('div', 'mm-sp-space-row');
      const dot = el('span', 'mm-sp-dot');
      dot.style.setProperty('--sp-accent', accentCss(sp.accent));
      row.append(
        dot,
        el('span', 'mm-sp-check-icon', sp.icon),
        el('span', 'mm-sp-space-row-title', sp.title),
      );

      const editBtn = el('button', 'mm-sp-icon-btn');
      editBtn.append(icon('edit', 15));
      editBtn.type = 'button';
      editBtn.title = 'Bearbeiten';
      editBtn.setAttribute('aria-label', 'Bereich bearbeiten: ' + sp.title);
      editBtn.addEventListener('click', () => { editing = sp.id; render(); });

      const delBtn = el('button', 'mm-sp-icon-btn mm-sp-danger');
      delBtn.append(icon('trash', 15));
      delBtn.type = 'button';
      delBtn.title = 'Löschen';
      delBtn.setAttribute('aria-label', 'Bereich löschen: ' + sp.title);
      delBtn.addEventListener('click', () => {
        if (delBtn.dataset.confirm === '1') {
          deleteCustomSpace(sp.id);
          render();
        } else {
          delBtn.dataset.confirm = '1';
          delBtn.textContent = 'Sicher?';
          setTimeout(() => {
            if (delBtn.isConnected) {
              delete delBtn.dataset.confirm;
              delBtn.replaceChildren(icon('trash', 15));
            }
          }, 3000);
        }
      });

      row.append(editBtn, delBtn);
      modal.body.append(row);
    }

    const newBtn = footerButton('Neuer Bereich', true);
    newBtn.addEventListener('click', () => { editing = 'new'; render(); });
    modal.footer.append(newBtn);
  }

  function renderForm() {
    modal.body.replaceChildren();
    modal.footer.replaceChildren();

    const existing = editing !== 'new' ? customSpaceById(editing) : null;
    let icon = existing ? existing.icon : EMOJI_PRESETS[0];
    let accent = existing ? existing.accent : 'violet';

    // Titel
    const titleField = el('div', 'mm-sp-field');
    titleField.append(el('span', 'mm-sp-field-label', 'Titel'));
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'mm-sp-input';
    titleInput.placeholder = 'z. B. Familie';
    titleInput.maxLength = 40;
    titleInput.value = existing ? existing.title : '';
    titleField.append(titleInput);
    modal.body.append(titleField);

    // Emoji-Icon
    const iconField = el('div', 'mm-sp-field');
    iconField.append(el('span', 'mm-sp-field-label', 'Icon'));
    const grid = el('div', 'mm-sp-emoji-grid');
    const presets = EMOJI_PRESETS.includes(icon) ? EMOJI_PRESETS : [icon, ...EMOJI_PRESETS];
    const emojiButtons = [];
    for (const em of presets) {
      const b = el('button', 'mm-sp-emoji', em);
      b.type = 'button';
      b.setAttribute('aria-label', 'Icon ' + em);
      if (em === icon) b.classList.add('selected');
      b.addEventListener('click', () => {
        icon = em;
        for (const other of emojiButtons) other.classList.toggle('selected', other === b);
      });
      emojiButtons.push(b);
      grid.append(b);
    }
    iconField.append(grid);
    modal.body.append(iconField);

    // Akzentfarbe
    const accentField = el('div', 'mm-sp-field');
    accentField.append(el('span', 'mm-sp-field-label', 'Akzentfarbe'));
    const swatchRow = el('div', 'mm-sp-accents');
    const swatches = [];
    for (const a of SPACES_ACCENTS) {
      const s = el('button', 'mm-sp-swatch');
      s.type = 'button';
      s.title = a.label;
      s.setAttribute('aria-label', 'Akzentfarbe ' + a.label);
      s.style.setProperty('--sp-accent', a.css);
      if (a.id === accent) s.classList.add('selected');
      s.addEventListener('click', () => {
        accent = a.id;
        for (const other of swatches) other.classList.toggle('selected', other === s);
      });
      swatches.push(s);
      swatchRow.append(s);
    }
    accentField.append(swatchRow);
    modal.body.append(accentField);

    // Footer
    const backBtn = footerButton('Zurück', false);
    backBtn.addEventListener('click', () => { editing = null; render(); });
    const saveBtn = footerButton(existing ? 'Speichern' : 'Erstellen', true);
    saveBtn.addEventListener('click', () => {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.classList.add('invalid');
        titleInput.focus();
        return;
      }
      if (existing) updateCustomSpace(existing.id, { title, icon, accent });
      else createCustomSpace({ title, icon, accent });
      editing = null;
      render();
    });
    titleInput.addEventListener('input', () => titleInput.classList.remove('invalid'));
    modal.footer.append(backBtn, saveBtn);
    titleInput.focus();
  }

  function render() {
    if (editing === null) renderList();
    else renderForm();
  }

  render();
}
