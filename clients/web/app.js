/* MatrixMess Web – Vanilla-JS-Matrix-Client (Client-Server API v3)
   Keine Frameworks, kein Build-Step, keine externen Abhängigkeiten. */
'use strict';

/* ---------- Feature-Module ---------- */

import { icon } from './icons.js';
import * as spaces from './spaces.js';
import {
  renderAudioPlayer,
  renderVideoPlayer,
  openImageLightbox,
  createVoiceRecorder,
  decryptAttachment,
} from './media.js';
import { extractFirstUrl, renderLinkEmbed } from './embeds.js';
import { openEmojiPicker, QUICK_REACTIONS } from './emoji.js';
import {
  initCalendar,
  openEventPlanner,
  renderCalendarPanel,
  renderEventCard,
  getUpcomingCount,
} from './calendar.js';
import {
  initGames,
  startGame,
  collectGameState,
  renderGameCard,
  sendMove,
  GAME_KINDS,
  rollDice,
  flipCoin,
} from './games.js';

// Clickjacking-Schutz: GitHub Pages kann kein frame-ancestors als HTTP-Header
// senden (Meta-CSP ignoriert die Direktive) - Framebusting als Best-Effort.
if (window.top !== window.self) {
  try { window.top.location = window.self.location; }
  catch (e) { document.documentElement.textContent = ''; }
}

/* ========================================================================
 * Konstanten & DOM-Referenzen
 * ====================================================================== */

const LS_SESSION = 'mm.session';
const LS_SYNC_TOKEN = 'mm.syncToken';
const LS_SETTINGS = 'mm.settings';
const LS_CRYPTO_PICKLE = 'mm.cryptoPickle';
const LS_SIDEBAR_COLLAPSED = 'mm.sidebarCollapsed';
const LS_DRAFTS = 'mm.drafts';

const MEMBER_CACHE_MS = 5 * 60 * 1000;

const ACCENT_COLORS = [
  { name: 'Violett', value: '#8B4DF7' },
  { name: 'Blau', value: '#3478F6' },
  { name: 'Türkis', value: '#30B0C7' },
  { name: 'Grün', value: '#34C759' },
  { name: 'Orange', value: '#FF9500' },
  { name: 'Pink', value: '#FF2D55' },
  { name: 'Rot', value: '#FF3B30' },
  { name: 'Graphit', value: '#8E8E93' },
];

const GROUP_GAP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 80;
const SYNC_TIMEOUT_MS = 30000;
const SYNC_ABORT_MS = 40000;
const TYPING_RESEND_MS = 4000;

const $ = (sel) => document.querySelector(sel);

const loginScreen = $('#login-screen');
const loginForm = $('#login-form');
const loginHs = $('#login-hs');
const loginUser = $('#login-user');
const loginPass = $('#login-pass');
const loginError = $('#login-error');
const loginBtn = $('#login-btn');

const appEl = $('#app');
const roomListEl = $('#room-list');
const roomSearchEl = $('#room-search');
const chatEmptyEl = $('#chat-empty');
const chatViewEl = $('#chat-view');
const chatAvatarEl = $('#chat-avatar');
const chatNameEl = $('#chat-name');
const chatSubEl = $('#chat-sub');
const backBtn = $('#back-btn');
const timelineEl = $('#timeline');
const scrollDownBtn = $('#scroll-down-btn');
const scrollDownCount = $('#scroll-down-count');
const typingBar = $('#typing-bar');
const typingText = $('#typing-text');
const composerBanner = $('#composer-banner');
const bannerTitle = $('#banner-title');
const bannerBody = $('#banner-body');
const bannerCancel = $('#banner-cancel');
const composerInput = $('#composer-input');
const sendBtn = $('#send-btn');
const settingsBtn = $('#settings-btn');
const settingsOverlay = $('#settings-overlay');
const settingsClose = $('#settings-close');
const settingsUserEl = $('#settings-user');
const themeSeg = $('#theme-seg');
const accentRow = $('#accent-row');
const notifToggle = $('#notif-toggle');
const logoutBtn = $('#logout-btn');
const emojiPopover = $('#emoji-popover');
const toastContainer = $('#toast-container');
const cryptoStatusEl = $('#crypto-status');
const recoveryBtn = $('#recovery-btn');
const recoveryForm = $('#recovery-form');
const recoveryInput = $('#recovery-input');
const recoverySubmit = $('#recovery-submit');
const spaceBarEl = $('#space-bar');
const sidebarEl = $('#sidebar');
const sidebarToggle = $('#sidebar-toggle');
const calendarBtn = $('#calendar-btn');
const calendarBadge = $('#calendar-badge');
const eventBtn = $('#event-btn');
const composerEl = $('#composer');
const attachBtn = $('#attach-btn');
const gameBtn = $('#game-btn');
const fileInput = $('#file-input');
const emojiBtn = $('#emoji-btn');
const micBtn = $('#mic-btn');
const densitySeg = $('#density-seg');
const textSizeSeg = $('#textsize-seg');
const linkPreviewToggle = $('#linkpreview-toggle');
const inlineMediaToggle = $('#inlinemedia-toggle');
const enterSendToggle = $('#entersend-toggle');
const readReceiptToggle = $('#readreceipt-toggle');
const typingToggle = $('#typing-toggle');

/* ========================================================================
 * Zustand
 * ====================================================================== */

let session = null;          // { baseUrl, userId, accessToken, deviceId }
let settings = loadSettings();

const rooms = new Map();     // roomId -> Room
let directRoomIds = new Set();

let activeRoomId = null;
let syncToken = null;
let syncAbort = null;
let syncGeneration = 0;

let replyTarget = null;      // Event-Objekt, auf das geantwortet wird
let editTarget = null;       // eigenes Event-Objekt im Bearbeiten-Modus

let unseenCount = 0;         // neue fremde Nachrichten, während nicht am Ende gescrollt
let typingSent = false;
let lastTypingSentAt = 0;

/* ---------- E2EE-Zustand ---------- */

let cryptoEngine = null;        // CryptoEngine-Instanz aus crypto.js
let cryptoReady = false;        // true, sobald die Engine initialisiert ist
let cryptoInitPromise = null;   // Promise der laufenden Initialisierung

const pendingDecryption = new Map(); // roomId -> Map(eventId -> rohes m.room.encrypted-Event)
const memberCache = new Map();       // roomId -> { ts, userIds } (für encryptEvent)

/* ========================================================================
 * Hilfsfunktionen
 * ====================================================================== */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function enc(seg) {
  return encodeURIComponent(seg);
}

function txnId() {
  return 'mm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toast(msg) {
  const t = el('div', 'toast', msg);
  toastContainer.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.3s ease';
    setTimeout(() => t.remove(), 320);
  }, 3200);
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function startOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(ts) {
  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  const d = new Date(ts);
  if (diffDays === 0) return 'Heute';
  if (diffDays === 1) return 'Gestern';
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString('de-DE', { weekday: 'long' });
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('de-DE', opts);
}

function listTimeLabel(ts) {
  if (!ts) return '';
  const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
  const d = new Date(ts);
  if (diffDays === 0) return formatTime(ts);
  if (diffDays === 1) return 'Gestern';
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString('de-DE', { weekday: 'short' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function avatarColor(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  const hue = ((hash % 360) + 360) % 360;
  // Dezenter Namens-Gradient statt flacher Fläche (Element-X-Stil)
  return `linear-gradient(135deg, hsl(${hue}, 60%, 58%) 0%, hsl(${hue}, 55%, 45%) 100%)`;
}

/* ========================================================================
 * Einstellungen (Theme, Akzentfarbe, Benachrichtigungen)
 * ====================================================================== */

function loadSettings() {
  const defaults = {
    theme: 'system',
    accent: '#8B4DF7',
    notifications: false,
    density: 'comfortable',      // 'comfortable' | 'compact'
    textSize: 'standard',        // 'small' | 'standard' | 'large' | 'xlarge'
    linkPreviews: true,
    inlineMedia: true,
    readReceipts: true,
    typingIndicators: true,
    enterToSend: true,
  };
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return Object.assign(defaults, JSON.parse(raw));
  } catch (e) { /* ignorieren */ }
  return defaults;
}

function saveSettings() {
  try {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  } catch (e) { /* ignorieren */ }
}

function applySettings() {
  const root = document.documentElement;
  if (settings.theme === 'dark') root.setAttribute('data-theme', 'dark');
  else if (settings.theme === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
  root.style.setProperty('--accent', settings.accent);
  const sizeMap = { small: '13.5px', standard: '15px', large: '17px', xlarge: '19px' };
  root.style.setProperty('--msg-font-size', sizeMap[settings.textSize] || sizeMap.standard);
  const compact = settings.density === 'compact';
  roomListEl.classList.toggle('density-compact', compact);
  timelineEl.classList.toggle('density-compact', compact);
  renderSettingsPanel();
}

function renderSettingsPanel() {
  for (const btn of themeSeg.querySelectorAll('button')) {
    const sel = btn.dataset.themeOpt === settings.theme;
    btn.classList.toggle('selected', sel);
    btn.setAttribute('aria-checked', sel ? 'true' : 'false');
  }
  accentRow.textContent = '';
  for (const c of ACCENT_COLORS) {
    const sw = el('button', 'accent-swatch');
    sw.style.background = c.value;
    sw.title = c.name;
    sw.setAttribute('aria-label', 'Akzentfarbe ' + c.name);
    if (c.value.toLowerCase() === String(settings.accent).toLowerCase()) sw.classList.add('selected');
    sw.addEventListener('click', () => {
      settings.accent = c.value;
      saveSettings();
      applySettings();
    });
    accentRow.appendChild(sw);
  }
  for (const btn of densitySeg.querySelectorAll('button')) {
    const sel = btn.dataset.densityOpt === (settings.density || 'comfortable');
    btn.classList.toggle('selected', sel);
    btn.setAttribute('aria-checked', sel ? 'true' : 'false');
  }
  for (const btn of textSizeSeg.querySelectorAll('button')) {
    const sel = btn.dataset.textsizeOpt === (settings.textSize || 'standard');
    btn.classList.toggle('selected', sel);
    btn.setAttribute('aria-checked', sel ? 'true' : 'false');
  }
  linkPreviewToggle.checked = settings.linkPreviews !== false;
  inlineMediaToggle.checked = settings.inlineMedia !== false;
  enterSendToggle.checked = settings.enterToSend !== false;
  readReceiptToggle.checked = settings.readReceipts !== false;
  typingToggle.checked = settings.typingIndicators !== false;
  notifToggle.checked = !!settings.notifications &&
    ('Notification' in window) && Notification.permission === 'granted';
  settingsUserEl.textContent = session ? `Angemeldet als ${session.userId}` : '';
  renderCryptoSection();
}

function renderCryptoSection() {
  if (!cryptoStatusEl) return;
  cryptoStatusEl.textContent = cryptoReady
    ? 'Ende-zu-Ende-Verschlüsselung: aktiv'
    : 'Ende-zu-Ende-Verschlüsselung: nicht verfügbar';
  recoveryBtn.disabled = !cryptoReady;
  if (!cryptoReady) recoveryForm.classList.add('hidden');
}

/* ========================================================================
 * Session & API
 * ====================================================================== */

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.baseUrl && s.userId && s.accessToken) return s;
  } catch (e) { /* ignorieren */ }
  return null;
}

function saveSession(s) {
  localStorage.setItem(LS_SESSION, JSON.stringify(s));
}

function clearSessionStorage() {
  localStorage.removeItem(LS_SESSION);
  localStorage.removeItem(LS_SYNC_TOKEN);
}

class ApiError extends Error {
  constructor(message, errcode, status) {
    super(message);
    this.errcode = errcode;
    this.status = status;
  }
}

async function api(method, path, body, opts = {}) {
  if (!session) throw new ApiError('Keine Session', 'MM_NO_SESSION', 0);
  const headers = { Authorization: 'Bearer ' + session.accessToken };
  if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
  const res = await fetch(session.baseUrl + path, {
    method,
    headers,
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const errcode = data && data.errcode;
    const msg = (data && data.error) || `HTTP ${res.status}`;
    throw new ApiError(msg, errcode, res.status);
  }
  return data;
}

/* ---------- account_data (user-scoped) ---------- */

async function getAccountData(type) {
  try {
    return await api('GET',
      `/_matrix/client/v3/user/${enc(session.userId)}/account_data/${enc(type)}`);
  } catch (err) {
    if (err && (err.status === 404 || err.errcode === 'M_NOT_FOUND')) return null;
    throw err;
  }
}

function putAccountData(type, content) {
  return api('PUT',
    `/_matrix/client/v3/user/${enc(session.userId)}/account_data/${enc(type)}`, content);
}

/* ---------- Feature-Module: Bereiche (Spaces) & Kalender ---------- */

async function initFeatureModules() {
  spaces.renderSpaceBar(spaceBarEl);
  try {
    await spaces.initSpaces({
      getRooms: () => [...rooms.values()],
      getAccountData,
      putAccountData,
      onChange: () => {
        spaces.renderSpaceBar(spaceBarEl);
        renderRoomList();
      },
    });
  } catch (err) {
    console.warn('Bereiche konnten nicht initialisiert werden:', err);
  }
  spaces.renderSpaceBar(spaceBarEl);
  renderRoomList();
  try {
    await initCalendar({
      getAccountData,
      putAccountData,
      sendEventMessage,
      onChange: updateCalendarBadge,
      getUserId: () => (session ? session.userId : ''),
    });
  } catch (err) {
    console.warn('Kalender konnte nicht initialisiert werden:', err);
  }
  updateCalendarBadge();

  try {
    initGames({
      sendGameEvent: async (roomId, content) => {
        const room = rooms.get(roomId);
        if (!room) return null;
        await sendRoomMessage(room, content);
      },
      getMyUserId: () => (session ? session.userId : ''),
    });
  } catch (err) {
    console.warn('Spiele konnten nicht initialisiert werden:', err);
  }
}

/** true, wenn das Event ein Spielzug ist (wird in der Timeline nicht als
 *  eigene Bubble angezeigt – nur der Spielbrett-Zustand zählt). */
function isGameMove(ev) {
  const g = ev && ev.content && ev.content['io.matrixmess.game'];
  return !!(g && g.action === 'move');
}

/** true, wenn das Event ein Spielstart ist (wird als Spielkarte gerendert). */
function isGameStart(ev) {
  const g = ev && ev.content && ev.content['io.matrixmess.game'];
  return !!(g && g.action === 'start');
}

/** Öffnet ein kleines Menü mit den verfügbaren Spielen über dem Spiel-Button. */
function openGameMenu() {
  if (!activeRoomId) return;
  const room = rooms.get(activeRoomId);
  if (!room || room.isEncrypted) return;
  closeGameMenu();
  const menu = el('div', 'game-menu');
  menu.id = 'game-menu';
  for (const g of GAME_KINDS) {
    const b = el('button', 'game-menu-item');
    b.appendChild(icon('gamepad', 16));
    b.appendChild(el('span', null, g.label));
    b.addEventListener('click', () => {
      closeGameMenu();
      startGame(activeRoomId, g.id);
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = gameBtn.getBoundingClientRect();
  menu.style.left = Math.max(8, r.left) + 'px';
  menu.style.top = (r.top - menu.offsetHeight - 8) + 'px';
  setTimeout(() => document.addEventListener('click', gameMenuOutside, { once: true }), 0);
}

function gameMenuOutside(e) {
  const menu = document.getElementById('game-menu');
  if (menu && !menu.contains(e.target) && e.target !== gameBtn) closeGameMenu();
}

function closeGameMenu() {
  const menu = document.getElementById('game-menu');
  if (menu) menu.remove();
}

gameBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.getElementById('game-menu')) { closeGameMenu(); return; }
  openGameMenu();
});

function updateCalendarBadge() {
  const n = getUpcomingCount();
  if (n > 0) {
    calendarBadge.textContent = n > 99 ? '99+' : String(n);
    calendarBadge.classList.remove('hidden');
  } else {
    calendarBadge.classList.add('hidden');
  }
}

/** Sendet die Termin-Nachricht des Kalender-Moduls in den Raum
 *  (E2EE-Räume werden über sendRoomMessage automatisch verschlüsselt). */
async function sendEventMessage(roomId, evt) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Raum nicht gefunden');
  const when = new Date(evt.startTs).toLocaleDateString('de-DE',
    { weekday: 'short', day: 'numeric', month: 'long' }) + ', ' + formatTime(evt.startTs);
  await sendRoomMessage(room, {
    msgtype: 'm.text',
    body: '📅 ' + evt.title + ' – ' + when,
    'io.matrixmess.event': Object.assign({}, evt),
  });
}

/* ---------- Login / Logout ---------- */

async function discoverBaseUrl(input) {
  let hs = String(input || '').trim();
  if (!hs) hs = 'https://matrix.org';
  if (!/^https?:\/\//i.test(hs)) hs = 'https://' + hs;
  hs = hs.replace(/\/+$/, '');
  try {
    const res = await fetch(hs + '/.well-known/matrix/client');
    if (res.ok) {
      const wk = await res.json();
      const base = wk && wk['m.homeserver'] && wk['m.homeserver'].base_url;
      if (typeof base === 'string' && /^https?:\/\//i.test(base)) {
        return base.replace(/\/+$/, '');
      }
    }
  } catch (e) { /* Fallback: eingegebene URL */ }
  return hs;
}

async function doLogin(hsInput, user, password) {
  const baseUrl = await discoverBaseUrl(hsInput);
  let localUser = user.trim();
  // "@user:server" ist als identifier ebenso gültig wie der Localpart.
  const res = await fetch(baseUrl + '/_matrix/client/v3/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: localUser },
      password: password,
      initial_device_display_name: 'MatrixMess Web',
    }),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok) {
    const errcode = data && data.errcode;
    throw new ApiError((data && data.error) || `HTTP ${res.status}`, errcode, res.status);
  }
  return {
    baseUrl,
    userId: data.user_id,
    accessToken: data.access_token,
    deviceId: data.device_id,
  };
}

async function doLogout() {
  const old = session;
  stopSync();
  if (old) {
    try {
      await fetch(old.baseUrl + '/_matrix/client/v3/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + old.accessToken },
      });
    } catch (e) { /* Logout best effort */ }
  }
  hardLogout();
}

/** Session lokal verwerfen und Login zeigen (z. B. bei M_UNKNOWN_TOKEN). */
function hardLogout() {
  stopSync();
  clearCryptoState(session && session.userId);
  session = null;
  clearSessionStorage();
  rooms.clear();
  directRoomIds = new Set();
  activeRoomId = null;
  syncToken = null;
  replyTarget = null;
  editTarget = null;
  for (const url of createdObjectURLs) {
    try { URL.revokeObjectURL(url); } catch (e) { /* */ }
  }
  createdObjectURLs.length = 0;
  mediaCache.clear();
  attachmentBlobCache.clear();
  inlineImageUrlCache.clear();
  showLogin();
}

/* ========================================================================
 * Ende-zu-Ende-Verschlüsselung (Olm/Megolm via crypto.js)
 * ====================================================================== */

/** Lädt und initialisiert die Crypto-Engine. Fehler sind nicht fatal:
 *  der Client degradiert auf den bisherigen Platzhalter-Modus. */
async function initCrypto() {
  cryptoReady = false;
  try {
    if (!session || !session.deviceId) {
      throw new Error('Session ohne deviceId (alte Anmeldung?) – bitte neu anmelden für E2EE');
    }
    const mod = await import('./crypto.js');
    const engine = new mod.CryptoEngine();
    await engine.init({
      baseUrl: session.baseUrl,
      userId: session.userId,
      deviceId: session.deviceId,
      accessToken: session.accessToken,
      apiFetch: api,
    });
    cryptoEngine = engine;
    cryptoReady = true;
    renderCryptoSection();
    if (activeRoomId) {
      const room = rooms.get(activeRoomId);
      if (room) renderChatHeader(room);
    }
  } catch (err) {
    console.warn('Verschlüsselung konnte nicht initialisiert werden:', err);
    cryptoEngine = null;
    cryptoReady = false;
    renderCryptoSection();
    toast('Verschlüsselung konnte nicht geladen werden – E2EE-Räume bleiben schreibgeschützt');
  }
}

/** Crypto-Zustand beim Logout verwerfen: Engine schließen, Pickle-Key und
 *  IndexedDB-Store löschen. */
function clearCryptoState(userId) {
  if (cryptoEngine) {
    try { cryptoEngine.close(); } catch (e) { /* */ }
  }
  cryptoEngine = null;
  cryptoReady = false;
  cryptoInitPromise = null;
  pendingDecryption.clear();
  memberCache.clear();
  try { localStorage.removeItem(LS_CRYPTO_PICKLE); } catch (e) { /* */ }
  if (userId && typeof indexedDB !== 'undefined') {
    const base = 'mm-crypto-' + userId;
    // matrix-sdk-crypto-wasm legt "<name>::matrix-sdk-crypto"(-meta) an.
    for (const name of [base, base + '::matrix-sdk-crypto', base + '::matrix-sdk-crypto-meta']) {
      try { indexedDB.deleteDatabase(name); } catch (e) { /* */ }
    }
  }
  renderCryptoSection();
}

/** Merkt sich ein (noch) nicht entschlüsselbares Event für spätere Versuche. */
function markPendingDecryption(roomId, rawEvent) {
  if (!rawEvent || !rawEvent.event_id) return;
  let byId = pendingDecryption.get(roomId);
  if (!byId) {
    byId = new Map();
    pendingDecryption.set(roomId, byId);
  }
  byId.set(rawEvent.event_id, rawEvent);
}

/**
 * Versucht, ein rohes m.room.encrypted-Event zu entschlüsseln.
 * Erfolg: Rückgabe eines gemergten Klartext-Events (event_id/sender/ts/unsigned
 * bleiben erhalten, damit Dedupe über transaction_id weiter funktioniert),
 * markiert mit __mmEncrypted. Misserfolg: Original-Event zurück und in
 * pendingDecryption vormerken.
 */
async function maybeDecryptRaw(roomId, ev) {
  if (!cryptoReady || !cryptoEngine) return ev;
  if (!ev || ev.type !== 'm.room.encrypted' || ev.state_key !== undefined) return ev;
  let decrypted = null;
  try {
    decrypted = await cryptoEngine.decryptEvent(ev, roomId);
  } catch (e) { /* wie "nicht entschlüsselbar" behandeln */ }
  if (decrypted && decrypted.type) {
    return Object.assign({}, ev, {
      type: decrypted.type,
      content: decrypted.content || {},
      __mmEncrypted: true,
    });
  }
  markPendingDecryption(roomId, ev);
  return ev;
}

/** Entschlüsselt alle Timeline-Events einer /sync-Antwort in-place. */
async function decryptSyncResponse(data) {
  const joined = (data.rooms && data.rooms.join) || {};
  for (const [roomId, jr] of Object.entries(joined)) {
    const tl = jr.timeline;
    if (!tl || !Array.isArray(tl.events)) continue;
    for (let i = 0; i < tl.events.length; i++) {
      tl.events[i] = await maybeDecryptRaw(roomId, tl.events[i]);
    }
  }
}

/** Entfernt ein Event-Objekt (Platzhalter) aus Timeline und Index. */
function removeEventObject(room, eventId) {
  const obj = room.eventIndex.get(eventId);
  if (!obj) return;
  room.eventIndex.delete(eventId);
  const idx = room.events.indexOf(obj);
  if (idx >= 0) room.events.splice(idx, 1);
}

/**
 * Versucht alle vorgemerkten, bisher nicht entschlüsselbaren Events erneut
 * (z. B. nachdem per to_device neue Room-Keys angekommen sind oder nach einem
 * Backup-Import). Erfolgreiche Events ersetzen ihren Platzhalter.
 */
async function retryPendingDecryption() {
  if (!cryptoReady || !cryptoEngine || pendingDecryption.size === 0) return;
  const changedRooms = new Set();

  for (const [roomId, byId] of [...pendingDecryption]) {
    const room = rooms.get(roomId);
    if (!room) {
      pendingDecryption.delete(roomId);
      continue;
    }
    for (const [eventId, raw] of [...byId]) {
      let decrypted = null;
      try {
        decrypted = await cryptoEngine.decryptEvent(raw, roomId);
      } catch (e) { /* bleibt pending */ }
      if (!decrypted || !decrypted.type) continue;
      byId.delete(eventId);
      changedRooms.add(roomId);

      const merged = Object.assign({}, raw, {
        type: decrypted.type,
        content: decrypted.content || {},
      });
      const rel = merged.content && merged.content['m.relates_to'];

      if (merged.type === 'm.room.message' && rel && rel.rel_type === 'm.replace' &&
          rel.event_id && merged.content['m.new_content']) {
        // Spät entschlüsselter Edit: Platzhalter entfernen, Edit anwenden.
        removeEventObject(room, eventId);
        applyEditEvent(room, merged);
      } else if (merged.type !== 'm.room.message') {
        // Unerwarteter Typ (z. B. verschlüsselte Reaktion anderer Clients):
        // Platzhalter entfernen und regulär verarbeiten.
        removeEventObject(room, eventId);
        applyTimelineEvent(room, Object.assign({ __mmEncrypted: true }, merged), false);
      } else {
        const obj = room.eventIndex.get(eventId);
        if (obj) {
          obj.type = merged.type;
          obj.content = merged.content;
          obj.encrypted = true;
          updateRoomPreview(room, obj);
        }
      }
    }
    if (byId.size === 0) pendingDecryption.delete(roomId);
  }

  if (changedRooms.size) {
    renderRoomList();
    if (activeRoomId && changedRooms.has(activeRoomId)) {
      renderTimeline(isNearBottom() ? 'bottom' : 'keep');
    }
  }
}

/** Liefert die (max. 5 Minuten gecachten) User-IDs aller Raum-Mitglieder. */
async function getJoinedMembers(roomId) {
  const cached = memberCache.get(roomId);
  if (cached && Date.now() - cached.ts < MEMBER_CACHE_MS) return cached.userIds;
  const res = await api('GET', `/_matrix/client/v3/rooms/${enc(roomId)}/joined_members`);
  const userIds = Object.keys((res && res.joined) || {});
  memberCache.set(roomId, { ts: Date.now(), userIds });
  return userIds;
}

/** Verschlüsselt einen m.room.message-Content für einen Raum und liefert den
 *  Content des m.room.encrypted-Events. Relationen gehören laut Spec
 *  zusätzlich UNVERSCHLÜSSELT an den äußeren Content. */
async function encryptForRoom(room, content) {
  const members = await getJoinedMembers(room.roomId);
  const encrypted = await cryptoEngine.encryptEvent(room.roomId, 'm.room.message', content, members);
  if (content['m.relates_to']) {
    encrypted['m.relates_to'] = content['m.relates_to'];
  }
  return encrypted;
}

/* ========================================================================
 * Medien: mxc:// -> Object-URL (authentifiziert, mit Legacy-Fallback)
 * ====================================================================== */

const mediaCache = new Map(); // cacheKey -> Promise<string objectURL>
const createdObjectURLs = []; // für Aufräumen beim Logout

function mxcToObjectURL(mxc, thumb) {
  const key = mxc + (thumb ? `|${thumb.width}x${thumb.height}|${thumb.method || 'scale'}` : '|full');
  if (mediaCache.has(key)) return mediaCache.get(key);
  const promise = (async () => {
    const m = /^mxc:\/\/([^/]+)\/([^/?#]+)/.exec(String(mxc || ''));
    if (!m) throw new Error('Ungültige mxc-URL');
    if (!session) throw new Error('Keine Session');
    const server = enc(m[1]);
    const mediaId = enc(m[2]);
    const kind = thumb ? 'thumbnail' : 'download';
    const query = thumb
      ? `?width=${enc(thumb.width)}&height=${enc(thumb.height)}&method=${enc(thumb.method || 'scale')}`
      : '';
    // 1. Versuch: authentifizierte Medien-Endpunkte (Matrix 1.11)
    const authUrl = `${session.baseUrl}/_matrix/client/v1/media/${kind}/${server}/${mediaId}${query}`;
    try {
      const res = await fetch(authUrl, {
        headers: { Authorization: 'Bearer ' + session.accessToken },
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        createdObjectURLs.push(url);
        return url;
      }
    } catch (e) { /* weiter zum Fallback */ }
    // 2. Fallback: Legacy-Endpunkt ohne Auth
    const legacyUrl = `${session.baseUrl}/_matrix/media/v3/${kind}/${server}/${mediaId}${query}`;
    const res2 = await fetch(legacyUrl);
    if (!res2.ok) throw new Error('Medien-Download fehlgeschlagen (' + res2.status + ')');
    const url2 = URL.createObjectURL(await res2.blob());
    createdObjectURLs.push(url2);
    return url2;
  })();
  mediaCache.set(key, promise);
  promise.then(
    (url) => mediaCache.set(key, Promise.resolve(url)),
    () => mediaCache.delete(key)
  );
  return promise;
}

/* ========================================================================
 * Anhänge: Bytes laden & (bei E2EE-Attachments) entschlüsseln
 * ====================================================================== */

const attachmentBlobCache = new Map();  // mxc -> Promise<Blob> (ggf. entschlüsselt)
const inlineImageUrlCache = new Map();  // mxc -> Promise<string objectURL> (dauerhaft)

async function fetchMxcArrayBuffer(mxc) {
  const m = /^mxc:\/\/([^/]+)\/([^/?#]+)/.exec(String(mxc || ''));
  if (!m) throw new Error('Ungültige mxc-URL');
  if (!session) throw new Error('Keine Session');
  const server = enc(m[1]);
  const mediaId = enc(m[2]);
  const authUrl = `${session.baseUrl}/_matrix/client/v1/media/download/${server}/${mediaId}`;
  let authStatus = 0;
  try {
    const res = await fetch(authUrl, {
      headers: { Authorization: 'Bearer ' + session.accessToken },
    });
    if (res.ok) return await res.arrayBuffer();
    authStatus = res.status;
  } catch (e) { /* Netzwerkfehler: Fallback versuchen */ }
  // Legacy-Fallback nur, wenn der authentifizierte Endpoint fehlt (alter
  // Server, 404) oder gar nicht erreichbar war - 401/403/429 durchreichen,
  // statt sie mit einem zweiten, unautorisierten Request zu maskieren.
  if (authStatus !== 0 && authStatus !== 404 && authStatus !== 400) {
    throw new Error('Medien-Download fehlgeschlagen (' + authStatus + ')');
  }
  const legacyUrl = `${session.baseUrl}/_matrix/media/v3/download/${server}/${mediaId}`;
  const res2 = await fetch(legacyUrl);
  if (!res2.ok) throw new Error('Medien-Download fehlgeschlagen (' + res2.status + ')');
  return await res2.arrayBuffer();
}

/** Liefert das Attachment eines Message-Contents als Blob. Bei content.file
 *  (EncryptedFile v2 aus E2EE-Räumen) wird der Ciphertext geladen und via
 *  media.decryptAttachment entschlüsselt; sonst wird content.url geladen. */
function getAttachmentBlob(content) {
  const file = content && content.file;
  const mxc = file ? file.url : content && content.url;
  if (!mxc) return Promise.reject(new Error('Kein Anhang vorhanden'));
  if (attachmentBlobCache.has(mxc)) return attachmentBlobCache.get(mxc);
  const promise = (async () => {
    let buf = await fetchMxcArrayBuffer(mxc);
    if (file) buf = await decryptAttachment(buf, file);
    const mime = (content.info && content.info.mimetype) || 'application/octet-stream';
    return new Blob([buf], { type: mime });
  })();
  attachmentBlobCache.set(mxc, promise);
  promise.catch(() => attachmentBlobCache.delete(mxc));
  return promise;
}

/** getBlobUrl-Closure für die media.js-Player: liefert bei jedem Aufruf eine
 *  FRISCHE blob:-URL, weil die Player sie beim Entfernen aus dem DOM revoken
 *  (das Blob selbst bleibt gecacht). */
function attachmentUrlGetter(content) {
  return async () => URL.createObjectURL(await getAttachmentBlob(content));
}

/** Dauerhafte (gecachte) Object-URL für Inline-Vorschauen verschlüsselter
 *  Bilder – wird erst beim Logout freigegeben. */
function getInlineAttachmentURL(content) {
  const file = content && content.file;
  const mxc = file ? file.url : content && content.url;
  if (!mxc) return Promise.reject(new Error('Kein Anhang vorhanden'));
  if (inlineImageUrlCache.has(mxc)) return inlineImageUrlCache.get(mxc);
  const promise = getAttachmentBlob(content).then((blob) => {
    const url = URL.createObjectURL(blob);
    createdObjectURLs.push(url);
    return url;
  });
  inlineImageUrlCache.set(mxc, promise);
  promise.catch(() => inlineImageUrlCache.delete(mxc));
  return promise;
}

/* ========================================================================
 * State-Modell
 * ====================================================================== */

function getRoom(roomId) {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      explicitName: null,
      avatarMxc: null,
      heroes: [],
      members: new Map(),       // userId -> { displayname, avatarUrl }
      lastEventTs: 0,
      lastPreview: '',
      lastPreviewSender: null,
      unread: 0,
      isEncrypted: false,
      isDirect: directRoomIds.has(roomId),
      typing: [],
      events: [],               // chronologisch
      eventIndex: new Map(),    // eventId -> Event-Objekt
      reactionIndex: new Map(), // reactionEventId -> { targetId, key, sender }
      pendingByTxn: new Map(),  // txnId -> Pending-Event
      prevBatch: null,
      paginating: false,
      lastReceiptEventId: null,
      bridgeProtocol: null,     // aus m.bridge / uk.half-shot.bridge
      bridgeHint: null,         // aus Sender-Prefixen (@whatsapp_ …)
    };
    rooms.set(roomId, room);
  }
  return room;
}

function roomDisplayName(room) {
  if (room.explicitName) return room.explicitName;
  if (room.heroes && room.heroes.length) {
    const names = room.heroes.slice(0, 3).map((uid) => memberName(room, uid));
    let label = names.join(', ');
    if (room.heroes.length > 3) label += ' …';
    return label || 'Unbenannter Raum';
  }
  return 'Unbenannter Raum';
}

function memberName(room, userId) {
  const m = room.members.get(userId);
  if (m && m.displayname) return m.displayname;
  return String(userId || '').replace(/^@/, '').split(':')[0] || String(userId || '');
}

function roomAvatarMxc(room) {
  if (room.avatarMxc) return room.avatarMxc;
  if (room.heroes && room.heroes.length === 1) {
    const m = room.members.get(room.heroes[0]);
    if (m && m.avatarUrl) return m.avatarUrl;
  }
  return null;
}

/* ---------- Anzeigeform eines Events ---------- */

function hasReplyRelation(content) {
  const rel = content && content['m.relates_to'];
  return !!(rel && rel['m.in_reply_to'] && rel['m.in_reply_to'].event_id);
}

/** Entfernt den "> ..."-Reply-Fallback aus dem Body. */
function stripReplyFallback(body) {
  const lines = String(body || '').split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('>')) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i).join('\n');
}

function eventDisplayBody(ev) {
  if (!ev) return '';
  if (ev.redacted) return 'Nachricht gelöscht';
  if (ev.type === 'm.room.encrypted') return '🔒 Verschlüsselte Nachricht';
  const c = ev.content || {};
  if (ev.type !== 'm.room.message') return '';
  let body = ev.editedBody !== undefined && ev.editedBody !== null ? ev.editedBody : (c.body || '');
  if (hasReplyRelation(c) && (ev.editedBody === undefined || ev.editedBody === null)) {
    body = stripReplyFallback(body);
  }
  switch (c.msgtype) {
    case 'm.image': return '📷 Bild';
    case 'm.video': return '🎬 Video';
    case 'm.audio': return '🎵 Audio';
    case 'm.file': return '📎 ' + (c.filename || c.body || 'Datei');
    case 'm.emote': return '∗ ' + body;
    default: return body;
  }
}

function updateRoomPreview(room, ev) {
  const ts = ev.ts || 0;
  if (ts >= room.lastEventTs) {
    room.lastEventTs = ts;
    room.lastPreview = truncate(eventDisplayBody(ev), 90);
    room.lastPreviewSender = ev.sender;
  }
}

/* ---------- State-Events ---------- */

function applyStateEvent(room, ev) {
  const c = ev.content || {};
  switch (ev.type) {
    case 'm.room.name':
      room.explicitName = c.name || null;
      break;
    case 'm.room.avatar':
      room.avatarMxc = c.url || null;
      break;
    case 'm.room.encryption':
      room.isEncrypted = true;
      break;
    case 'm.bridge':
    case 'uk.half-shot.bridge':
      if (c.protocol && typeof c.protocol.id === 'string' && c.protocol.id) {
        room.bridgeProtocol = c.protocol.id;
      }
      break;
    case 'm.room.member':
      if (ev.state_key) {
        room.members.set(ev.state_key, {
          displayname: c.displayname || null,
          avatarUrl: c.avatar_url || null,
          membership: c.membership || null,
        });
      }
      break;
  }
}

/* ---------- Timeline-Events ---------- */

function makeEventObject(ev) {
  return {
    eventId: ev.event_id || null,
    sender: ev.sender,
    type: ev.type,
    content: ev.content || {},
    ts: ev.origin_server_ts || Date.now(),
    editedBody: null,
    redacted: !!(ev.unsigned && ev.unsigned.redacted_because),
    reactions: new Map(), // emoji -> { count, mine, myEventId }
    pending: false,
    failed: false,
    txnId: null,
    encrypted: !!ev.__mmEncrypted, // wurde aus m.room.encrypted entschlüsselt
  };
}

function applyReactionEvent(room, ev) {
  if (!ev.event_id || room.reactionIndex.has(ev.event_id)) return;
  const rel = ev.content && ev.content['m.relates_to'];
  if (!rel || rel.rel_type !== 'm.annotation' || !rel.event_id || !rel.key) return;
  room.reactionIndex.set(ev.event_id, { targetId: rel.event_id, key: rel.key, sender: ev.sender });
  const target = room.eventIndex.get(rel.event_id);
  if (!target) return;
  let agg = target.reactions.get(rel.key);
  if (!agg) {
    agg = { count: 0, mine: false, myEventId: null };
    target.reactions.set(rel.key, agg);
  }
  const isMine = session && ev.sender === session.userId;
  if (isMine && agg.mine) {
    // Optimistische eigene Reaktion war schon eingerechnet – nur ID aktualisieren.
    agg.myEventId = ev.event_id;
    return;
  }
  agg.count++;
  if (isMine) {
    agg.mine = true;
    agg.myEventId = ev.event_id;
  }
}

function applyRedactionEvent(room, ev) {
  const redactsId = ev.redacts || (ev.content && ev.content.redacts);
  if (!redactsId) return;
  const reaction = room.reactionIndex.get(redactsId);
  if (reaction) {
    room.reactionIndex.delete(redactsId);
    const target = room.eventIndex.get(reaction.targetId);
    if (target) {
      const agg = target.reactions.get(reaction.key);
      if (agg) {
        agg.count--;
        if (session && reaction.sender === session.userId) {
          agg.mine = false;
          agg.myEventId = null;
        }
        if (agg.count <= 0) target.reactions.delete(reaction.key);
      }
    }
    return;
  }
  const target = room.eventIndex.get(redactsId);
  if (target) {
    target.redacted = true;
    target.editedBody = null;
    target.reactions.clear();
  }
}

function applyEditEvent(room, ev) {
  const rel = ev.content['m.relates_to'];
  const newContent = ev.content['m.new_content'];
  const target = room.eventIndex.get(rel.event_id);
  if (target && target.sender === ev.sender && !target.redacted) {
    target.editedBody = (newContent && newContent.body) || '';
  }
}

/* ---------- Bridge-Erkennung über Sender-Prefixe ---------- */

const BRIDGE_SENDER_PREFIXES = [
  ['@whatsapp_', 'whatsapp'],
  ['@signal_', 'signal'],
  ['@telegram_', 'telegram'],
  ['@telegrambot', 'telegram'],
  ['@instagram_', 'instagram'],
  ['@_discord_', 'discord'],
  ['@discord_', 'discord'],
];

function updateBridgeHint(room, sender) {
  if (!sender || room.bridgeHint) return;
  const s = String(sender).toLowerCase();
  for (const [prefix, hint] of BRIDGE_SENDER_PREFIXES) {
    if (s.startsWith(prefix)) {
      room.bridgeHint = hint;
      return;
    }
  }
}

/**
 * Verarbeitet ein Timeline-Event.
 * @returns {boolean} true, wenn ein neues sichtbares Event angefügt wurde
 */
function applyTimelineEvent(room, ev, live) {
  const type = ev.type;
  updateBridgeHint(room, ev.sender);

  if (type === 'm.room.redaction') {
    applyRedactionEvent(room, ev);
    return false;
  }
  if (type === 'm.reaction') {
    applyReactionEvent(room, ev);
    return false;
  }
  if (type !== 'm.room.message' && type !== 'm.room.encrypted') return false;

  // Edits (m.replace) verändern das Ziel-Event, statt angefügt zu werden.
  if (type === 'm.room.message') {
    const rel = ev.content && ev.content['m.relates_to'];
    if (rel && rel.rel_type === 'm.replace' && rel.event_id && ev.content['m.new_content']) {
      applyEditEvent(room, ev);
      return false;
    }
  }

  // Dedupe / Pending-Echo ersetzen
  if (ev.event_id && room.eventIndex.has(ev.event_id)) {
    const existing = room.eventIndex.get(ev.event_id);
    if (existing.pending) upgradePendingEvent(room, existing, ev);
    return false;
  }
  const txn = ev.unsigned && ev.unsigned.transaction_id;
  if (txn && room.pendingByTxn.has(txn)) {
    upgradePendingEvent(room, room.pendingByTxn.get(txn), ev);
    return false;
  }

  const obj = makeEventObject(ev);
  room.events.push(obj);
  if (obj.eventId) room.eventIndex.set(obj.eventId, obj);
  updateRoomPreview(room, obj);

  if (live && session && obj.sender !== session.userId) {
    maybeNotify(room, obj);
    if (room.roomId === activeRoomId) newRemoteInActive++;
  }
  return true;
}

let newRemoteInActive = 0; // neue fremde Events im aktiven Raum während des Syncs

function upgradePendingEvent(room, pendingEv, ev) {
  if (pendingEv.txnId) room.pendingByTxn.delete(pendingEv.txnId);
  if (pendingEv.eventId && pendingEv.eventId !== ev.event_id) {
    room.eventIndex.delete(pendingEv.eventId);
  }
  pendingEv.eventId = ev.event_id || pendingEv.eventId;
  pendingEv.content = ev.content || pendingEv.content;
  pendingEv.ts = ev.origin_server_ts || pendingEv.ts;
  pendingEv.pending = false;
  pendingEv.failed = false;
  if (pendingEv.eventId) room.eventIndex.set(pendingEv.eventId, pendingEv);
  updateRoomPreview(room, pendingEv);
}

/* ---------- m.direct ---------- */

function applyDirectAccountData(content) {
  const set = new Set();
  for (const roomIds of Object.values(content || {})) {
    if (Array.isArray(roomIds)) for (const id of roomIds) set.add(id);
  }
  directRoomIds = set;
  for (const room of rooms.values()) room.isDirect = directRoomIds.has(room.roomId);
}

/* ========================================================================
 * Sync-Schleife
 * ====================================================================== */

function stopSync() {
  syncGeneration++;
  if (syncAbort) {
    try { syncAbort.abort(); } catch (e) { /* */ }
    syncAbort = null;
  }
}

async function syncLoop() {
  const generation = ++syncGeneration;
  let backoff = 1000;
  syncToken = localStorage.getItem(LS_SYNC_TOKEN) || null;

  while (session && generation === syncGeneration) {
    const params = new URLSearchParams();
    params.set('timeout', String(SYNC_TIMEOUT_MS));
    if (syncToken) {
      params.set('since', syncToken);
    } else {
      params.set('filter', JSON.stringify({ room: { timeline: { limit: 30 } } }));
    }
    const ctrl = new AbortController();
    syncAbort = ctrl;
    const abortTimer = setTimeout(() => ctrl.abort(), SYNC_ABORT_MS);
    try {
      const data = await api('GET', '/_matrix/client/v3/sync?' + params.toString(), null, {
        signal: ctrl.signal,
      });
      clearTimeout(abortTimer);
      if (generation !== syncGeneration || !session) return;

      // E2EE: auf die (einmalige) Initialisierung warten, damit keine
      // to_device-Events (Room-Keys) verloren gehen, dann die Sync-Antwort
      // durch die OlmMachine schicken und Timeline-Events entschlüsseln.
      if (cryptoInitPromise) {
        try { await cryptoInitPromise; } catch (e) { /* degradiert */ }
        if (generation !== syncGeneration || !session) return;
      }
      let toDeviceCount = 0;
      if (cryptoReady && cryptoEngine) {
        try {
          toDeviceCount = await cryptoEngine.processSync(data);
        } catch (err) {
          console.warn('E2EE-Sync-Verarbeitung fehlgeschlagen:', err);
        }
        try {
          await decryptSyncResponse(data);
        } catch (err) {
          console.warn('Entschlüsselung der Sync-Antwort fehlgeschlagen:', err);
        }
        if (generation !== syncGeneration || !session) return;
      }

      processSync(data);
      syncToken = data.next_batch;
      try { localStorage.setItem(LS_SYNC_TOKEN, syncToken); } catch (e) { /* */ }
      backoff = 1000;

      // Kamen to_device-Events (potenzielle Room-Keys), erneut versuchen,
      // bislang unentschlüsselbare Events zu entschlüsseln.
      if (cryptoReady && toDeviceCount > 0) {
        retryPendingDecryption().catch((err) => {
          console.warn('Retry der Entschlüsselung fehlgeschlagen:', err);
        });
      }
    } catch (err) {
      clearTimeout(abortTimer);
      if (generation !== syncGeneration || !session) return;
      if (err && err.errcode === 'M_UNKNOWN_TOKEN') {
        toast('Sitzung abgelaufen – bitte neu anmelden');
        hardLogout();
        return;
      }
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30000);
    }
  }
}

function processSync(data) {
  const changed = new Set();
  newRemoteInActive = 0;

  for (const ev of (data.account_data && data.account_data.events) || []) {
    if (ev.type === 'm.direct') {
      applyDirectAccountData(ev.content);
      for (const id of rooms.keys()) changed.add(id);
    }
  }

  const joined = (data.rooms && data.rooms.join) || {};
  for (const [roomId, jr] of Object.entries(joined)) {
    const room = getRoom(roomId);

    if (jr.summary && Array.isArray(jr.summary['m.heroes'])) {
      room.heroes = jr.summary['m.heroes'];
    }
    for (const ev of (jr.state && jr.state.events) || []) applyStateEvent(room, ev);

    const tl = jr.timeline || {};
    if (tl.prev_batch && (room.events.length === 0 || tl.limited)) {
      room.prevBatch = tl.prev_batch;
    }
    for (const ev of tl.events || []) {
      if (ev.state_key !== undefined) applyStateEvent(room, ev);
      applyTimelineEvent(room, ev, true);
    }

    if (jr.unread_notifications) {
      room.unread = jr.unread_notifications.notification_count || 0;
    }
    for (const ev of (jr.ephemeral && jr.ephemeral.events) || []) {
      if (ev.type === 'm.typing') {
        room.typing = ((ev.content && ev.content.user_ids) || [])
          .filter((u) => !session || u !== session.userId);
      }
    }
    for (const ev of (jr.account_data && jr.account_data.events) || []) {
      void ev; // Raum-Account-Data derzeit ungenutzt
    }
    changed.add(roomId);
  }

  for (const roomId of Object.keys((data.rooms && data.rooms.leave) || {})) {
    if (rooms.delete(roomId)) changed.add(roomId);
    if (activeRoomId === roomId) {
      activeRoomId = null;
      showChatPlaceholder();
    }
  }

  if (changed.size) renderRoomList();

  if (activeRoomId && changed.has(activeRoomId)) {
    const room = rooms.get(activeRoomId);
    if (room) {
      const nearBottom = isNearBottom();
      renderChatHeader(room);
      renderTypingBar(room);
      renderTimeline(nearBottom ? 'bottom' : 'keep');
      if (newRemoteInActive > 0) {
        if (nearBottom) {
          if (!document.hidden) sendReadReceipt(room);
        } else {
          unseenCount += newRemoteInActive;
        }
      }
      updateScrollDownBtn();
    }
  }
}

/* ========================================================================
 * Desktop-Benachrichtigungen
 * ====================================================================== */

function maybeNotify(room, ev) {
  if (!settings.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  if (ev.type !== 'm.room.message' && ev.type !== 'm.room.encrypted') return;
  try {
    const body = memberName(room, ev.sender) + ': ' + truncate(eventDisplayBody(ev), 120);
    const n = new Notification(roomDisplayName(room), { body, tag: 'mm-' + room.roomId });
    n.onclick = () => {
      try { window.focus(); } catch (e) { /* */ }
      openRoom(room.roomId);
      n.close();
    };
  } catch (e) { /* Notification kann in WebViews fehlen */ }
}

/* ========================================================================
 * Raumliste
 * ====================================================================== */

function setAvatar(node, key, name, mxc) {
  node.textContent = '';
  node.style.background = avatarColor(key);
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  node.appendChild(el('span', null, initial));
  if (mxc) {
    node.dataset.mxc = mxc;
    mxcToObjectURL(mxc, { width: 96, height: 96, method: 'crop' })
      .then((url) => {
        if (node.dataset.mxc !== mxc || !node.isConnected) return;
        const img = document.createElement('img');
        img.alt = '';
        img.src = url;
        node.appendChild(img);
      })
      .catch(() => { /* Initiale bleibt sichtbar */ });
  } else {
    delete node.dataset.mxc;
  }
}

function buildRoomItem(room) {
  const name = roomDisplayName(room);
  const item = el('div', 'room-item');
  item.setAttribute('role', 'button');
  if (room.roomId === activeRoomId) item.classList.add('active');

  const avatar = el('div', 'avatar');
  setAvatar(avatar, room.roomId, name, roomAvatarMxc(room));
  item.appendChild(avatar);

  item.title = name;

  const main = el('div', 'room-main');
  const row1 = el('div', 'room-row1');
  if (room.isEncrypted) {
    const lock = el('span', 'room-lock');
    lock.appendChild(icon('lock', 11));
    row1.appendChild(lock);
  }
  row1.appendChild(el('div', 'room-name', name));
  if (spaces.isFavorite(room.roomId)) {
    const star = el('span', 'room-star');
    star.appendChild(icon('star-filled', 12));
    row1.appendChild(star);
  }
  row1.appendChild(el('div', 'room-time', listTimeLabel(room.lastEventTs)));
  main.appendChild(row1);

  const row2 = el('div', 'room-row2');
  const draft = room.roomId !== activeRoomId ? getDraft(room.roomId).trim() : '';
  if (draft) {
    const dp = el('div', 'room-preview room-draft');
    dp.appendChild(el('span', 'room-draft-label', 'Entwurf: '));
    dp.appendChild(document.createTextNode(draft));
    row2.appendChild(dp);
  } else {
    let preview = room.lastPreview || '';
    if (preview && session && room.lastPreviewSender === session.userId) {
      preview = 'Du: ' + preview;
    }
    row2.appendChild(el('div', 'room-preview', preview));
  }
  if (room.unread > 0) {
    row2.appendChild(el('div', 'room-badge', room.unread > 99 ? '99+' : String(room.unread)));
  }
  main.appendChild(row2);
  item.appendChild(main);

  if (room.unread > 0) {
    const mini = el('div', 'room-badge-mini', room.unread > 99 ? '99+' : String(room.unread));
    item.appendChild(mini);
  }

  const more = el('button', 'room-more-btn');
  more.appendChild(icon('more-h', 16));
  more.title = 'Raum-Optionen';
  more.setAttribute('aria-label', 'Raum-Optionen');
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    openRoomMenu(more, room);
  });
  item.appendChild(more);

  item.addEventListener('click', () => openRoom(room.roomId));
  return item;
}

/* ---------- Kontextmenü einer Raumzeile ---------- */

let roomMenuEl = null;

function closeRoomMenu() {
  if (roomMenuEl) {
    roomMenuEl.remove();
    roomMenuEl = null;
  }
}

function openRoomMenu(anchor, room) {
  closeRoomMenu();
  const menu = el('div', 'room-menu');
  menu.setAttribute('role', 'menu');

  const assign = el('button', 'room-menu-item');
  assign.appendChild(icon('folder', 16));
  assign.appendChild(el('span', null, 'Zu Bereichen zuordnen'));
  assign.addEventListener('click', () => {
    closeRoomMenu();
    spaces.openAssignDialog(room.roomId, roomDisplayName(room));
  });
  menu.appendChild(assign);

  const isFav = spaces.isFavorite(room.roomId);
  const fav = el('button', 'room-menu-item');
  fav.appendChild(icon(isFav ? 'star-filled' : 'star', 16));
  fav.appendChild(el('span', null, isFav ? 'Favorit entfernen' : 'Als Favorit markieren'));
  fav.addEventListener('click', () => {
    closeRoomMenu();
    spaces.toggleFavorite(room.roomId); // onChange rendert die Liste neu
  });
  menu.appendChild(fav);

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  let x = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8);
  let y = rect.bottom + 4;
  if (y + menu.offsetHeight > window.innerHeight - 8) y = rect.top - menu.offsetHeight - 4;
  menu.style.left = Math.max(8, x) + 'px';
  menu.style.top = Math.max(8, y) + 'px';
  roomMenuEl = menu;
}

document.addEventListener('click', (e) => {
  if (roomMenuEl && !roomMenuEl.contains(e.target)) closeRoomMenu();
});

function renderRoomList() {
  const query = roomSearchEl.value.trim().toLowerCase();
  const sorted = [...rooms.values()].sort((a, b) => b.lastEventTs - a.lastEventTs);
  roomListEl.textContent = '';
  closeRoomMenu();

  const visible = [];
  for (const room of sorted) {
    const name = roomDisplayName(room);
    if (query && !name.toLowerCase().includes(query)) continue;
    if (!spaces.roomInActiveSpace(room)) continue;
    visible.push(room);
  }

  if (spaces.getActiveSpaceId() === 'main' && visible.length) {
    // Main-Bereich: nach Herkunft gruppiert, Sektionen einklappbar
    for (const section of spaces.groupRoomsForMain(visible)) {
      const secEl = el('div', 'mm-room-section');
      if (section.collapsed) secEl.classList.add('collapsed');

      const header = el('button', 'mm-room-section-header');
      header.setAttribute('aria-expanded', section.collapsed ? 'false' : 'true');
      const chevron = el('span', 'mm-room-section-chevron');
      chevron.appendChild(icon('chevron-down', 12));
      header.appendChild(chevron);
      const label = el('span', 'mm-room-section-label');
      if (section.key === 'matrix') label.appendChild(icon('globe', 13));
      else label.appendChild(el('span', null, section.icon));
      label.appendChild(el('span', null, section.title));
      header.appendChild(label);
      header.appendChild(el('span', 'mm-room-section-count', String(section.rooms.length)));
      header.addEventListener('click', () => {
        spaces.toggleSectionCollapsed(section.key); // onChange rendert neu
      });
      secEl.appendChild(header);

      const body = el('div', 'mm-room-section-body');
      for (const room of section.rooms) body.appendChild(buildRoomItem(room));
      secEl.appendChild(body);
      roomListEl.appendChild(secEl);
    }
  } else {
    for (const room of visible) roomListEl.appendChild(buildRoomItem(room));
  }

  if (!visible.length) {
    let msg;
    if (query) msg = 'Keine Räume gefunden';
    else if (rooms.size && spaces.getActiveSpaceId() !== 'all') msg = 'Keine Räume in diesem Bereich';
    else msg = 'Noch keine Räume – warte auf den ersten Sync …';
    roomListEl.appendChild(el('div', 'room-list-empty', msg));
  }
}

/* ========================================================================
 * Chat / Timeline
 * ====================================================================== */

function showChatPlaceholder() {
  chatViewEl.classList.add('hidden');
  chatEmptyEl.classList.remove('hidden');
  appEl.classList.remove('show-chat');
}

function openRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (activeRoomId !== roomId) {
    cancelBanner();
    unseenCount = 0;
  }
  activeRoomId = roomId;
  chatEmptyEl.classList.add('hidden');
  chatViewEl.classList.remove('hidden');
  appEl.classList.add('show-chat');
  renderChatHeader(room);
  // Entwurf dieses Raums wiederherstellen (behebt auch, dass Text beim
  // Raumwechsel stehen bliebe).
  if (!(room.isEncrypted && !cryptoReady)) {
    composerInput.value = getDraft(roomId);
    autoGrowComposer();
    sendBtn.disabled = composerInput.value.trim().length === 0;
  }
  renderTypingBar(room);
  renderTimeline('bottom');
  updateScrollDownBtn();
  renderRoomList();
  sendReadReceipt(room);
  if (window.innerWidth >= 720) composerInput.focus();
}

function renderChatHeader(room) {
  const name = roomDisplayName(room);
  chatNameEl.textContent = name;
  const subParts = [];
  if (room.isEncrypted) subParts.push('Ende-zu-Ende-verschlüsselt');
  if (room.isDirect) subParts.push('Direktnachricht');
  chatSubEl.textContent = '';
  if (room.isEncrypted) chatSubEl.appendChild(icon('lock', 10));
  chatSubEl.appendChild(el('span', null,
    subParts.length ? subParts.join(' · ') : room.roomId));
  setAvatar(chatAvatarEl, room.roomId, name, roomAvatarMxc(room));

  // In E2EE-Raeumen niemals unverschluesselt senden: Composer nur sperren,
  // solange die Verschluesselung nicht verfuegbar ist.
  if (room.isEncrypted && !cryptoReady) {
    composerInput.disabled = true;
    composerInput.value = '';
    composerInput.placeholder = 'Verschlüsselung nicht verfügbar – Senden in diesem Raum ist gesperrt';
    sendBtn.disabled = true;
  } else {
    composerInput.disabled = false;
    composerInput.placeholder = 'Nachricht';
    sendBtn.disabled = composerInput.value.trim().length === 0;
  }

  // Medien-Upload und Spiele laufen als Klartext-Events: NIEMALS in E2EE-Räume.
  const mediaBlocked = room.isEncrypted;
  attachBtn.disabled = mediaBlocked;
  micBtn.disabled = mediaBlocked;
  gameBtn.disabled = mediaBlocked;
  gameBtn.title = mediaBlocked ? 'Spiele in verschlüsselten Räumen folgen' : 'Spiel starten';
  if (mediaBlocked) closeGameMenu();
  attachBtn.title = mediaBlocked
    ? 'Medienversand in verschlüsselten Räumen folgt'
    : 'Datei anhängen';
  micBtn.title = mediaBlocked
    ? 'Medienversand in verschlüsselten Räumen folgt'
    : 'Sprachnachricht aufnehmen';
  emojiBtn.disabled = composerInput.disabled;
}

function isNearBottom() {
  return timelineEl.scrollHeight - timelineEl.scrollTop - timelineEl.clientHeight < NEAR_BOTTOM_PX;
}

function scrollToBottom() {
  timelineEl.scrollTop = timelineEl.scrollHeight;
}

/**
 * Timeline neu rendern.
 * mode: 'bottom' (ans Ende scrollen) | 'keep' (Position halten) | 'prepend' (Offset nach Pagination halten)
 */
function renderTimeline(mode) {
  const room = rooms.get(activeRoomId);
  if (!room) return;
  const prevScrollTop = timelineEl.scrollTop;
  const prevScrollHeight = timelineEl.scrollHeight;

  timelineEl.textContent = '';
  closeEmojiPopover();

  if (room.prevBatch) {
    const older = el('button', 'load-older-btn', room.paginating ? 'Lädt …' : 'Ältere Nachrichten laden');
    older.disabled = room.paginating;
    older.addEventListener('click', () => loadOlderMessages(room));
    timelineEl.appendChild(older);
  }

  const events = room.events;
  // Spielstände deterministisch aus allen Events berechnen (idempotent).
  const games = collectGameState(events);
  let prevEv = null;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // Spielzüge sind unsichtbar – nur das Spielbrett zählt.
    if (isGameMove(ev)) continue;

    const nextEv = events[i + 1] || null;

    const newDay = !prevEv || startOfDay(prevEv.ts) !== startOfDay(ev.ts);
    if (newDay) {
      const sep = el('div', 'day-sep');
      sep.appendChild(el('span', null, dayLabel(ev.ts)));
      timelineEl.appendChild(sep);
    }

    // Spielstart als interaktive Spielkarte rendern.
    if (isGameStart(ev)) {
      timelineEl.appendChild(buildGameRow(room, ev, games));
      prevEv = ev;
      continue;
    }

    const startsGroup = newDay || !prevEv || prevEv.sender !== ev.sender || ev.ts - prevEv.ts > GROUP_GAP_MS;
    const endsGroup = !nextEv || nextEv.sender !== ev.sender ||
      nextEv.ts - ev.ts > GROUP_GAP_MS || startOfDay(nextEv.ts) !== startOfDay(ev.ts);

    timelineEl.appendChild(buildMessageRow(room, ev, startsGroup, endsGroup));
    prevEv = ev;
  }

  if (mode === 'bottom') {
    scrollToBottom();
  } else if (mode === 'prepend') {
    timelineEl.scrollTop = prevScrollTop + (timelineEl.scrollHeight - prevScrollHeight);
  } else {
    timelineEl.scrollTop = prevScrollTop;
  }
}

/** Rendert eine Zeile mit interaktiver Spielkarte für ein Spielstart-Event. */
function buildGameRow(room, ev, games) {
  const row = el('div', 'msg-row game-row');
  const wrap = el('div', 'bubble-wrap');
  const state = ev.eventId ? games.get(ev.eventId) : null;
  if (state) {
    const card = renderGameCard(state, {
      myUserId: session ? session.userId : '',
      onMove: (cell) => {
        if (room.isEncrypted) return;
        sendMove(room.roomId, ev.eventId, cell);
      },
    });
    wrap.appendChild(card);
  } else {
    // Pending-Start (noch keine Event-ID vom Server): schlichter Platzhalter.
    const ph = el('div', 'game-pending');
    ph.appendChild(icon('gamepad', 16));
    ph.appendChild(el('span', null, 'Spiel wird gestartet …'));
    wrap.appendChild(ph);
  }
  row.appendChild(wrap);
  return row;
}

function buildMessageRow(room, ev, startsGroup, endsGroup) {
  const mine = session && ev.sender === session.userId;
  const frag = document.createDocumentFragment();

  if (!mine && startsGroup) {
    frag.appendChild(el('div', 'msg-sender', memberName(room, ev.sender)));
  }

  const row = el('div', 'msg-row');
  row.classList.add(mine ? 'mine' : 'theirs');
  if (startsGroup && !(!mine && startsGroup)) row.classList.add('grp-start');
  if (startsGroup && endsGroup) row.classList.add('grp-single');
  else if (startsGroup) row.classList.add('grp-first');
  else if (endsGroup) row.classList.add('grp-last');
  else row.classList.add('grp-mid');
  if (ev.pending) row.classList.add('pending');
  if (ev.failed) row.classList.add('failed');

  const wrap = el('div', 'bubble-wrap');
  const bubble = el('div', 'bubble');
  fillBubbleContent(room, ev, bubble, endsGroup);
  wrap.appendChild(bubble);

  // Reaktions-Chips
  if (ev.reactions.size > 0 && !ev.redacted) {
    const rrow = el('div', 'reaction-row');
    for (const [emoji, agg] of ev.reactions) {
      if (agg.count <= 0) continue;
      const chip = el('button', 'reaction-chip');
      if (agg.mine) chip.classList.add('mine-reaction');
      chip.appendChild(el('span', null, emoji));
      chip.appendChild(el('span', 'rc-count', String(agg.count)));
      chip.title = 'Reaktion umschalten';
      chip.addEventListener('click', () => toggleReaction(room, ev, emoji));
      rrow.appendChild(chip);
    }
    wrap.appendChild(rrow);
  }

  // Hover-Aktionen
  const actions = buildMessageActions(room, ev, mine);
  if (actions) wrap.appendChild(actions);

  row.appendChild(wrap);
  frag.appendChild(row);

  // DocumentFragment kann nicht direkt zurückgegeben werden, wenn Sender-Label dabei ist –
  // wir hängen es über einen Container an.
  const container = el('div');
  container.style.display = 'contents';
  container.appendChild(frag);
  return container;
}

function fillBubbleContent(room, ev, bubble, endsGroup) {
  const meta = el('span', 'msg-meta');
  if (ev.failed) {
    meta.appendChild(el('span', null, '⚠︎'));
  } else if (ev.pending) {
    const pend = el('span', 'msg-pending');
    pend.appendChild(icon('clock', 11));
    meta.appendChild(pend);
  } else if (endsGroup) {
    meta.appendChild(el('span', null, formatTime(ev.ts)));
  }
  if (ev.editedBody !== undefined && ev.editedBody !== null && !ev.redacted) {
    meta.insertBefore(el('span', 'edited-tag', '(bearbeitet)'), meta.firstChild);
  }
  if (ev.encrypted && !ev.redacted) {
    const lock = el('span', 'msg-lock');
    lock.appendChild(icon('lock', 10));
    meta.appendChild(lock);
  }
  const hasMeta = meta.childNodes.length > 0;

  if (ev.redacted) {
    bubble.classList.add('redacted-ph');
    bubble.appendChild(el('span', null, 'Nachricht gelöscht'));
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  if (ev.type === 'm.room.encrypted') {
    bubble.classList.add('encrypted-ph');
    const ph = el('span', 'encrypted-ph-inner');
    ph.appendChild(icon('lock', 12));
    ph.appendChild(el('span', null, cryptoReady
      ? 'Warten auf Schlüssel …'
      : 'Verschlüsselte Nachricht – E2EE wird in der Webversion noch nicht unterstützt'));
    bubble.appendChild(ph);
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  const c = ev.content || {};
  const msgtype = c.msgtype || 'm.text';

  // Reply-Zitat
  if (hasReplyRelation(c)) {
    const origId = c['m.relates_to']['m.in_reply_to'].event_id;
    const orig = room.eventIndex.get(origId);
    const quote = el('span', 'reply-quote');
    quote.appendChild(el('span', 'rq-sender', orig ? memberName(room, orig.sender) : 'Antwort'));
    quote.appendChild(document.createTextNode(
      orig ? truncate(eventDisplayBody(orig), 90) : 'Ursprüngliche Nachricht'
    ));
    bubble.appendChild(quote);
  }

  // Termin-Karte (Kalender-Modul)
  if (c['io.matrixmess.event'] && typeof c['io.matrixmess.event'] === 'object') {
    bubble.appendChild(renderEventCard(c['io.matrixmess.event']));
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  const hasAttachment = !!(c.url || c.file);
  const inlineMedia = settings.inlineMedia !== false;

  if (msgtype === 'm.image' && hasAttachment && inlineMedia) {
    bubble.classList.add('media');
    const holder = el('div', 'msg-image-loading', 'Bild wird geladen …');
    bubble.appendChild(holder);
    const info = c.info || {};
    // Unverschlüsselt: Server-Thumbnail; verschlüsselt: Original laden + entschlüsseln.
    const thumbPromise = c.file
      ? getInlineAttachmentURL(c)
      : mxcToObjectURL(c.url, { width: 640, height: 640, method: 'scale' });
    thumbPromise
      .then((url) => {
        if (!holder.isConnected) return;
        const img = document.createElement('img');
        img.className = 'msg-image';
        img.alt = c.body || 'Bild';
        if (info.w && info.h) img.style.aspectRatio = `${info.w} / ${info.h}`;
        img.src = url;
        img.addEventListener('click', () => {
          openImageLightbox({
            getBlobUrl: attachmentUrlGetter(c),
            filename: c.filename || c.body || 'bild',
          });
        });
        holder.replaceWith(img);
      })
      .catch(() => {
        if (holder.isConnected) {
          holder.replaceChildren(icon('image', 18), el('span', null, 'Bild nicht verfügbar'));
        }
      });
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  if (msgtype === 'm.audio' && hasAttachment && inlineMedia) {
    const isVoice = !!c['org.matrix.msc3245.voice'];
    const player = renderAudioPlayer({
      getBlobUrl: attachmentUrlGetter(c),
      durationMs: c.info && c.info.duration,
      filename: isVoice ? undefined : (c.filename || c.body || undefined),
      isVoice,
    });
    bubble.appendChild(player);
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  if (msgtype === 'm.video' && hasAttachment && inlineMedia) {
    const player = renderVideoPlayer({
      getBlobUrl: attachmentUrlGetter(c),
      filename: c.filename || c.body || undefined,
      width: c.info && c.info.w,
      height: c.info && c.info.h,
    });
    bubble.appendChild(player);
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  if ((msgtype === 'm.file' || msgtype === 'm.video' || msgtype === 'm.audio' ||
       msgtype === 'm.image') && hasAttachment) {
    const icons = { 'm.file': 'file', 'm.video': 'video', 'm.audio': 'play', 'm.image': 'image' };
    const card = el('div', 'attachment-card');
    const iconWrap = el('div', 'attachment-icon');
    iconWrap.appendChild(icon(icons[msgtype] || 'file', 18));
    card.appendChild(iconWrap);
    const info = el('div', 'attachment-info');
    info.appendChild(el('div', 'attachment-name', c.filename || c.body || 'Datei'));
    const size = c.info && c.info.size ? formatBytes(c.info.size) : 'Zum Herunterladen tippen';
    info.appendChild(el('div', 'attachment-size', size));
    card.appendChild(info);
    card.title = 'Herunterladen';
    card.addEventListener('click', () => downloadAttachment(c));
    bubble.appendChild(card);
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  // Text / Emote / Notice
  let body = ev.editedBody !== undefined && ev.editedBody !== null ? ev.editedBody : (c.body || '');
  if (hasReplyRelation(c) && (ev.editedBody === undefined || ev.editedBody === null)) {
    body = stripReplyFallback(body);
  }
  const span = el('span');
  if (msgtype === 'm.emote') {
    span.classList.add('emote');
    span.textContent = '∗ ' + memberName(room, ev.sender) + ' ' + body;
  } else {
    if (msgtype === 'm.notice') span.classList.add('notice');
    span.textContent = body;
  }
  bubble.appendChild(span);

  // Link-Vorschau / Social-Embed unter dem Text
  if (settings.linkPreviews !== false && msgtype !== 'm.emote' && body) {
    try {
      const firstUrl = extractFirstUrl(body);
      if (firstUrl) {
        const embed = renderLinkEmbed(firstUrl);
        if (embed) bubble.appendChild(embed);
      }
    } catch (e) { /* Embeds sind optional */ }
  }

  if (hasMeta) bubble.appendChild(meta);
}

function buildMessageActions(room, ev, mine) {
  if (ev.pending || ev.redacted || !ev.eventId) return null;
  const actions = el('div', 'msg-actions');

  if (ev.type === 'm.room.message') {
    const replyBtn = el('button');
    replyBtn.appendChild(icon('reply', 16));
    replyBtn.title = 'Antworten';
    replyBtn.setAttribute('aria-label', 'Antworten');
    replyBtn.addEventListener('click', () => startReply(room, ev));
    actions.appendChild(replyBtn);
  }

  const reactBtn = el('button');
  reactBtn.appendChild(icon('smile', 16));
  reactBtn.title = 'Reagieren';
  reactBtn.setAttribute('aria-label', 'Reagieren');
  reactBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPopover(reactBtn, room, ev);
  });
  actions.appendChild(reactBtn);

  if (mine && ev.type === 'm.room.message') {
    const c = ev.content || {};
    const editable = !c.msgtype || c.msgtype === 'm.text' || c.msgtype === 'm.notice' || c.msgtype === 'm.emote';
    if (editable) {
      const editBtn = el('button');
      editBtn.appendChild(icon('edit', 15));
      editBtn.title = 'Bearbeiten';
      editBtn.setAttribute('aria-label', 'Bearbeiten');
      editBtn.addEventListener('click', () => startEdit(room, ev));
      actions.appendChild(editBtn);
    }
    const delBtn = el('button');
    delBtn.appendChild(icon('trash', 15));
    delBtn.title = 'Löschen';
    delBtn.setAttribute('aria-label', 'Löschen');
    delBtn.addEventListener('click', () => deleteMessage(room, ev));
    actions.appendChild(delBtn);
  }
  return actions;
}

/* ---------- Emoji-Popover ---------- */

let popoverContext = null;

function openEmojiPopover(anchor, room, ev) {
  emojiPopover.textContent = '';
  popoverContext = { roomId: room.roomId, eventId: ev.eventId };
  for (const emoji of QUICK_REACTIONS) {
    const b = el('button', null, emoji);
    b.addEventListener('click', () => {
      closeEmojiPopover();
      toggleReaction(room, ev, emoji);
    });
    emojiPopover.appendChild(b);
  }
  // "+" öffnet den vollen Emoji-Picker für die Reaktion
  const more = el('button');
  more.appendChild(icon('plus', 18));
  more.title = 'Weitere Emojis';
  more.setAttribute('aria-label', 'Weitere Emojis');
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    // Unsichtbarer Anker an der Popover-Position, da das Popover gleich zugeht.
    const rect = emojiPopover.getBoundingClientRect();
    closeEmojiPopover();
    const ghost = el('span');
    ghost.style.position = 'fixed';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    openEmojiPicker({
      anchorEl: ghost,
      onPick: (emoji) => toggleReaction(room, ev, emoji),
      onClose: () => ghost.remove(),
    });
  });
  emojiPopover.appendChild(more);
  emojiPopover.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect();
  const pw = emojiPopover.offsetWidth;
  const ph = emojiPopover.offsetHeight;
  let x = rect.left + rect.width / 2 - pw / 2;
  let y = rect.top - ph - 6;
  x = Math.max(8, Math.min(x, window.innerWidth - pw - 8));
  if (y < 8) y = rect.bottom + 6;
  emojiPopover.style.left = x + 'px';
  emojiPopover.style.top = y + 'px';
}

function closeEmojiPopover() {
  emojiPopover.classList.add('hidden');
  popoverContext = null;
}

document.addEventListener('click', (e) => {
  if (popoverContext && !emojiPopover.contains(e.target)) closeEmojiPopover();
});

/* ---------- Reaktionen ---------- */

async function toggleReaction(room, ev, key) {
  if (!ev.eventId || ev.pending) return;
  const agg = ev.reactions.get(key);

  if (agg && agg.mine) {
    const myEventId = agg.myEventId;
    // Optimistisch entfernen
    agg.count--;
    agg.mine = false;
    agg.myEventId = null;
    if (agg.count <= 0) ev.reactions.delete(key);
    if (myEventId) room.reactionIndex.delete(myEventId);
    renderTimeline('keep');
    if (!myEventId) return;
    try {
      await api('PUT',
        `/_matrix/client/v3/rooms/${enc(room.roomId)}/redact/${enc(myEventId)}/${enc(txnId())}`,
        {});
    } catch (err) {
      toast('Reaktion konnte nicht entfernt werden');
    }
    return;
  }

  // Optimistisch hinzufügen
  let a = ev.reactions.get(key);
  if (!a) {
    a = { count: 0, mine: false, myEventId: null };
    ev.reactions.set(key, a);
  }
  a.count++;
  a.mine = true;
  renderTimeline('keep');
  try {
    const res = await api('PUT',
      `/_matrix/client/v3/rooms/${enc(room.roomId)}/send/m.reaction/${enc(txnId())}`,
      {
        'm.relates_to': { rel_type: 'm.annotation', event_id: ev.eventId, key },
      });
    const cur = ev.reactions.get(key);
    if (cur && res && res.event_id) {
      cur.myEventId = res.event_id;
      room.reactionIndex.set(res.event_id, { targetId: ev.eventId, key, sender: session.userId });
    }
  } catch (err) {
    const cur = ev.reactions.get(key);
    if (cur) {
      cur.count--;
      cur.mine = false;
      cur.myEventId = null;
      if (cur.count <= 0) ev.reactions.delete(key);
    }
    renderTimeline('keep');
    toast('Reaktion konnte nicht gesendet werden');
  }
}

/* ---------- Löschen (Redact) ---------- */

async function deleteMessage(room, ev) {
  if (!ev.eventId) return;
  if (!confirm('Nachricht wirklich löschen?')) return;
  ev.redacted = true;
  ev.editedBody = null;
  ev.reactions.clear();
  updateRoomPreview(room, ev);
  renderTimeline('keep');
  renderRoomList();
  try {
    await api('PUT',
      `/_matrix/client/v3/rooms/${enc(room.roomId)}/redact/${enc(ev.eventId)}/${enc(txnId())}`,
      {});
  } catch (err) {
    toast('Löschen fehlgeschlagen: ' + err.message);
  }
}

/* ---------- Anhänge ---------- */

async function downloadAttachment(content) {
  try {
    // Unterstützt auch E2EE-Attachments (content.file wird entschlüsselt).
    const blob = await getAttachmentBlob(content);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = content.filename || content.body || 'datei';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* */ } }, 10000);
  } catch (err) {
    toast('Download fehlgeschlagen');
  }
}

/* ---------- Pagination ---------- */

async function loadOlderMessages(room) {
  if (!room.prevBatch || room.paginating) return;
  room.paginating = true;
  renderTimeline('keep');
  try {
    const res = await api('GET',
      `/_matrix/client/v3/rooms/${enc(room.roomId)}/messages?dir=b&from=${enc(room.prevBatch)}&limit=40`);
    for (const ev of res.state || []) applyStateEvent(room, ev);

    const chunk = (res.chunk || []).slice().reverse(); // chronologisch
    const older = [];
    for (let ev of chunk) {
      if (ev.state_key !== undefined) {
        applyStateEvent(room, ev);
        continue;
      }
      ev = await maybeDecryptRaw(room.roomId, ev);
      const type = ev.type;
      if (type === 'm.room.message' || type === 'm.room.encrypted') {
        const rel = ev.content && ev.content['m.relates_to'];
        if (type === 'm.room.message' && rel && rel.rel_type === 'm.replace' &&
            rel.event_id && ev.content['m.new_content']) {
          applyEditEvent(room, ev);
          continue;
        }
        if (ev.event_id && room.eventIndex.has(ev.event_id)) continue;
        const obj = makeEventObject(ev);
        older.push(obj);
        if (obj.eventId) room.eventIndex.set(obj.eventId, obj);
      } else if (type === 'm.reaction') {
        applyReactionEvent(room, ev);
      } else if (type === 'm.room.redaction') {
        applyRedactionEvent(room, ev);
      }
    }
    room.events = older.concat(room.events);
    room.prevBatch = res.chunk && res.chunk.length ? (res.end || null) : null;
  } catch (err) {
    toast('Ältere Nachrichten konnten nicht geladen werden');
  } finally {
    room.paginating = false;
    if (activeRoomId === room.roomId) renderTimeline('prepend');
  }
}

/* ---------- Read-Receipts ---------- */

async function sendReadReceipt(room) {
  let last = null;
  for (let i = room.events.length - 1; i >= 0; i--) {
    if (room.events[i].eventId && !room.events[i].pending) {
      last = room.events[i].eventId;
      break;
    }
  }
  if (!last || last === room.lastReceiptEventId) return;
  room.lastReceiptEventId = last;
  if (room.unread) {
    room.unread = 0;
    renderRoomList();
  }
  try {
    // Lesebestätigungen aus -> nur private Read-Receipts (m.read.private)
    const body = { 'm.fully_read': last };
    if (settings.readReceipts === false) body['m.read.private'] = last;
    else body['m.read'] = last;
    await api('POST', `/_matrix/client/v3/rooms/${enc(room.roomId)}/read_markers`, body);
  } catch (err) { /* nicht kritisch */ }
}

/* ---------- Typing ---------- */

async function putTyping(on) {
  if (!session || !activeRoomId) return;
  try {
    await api('PUT',
      `/_matrix/client/v3/rooms/${enc(activeRoomId)}/typing/${enc(session.userId)}`,
      on ? { typing: true, timeout: 30000 } : { typing: false });
  } catch (err) { /* nicht kritisch */ }
}

function handleTypingSignal() {
  if (!activeRoomId) return;
  if (settings.typingIndicators === false) return;
  const hasText = composerInput.value.length > 0;
  const now = Date.now();
  if (hasText) {
    if (!typingSent || now - lastTypingSentAt > TYPING_RESEND_MS) {
      typingSent = true;
      lastTypingSentAt = now;
      putTyping(true);
    }
  } else if (typingSent) {
    typingSent = false;
    putTyping(false);
  }
}

function stopTypingSignal() {
  if (typingSent) {
    typingSent = false;
    putTyping(false);
  }
}

function renderTypingBar(room) {
  const names = room.typing.map((u) => memberName(room, u));
  if (!names.length) {
    typingBar.classList.add('hidden');
    return;
  }
  let text;
  if (names.length === 1) text = `${names[0]} tippt …`;
  else if (names.length === 2) text = `${names[0]} und ${names[1]} tippen …`;
  else text = `${names.length} Personen tippen …`;
  typingText.textContent = text;
  typingBar.classList.remove('hidden');
}

/* ---------- Scroll / ↓-Button ---------- */

function updateScrollDownBtn() {
  if (!activeRoomId || isNearBottom()) {
    scrollDownBtn.classList.add('hidden');
    unseenCount = 0;
  } else {
    scrollDownBtn.classList.remove('hidden');
  }
  if (unseenCount > 0) {
    scrollDownCount.textContent = unseenCount > 99 ? '99+' : String(unseenCount);
    scrollDownCount.classList.remove('hidden');
  } else {
    scrollDownCount.classList.add('hidden');
  }
}

timelineEl.addEventListener('scroll', () => {
  if (isNearBottom() && unseenCount > 0) {
    unseenCount = 0;
    const room = rooms.get(activeRoomId);
    if (room && !document.hidden) sendReadReceipt(room);
  }
  updateScrollDownBtn();
});

scrollDownBtn.addEventListener('click', () => {
  scrollToBottom();
  unseenCount = 0;
  updateScrollDownBtn();
  const room = rooms.get(activeRoomId);
  if (room) sendReadReceipt(room);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && activeRoomId && isNearBottom()) {
    const room = rooms.get(activeRoomId);
    if (room) sendReadReceipt(room);
  }
});

/* ========================================================================
 * Composer: Senden, Antworten, Bearbeiten
 * ====================================================================== */

function autoGrowComposer() {
  composerInput.style.height = 'auto';
  composerInput.style.height = Math.min(composerInput.scrollHeight, 132) + 'px';
  sendBtn.disabled = composerInput.value.trim().length === 0;
}

function resetComposer() {
  composerInput.value = '';
  autoGrowComposer();
  if (activeRoomId) clearDraft(activeRoomId);
}

function startReply(room, ev) {
  editTarget = null;
  replyTarget = ev;
  bannerTitle.textContent = 'Antwort an ' + memberName(room, ev.sender);
  bannerBody.textContent = truncate(eventDisplayBody(ev), 120);
  composerBanner.classList.remove('hidden');
  composerInput.focus();
}

function startEdit(room, ev) {
  replyTarget = null;
  editTarget = ev;
  bannerTitle.textContent = 'Nachricht bearbeiten';
  bannerBody.textContent = truncate(eventDisplayBody(ev), 120);
  composerBanner.classList.remove('hidden');
  const c = ev.content || {};
  let body = ev.editedBody !== undefined && ev.editedBody !== null ? ev.editedBody : (c.body || '');
  if (hasReplyRelation(c) && (ev.editedBody === undefined || ev.editedBody === null)) {
    body = stripReplyFallback(body);
  }
  composerInput.value = body;
  autoGrowComposer();
  composerInput.focus();
  composerInput.setSelectionRange(composerInput.value.length, composerInput.value.length);
}

function cancelBanner() {
  const wasEdit = !!editTarget;
  replyTarget = null;
  editTarget = null;
  composerBanner.classList.add('hidden');
  if (wasEdit) resetComposer();
}

/** Verarbeitet /-Befehle. Gibt true zurück, wenn der Text ein Befehl war
 *  (dann nicht als normale Nachricht senden). Unbekannte /befehle -> false. */
async function runSlashCommand(room, text) {
  const sp = text.indexOf(' ');
  const cmd = (sp === -1 ? text : text.slice(0, sp)).toLowerCase();
  const rest = sp === -1 ? '' : text.slice(sp + 1).trim();

  const sendPlain = (body) => sendRoomMessage(room, { msgtype: 'm.text', body });
  const sendEmote = (body) => sendRoomMessage(room, { msgtype: 'm.emote', body });

  switch (cmd) {
    case '/me':
      if (!rest) return false;
      await sendEmote(rest);
      return true;
    case '/shrug':
      await sendPlain((rest ? rest + ' ' : '') + '¯\\_(ツ)_/¯');
      return true;
    case '/tableflip':
      await sendPlain((rest ? rest + ' ' : '') + '(╯°□°)╯︵ ┻━┻');
      return true;
    case '/unflip':
      await sendPlain((rest ? rest + ' ' : '') + '┬─┬ ノ( ゜-゜ノ)');
      return true;
    case '/spoiler':
      if (!rest) return false;
      await sendPlain('► ' + rest);
      return true;
    case '/dice':
      await sendPlain(rollDice().text);
      return true;
    case '/flip':
      await sendPlain(flipCoin().text);
      return true;
    default:
      return false; // unbekannt -> als normaler Text senden
  }
}

async function sendCurrentMessage() {
  const room = rooms.get(activeRoomId);
  if (!room) return;
  if (room.isEncrypted && !cryptoReady) {
    toast('Verschlüsselung nicht verfügbar – Senden in diesem Raum ist derzeit nicht möglich.');
    return;
  }
  const text = composerInput.value.replace(/\s+$/, '');
  if (!text.trim()) return;

  stopTypingSignal();

  // Slash-Commands (nur bei neuer Nachricht, nicht beim Bearbeiten/Antworten)
  if (!editTarget && !replyTarget && text.startsWith('/')) {
    const handled = await runSlashCommand(room, text);
    if (handled) { resetComposer(); return; }
  }

  /* --- Bearbeiten (m.replace) --- */
  if (editTarget) {
    const target = editTarget;
    const content = {
      msgtype: 'm.text',
      body: '* ' + text,
      'm.new_content': { msgtype: 'm.text', body: text },
      'm.relates_to': { rel_type: 'm.replace', event_id: target.eventId },
    };
    target.editedBody = text; // optimistisch
    cancelBanner();
    resetComposer();
    renderTimeline('keep');
    updateRoomPreview(room, target);
    renderRoomList();
    try {
      let sendType = 'm.room.message';
      let sendContent = content;
      if (room.isEncrypted) {
        // m.relates_to wird in encryptForRoom zusätzlich unverschlüsselt
        // an den äußeren Content gehängt (Spec: Relationen sind Klartext).
        sendType = 'm.room.encrypted';
        sendContent = await encryptForRoom(room, content);
      }
      await api('PUT',
        `/_matrix/client/v3/rooms/${enc(room.roomId)}/send/${enc(sendType)}/${enc(txnId())}`,
        sendContent);
    } catch (err) {
      toast('Bearbeiten fehlgeschlagen: ' + err.message);
    }
    return;
  }

  /* --- Neue Nachricht / Antwort --- */
  let content;
  if (replyTarget && replyTarget.eventId) {
    const quoted = eventDisplayBody(replyTarget)
      .split('\n')
      .map((l) => '> ' + l)
      .join('\n');
    content = {
      msgtype: 'm.text',
      body: quoted + '\n\n' + text,
      'm.relates_to': { 'm.in_reply_to': { event_id: replyTarget.eventId } },
    };
  } else {
    content = { msgtype: 'm.text', body: text };
  }

  const txn = txnId();
  const pending = {
    eventId: null,
    sender: session.userId,
    type: 'm.room.message',
    content,
    ts: Date.now(),
    editedBody: null,
    redacted: false,
    reactions: new Map(),
    pending: true,
    failed: false,
    txnId: txn,
    encrypted: room.isEncrypted, // Klartext-Echo lokal, verschlüsselt gesendet
  };
  room.events.push(pending);
  room.pendingByTxn.set(txn, pending);
  updateRoomPreview(room, pending);

  cancelBanner();
  resetComposer();
  renderTimeline('bottom');
  renderRoomList();
  composerInput.focus();

  try {
    let sendType = 'm.room.message';
    let sendContent = content;
    if (room.isEncrypted) {
      sendType = 'm.room.encrypted';
      sendContent = await encryptForRoom(room, content);
    }
    const res = await api('PUT',
      `/_matrix/client/v3/rooms/${enc(room.roomId)}/send/${enc(sendType)}/${enc(txn)}`,
      sendContent);
    const eventId = res && res.event_id;
    if (eventId) {
      if (room.eventIndex.has(eventId)) {
        // Sync war schneller: echtes Event ist schon da -> Pending-Echo entfernen.
        const idx = room.events.indexOf(pending);
        if (idx >= 0) room.events.splice(idx, 1);
        room.pendingByTxn.delete(txn);
      } else {
        pending.eventId = eventId;
        room.eventIndex.set(eventId, pending);
      }
    }
    if (activeRoomId === room.roomId) renderTimeline('keep');
  } catch (err) {
    pending.failed = true;
    pending.pending = false;
    room.pendingByTxn.delete(txn);
    if (activeRoomId === room.roomId) renderTimeline('keep');
    toast('Senden fehlgeschlagen: ' + err.message);
  }
}

composerInput.addEventListener('input', () => {
  autoGrowComposer();
  handleTypingSignal();
  if (activeRoomId) setDraft(activeRoomId, composerInput.value);
});

composerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const enterSends = settings.enterToSend !== false;
    // Enter sendet (wenn aktiviert, ohne Shift); Strg/Cmd+Enter sendet immer.
    if (e.ctrlKey || e.metaKey || (enterSends && !e.shiftKey)) {
      e.preventDefault();
      sendCurrentMessage();
    }
  } else if (e.key === 'Escape' && (replyTarget || editTarget)) {
    cancelBanner();
  }
});

sendBtn.addEventListener('click', sendCurrentMessage);
bannerCancel.addEventListener('click', cancelBanner);

/* ========================================================================
 * Generisches Senden mit Pending-Echo (Uploads, Termin-Nachrichten)
 * ====================================================================== */

/** Sendet einen m.room.message-Content mit Pending-Echo. In E2EE-Räumen wird
 *  der Event-Content verschlüsselt (analog sendCurrentMessage). */
async function sendRoomMessage(room, content) {
  // Klartext-Medien (url ohne file-Objekt) duerfen E2EE-Raeume nie verlassen.
  if (room.isEncrypted && content && content.url && !content.file) {
    throw new ApiError('Unverschlüsselte Medien in E2EE-Räumen blockiert', 'MM_E2EE_MEDIA', 0);
  }
  if (room.isEncrypted && !cryptoReady) {
    toast('Verschlüsselung nicht verfügbar – Senden in diesem Raum ist derzeit nicht möglich.');
    throw new ApiError('Verschlüsselung nicht verfügbar', 'MM_NO_CRYPTO', 0);
  }
  const txn = txnId();
  const pending = {
    eventId: null,
    sender: session.userId,
    type: 'm.room.message',
    content,
    ts: Date.now(),
    editedBody: null,
    redacted: false,
    reactions: new Map(),
    pending: true,
    failed: false,
    txnId: txn,
    encrypted: room.isEncrypted,
  };
  room.events.push(pending);
  room.pendingByTxn.set(txn, pending);
  updateRoomPreview(room, pending);
  if (activeRoomId === room.roomId) renderTimeline('bottom');
  renderRoomList();

  try {
    let sendType = 'm.room.message';
    let sendContent = content;
    if (room.isEncrypted) {
      sendType = 'm.room.encrypted';
      sendContent = await encryptForRoom(room, content);
    }
    const res = await api('PUT',
      `/_matrix/client/v3/rooms/${enc(room.roomId)}/send/${enc(sendType)}/${enc(txn)}`,
      sendContent);
    const eventId = res && res.event_id;
    if (eventId) {
      if (room.eventIndex.has(eventId)) {
        const idx = room.events.indexOf(pending);
        if (idx >= 0) room.events.splice(idx, 1);
        room.pendingByTxn.delete(txn);
      } else {
        pending.eventId = eventId;
        room.eventIndex.set(eventId, pending);
      }
    }
    if (activeRoomId === room.roomId) renderTimeline('keep');
  } catch (err) {
    pending.failed = true;
    pending.pending = false;
    room.pendingByTxn.delete(txn);
    if (activeRoomId === room.roomId) renderTimeline('keep');
    throw err;
  }
}

/* ========================================================================
 * Uploads: Dateien & Sprachnachrichten
 * ====================================================================== */

async function uploadMedia(blob, filename, mime) {
  if (!session) throw new ApiError('Keine Session', 'MM_NO_SESSION', 0);
  const res = await fetch(
    `${session.baseUrl}/_matrix/media/v3/upload?filename=${enc(filename || 'datei')}`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.accessToken,
        'Content-Type': mime || 'application/octet-stream',
      },
      body: blob,
    });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || !data || !data.content_uri) {
    throw new ApiError((data && data.error) || `Upload fehlgeschlagen (HTTP ${res.status})`,
      data && data.errcode, res.status);
  }
  return data.content_uri;
}

function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bildmaße nicht lesbar'));
    };
    img.src = url;
  });
}

async function uploadAndSendFile(room, file) {
  // Defense-in-depth: nie unverschluesselte Medien in E2EE-Raeume, auch wenn
  // ein Aufrufer die Pruefung vergisst oder der Raum waehrenddessen
  // verschluesselt wurde.
  if (room.isEncrypted) {
    toast('Medienversand in verschlüsselten Räumen folgt.');
    throw new ApiError('Medien in E2EE-Räumen noch nicht unterstützt', 'MM_E2EE_MEDIA', 0);
  }
  const mime = file.type || 'application/octet-stream';
  let msgtype = 'm.file';
  if (mime.startsWith('image/')) msgtype = 'm.image';
  else if (mime.startsWith('video/')) msgtype = 'm.video';
  else if (mime.startsWith('audio/')) msgtype = 'm.audio';

  const info = { mimetype: mime, size: file.size };
  if (msgtype === 'm.image') {
    try {
      const dims = await readImageSize(file);
      info.w = dims.w;
      info.h = dims.h;
    } catch (e) { /* Maße sind optional */ }
  }

  const contentUri = await uploadMedia(file, file.name || 'datei', mime);
  const content = {
    msgtype,
    body: file.name || 'Datei',
    filename: file.name || undefined,
    info,
    url: contentUri,
  };
  await sendRoomMessage(room, content);
}

attachBtn.addEventListener('click', () => {
  const room = rooms.get(activeRoomId);
  if (!room) return;
  if (room.isEncrypted) {
    toast('Medienversand in verschlüsselten Räumen folgt');
    return;
  }
  fileInput.click();
});

fileInput.addEventListener('change', async () => {
  const room = rooms.get(activeRoomId);
  const files = [...(fileInput.files || [])];
  fileInput.value = '';
  if (!room || !files.length) return;
  if (room.isEncrypted) {
    toast('Medienversand in verschlüsselten Räumen folgt');
    return;
  }
  for (const file of files) {
    try {
      toast('Wird gesendet: ' + (file.name || 'Datei'));
      await uploadAndSendFile(room, file);
    } catch (err) {
      toast('Upload fehlgeschlagen: ' + ((err && err.message) || err));
    }
  }
});

/* ---------- Sprachnachrichten ---------- */

let activeRecorder = null;

function teardownRecorder() {
  if (activeRecorder) {
    try { activeRecorder.element.remove(); } catch (e) { /* */ }
    activeRecorder = null;
  }
  composerEl.classList.remove('recording');
}

function voiceFileName(mime) {
  const m = String(mime || '').toLowerCase();
  let ext = 'ogg';
  if (m.includes('webm')) ext = 'webm';
  else if (m.includes('mp4')) ext = 'm4a';
  else if (m.includes('mpeg')) ext = 'mp3';
  return 'sprachnachricht.' + ext;
}

async function sendVoiceMessage(room, blob, durationMs, mimeType) {
  if (room.isEncrypted) {
    toast('Medienversand in verschlüsselten Räumen folgt');
    return;
  }
  const mime = mimeType || blob.type || 'audio/webm';
  const filename = voiceFileName(mime);
  const contentUri = await uploadMedia(blob, filename, mime);
  const content = {
    msgtype: 'm.audio',
    body: 'Sprachnachricht',
    filename,
    info: {
      mimetype: mime,
      size: blob.size,
      duration: Math.max(0, Math.round(durationMs || 0)),
    },
    url: contentUri,
    'org.matrix.msc3245.voice': {},
  };
  await sendRoomMessage(room, content);
}

micBtn.addEventListener('click', async () => {
  const room = rooms.get(activeRoomId);
  if (!room) return;
  if (room.isEncrypted) {
    toast('Medienversand in verschlüsselten Räumen folgt');
    return;
  }
  if (activeRecorder) {
    activeRecorder.cancel();
    return;
  }
  const recorder = createVoiceRecorder({
    onFinish: async (blob, durationMs, mimeType) => {
      teardownRecorder();
      try {
        await sendVoiceMessage(room, blob, durationMs, mimeType);
      } catch (err) {
        toast('Sprachnachricht fehlgeschlagen: ' + ((err && err.message) || err));
      }
    },
    onCancel: () => teardownRecorder(),
  });
  activeRecorder = recorder;
  composerEl.classList.add('recording');
  composerEl.insertBefore(recorder.element, sendBtn);
  try {
    await recorder.start();
  } catch (err) {
    teardownRecorder();
    toast((err && err.message) || 'Aufnahme nicht möglich');
  }
});

/* ========================================================================
 * Emoji-Picker im Composer
 * ====================================================================== */

function insertEmojiIntoComposer(emoji) {
  if (composerInput.disabled) return;
  const start = composerInput.selectionStart != null
    ? composerInput.selectionStart : composerInput.value.length;
  const end = composerInput.selectionEnd != null ? composerInput.selectionEnd : start;
  composerInput.value =
    composerInput.value.slice(0, start) + emoji + composerInput.value.slice(end);
  const pos = start + emoji.length;
  composerInput.focus();
  composerInput.setSelectionRange(pos, pos);
  autoGrowComposer();
  handleTypingSignal();
}

let composerPicker = null;

emojiBtn.addEventListener('click', () => {
  if (composerPicker) {
    composerPicker.close();
    return;
  }
  composerPicker = openEmojiPicker({
    anchorEl: emojiBtn,
    onPick: insertEmojiIntoComposer,
    onClose: () => { composerPicker = null; },
  });
});

/* ========================================================================
 * Kalender: Termin planen & Übersicht
 * ====================================================================== */

eventBtn.addEventListener('click', () => {
  const room = rooms.get(activeRoomId);
  if (!room) return;
  openEventPlanner({ roomId: room.roomId, roomName: roomDisplayName(room) });
});

calendarBtn.addEventListener('click', () => {
  document.body.appendChild(renderCalendarPanel());
});

/* ========================================================================
 * UI-Verdrahtung: Login, Sidebar, Einstellungen
 * ====================================================================== */

function showLogin() {
  appEl.classList.add('hidden');
  settingsOverlay.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginError.classList.add('hidden');
  loginPass.value = '';
  showChatPlaceholder();
}

function showApp() {
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  showChatPlaceholder();
  renderRoomList();
  renderSettingsPanel();
  // Spaces + Kalender initialisieren (account_data laden, Space-Leiste rendern).
  // Fire-and-forget: Fehler duerfen Login/Sync nie blockieren.
  initFeatureModules().catch((e) => console.warn('Feature-Module:', e));
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');
  loginBtn.disabled = true;
  loginBtn.textContent = 'Anmelden …';
  try {
    const newSession = await doLogin(loginHs.value, loginUser.value, loginPass.value);
    clearSessionStorage(); // alten Sync-Token eines früheren Kontos verwerfen
    session = newSession;
    saveSession(session);
    showApp();
    cryptoInitPromise = initCrypto();
    syncLoop();
  } catch (err) {
    let msg = 'Anmeldung fehlgeschlagen';
    // fetch() wirft bei Netzwerk-/CORS-Fehlern einen TypeError ("Failed to fetch"):
    // die Anfrage erreichte den Homeserver gar nicht bzw. der Browser durfte die
    // Antwort nicht lesen. Das ist fast immer eine fehlende CORS-Freigabe des Servers.
    const isNetworkError = (err instanceof TypeError) ||
      (err && typeof err.message === 'string' && /failed to fetch|load failed|networkerror/i.test(err.message));
    if (isNetworkError) {
      msg = 'Homeserver nicht erreichbar. Meist fehlt dem Server die CORS-Freigabe ' +
            '(Access-Control-Allow-Origin) für Web-Clients, oder die Adresse ist falsch. ' +
            'Prüfe die Adresse; die iPhone-App funktioniert auch ohne CORS.';
    } else if (err && err.errcode === 'M_FORBIDDEN') {
      msg = 'Benutzername oder Passwort falsch';
    } else if (err && err.errcode === 'M_USER_DEACTIVATED') {
      msg = 'Dieses Konto wurde deaktiviert';
    } else if (err && err.errcode === 'M_LIMIT_EXCEEDED') {
      msg = 'Zu viele Versuche – bitte kurz warten';
    } else if (err && err.message) {
      msg = 'Anmeldung fehlgeschlagen: ' + err.message;
    }
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Anmelden';
  }
});

roomSearchEl.addEventListener('input', renderRoomList);

backBtn.addEventListener('click', () => {
  appEl.classList.remove('show-chat');
});

/* ---------- Statische Icons (UI-Chrome, ersetzt Emoji-Zeichen) ---------- */

/** Hängt die icon()-SVGs in die statischen Buttons/Badges aus index.html.
 *  Wird im Init-Pfad VOR showApp/showLogin aufgerufen, damit auch der
 *  Login-Screen versorgt ist. */
function mountStaticIcons() {
  const mounts = [
    ['.login-icon', 'chat', 36],
    ['.app-badge', 'chat', 18],
    ['.chat-empty-icon', 'chat', 48],
    ['#settings-btn', 'settings', 20],
    ['#sidebar-toggle', 'sidebar', 20],
    ['#back-btn', 'chevron-left', 24],
    ['#banner-cancel', 'x', 16],
    ['#attach-btn', 'paperclip', 20],
    ['#game-btn', 'gamepad', 20],
    ['#emoji-btn', 'smile', 20],
    ['#mic-btn', 'mic', 20],
    ['#send-btn', 'send', 18],
    ['#settings-close', 'x', 16],
  ];
  for (const [sel, name, size] of mounts) {
    const node = document.querySelector(sel);
    if (node) node.appendChild(icon(name, size));
  }
  // Buttons, bei denen das Icon VOR bestehendem Inhalt (Badge/Label) sitzt:
  calendarBtn.insertBefore(icon('calendar', 20), calendarBtn.firstChild);
  eventBtn.insertBefore(icon('calendar-plus', 15), eventBtn.firstChild);
  scrollDownBtn.insertBefore(icon('arrow-down', 20), scrollDownBtn.firstChild);
}

/* ---------- Sidebar: Einklappen (Desktop) ---------- */

function applySidebarCollapsed(collapsedState) {
  sidebarEl.classList.toggle('collapsed', collapsedState);
  sidebarToggle.title = collapsedState ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen';
  sidebarToggle.setAttribute('aria-expanded', collapsedState ? 'false' : 'true');
}

sidebarToggle.addEventListener('click', () => {
  const next = !sidebarEl.classList.contains('collapsed');
  try {
    localStorage.setItem(LS_SIDEBAR_COLLAPSED, next ? '1' : '0');
  } catch (e) { /* z. B. Privatmodus */ }
  applySidebarCollapsed(next);
});

function initSidebarCollapsed() {
  let collapsedState = false;
  try {
    collapsedState = localStorage.getItem(LS_SIDEBAR_COLLAPSED) === '1';
  } catch (e) { /* ignorieren */ }
  applySidebarCollapsed(collapsedState);
}

/* ---------- Entwürfe pro Raum ---------- */

const drafts = new Map();
(function loadDrafts() {
  try {
    const raw = localStorage.getItem(LS_DRAFTS);
    if (raw) {
      const obj = JSON.parse(raw);
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'string' && obj[k]) drafts.set(k, obj[k]);
      }
    }
  } catch (e) { /* ignorieren */ }
})();

let draftSaveTimer = null;
function persistDrafts() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_DRAFTS, JSON.stringify(Object.fromEntries(drafts)));
    } catch (e) { /* ignorieren */ }
  }, 400);
}

function getDraft(roomId) { return drafts.get(roomId) || ''; }
function setDraft(roomId, text) {
  if (!roomId) return;
  if (text && text.trim()) drafts.set(roomId, text);
  else drafts.delete(roomId);
  persistDrafts();
}
function clearDraft(roomId) {
  if (drafts.delete(roomId)) persistDrafts();
}

/* ---------- Schnellwechsler (Strg/Cmd+K) ---------- */

let quickSwitcherEl = null;
let quickSwitcherIndex = 0;

function openQuickSwitcher() {
  if (!session || quickSwitcherEl) return;
  const overlay = el('div', 'quick-switcher-overlay');
  overlay.id = 'quick-switcher';
  const panel = el('div', 'quick-switcher');

  const inputWrap = el('div', 'qs-input-wrap');
  inputWrap.appendChild(icon('search', 18));
  const input = el('input', 'qs-input');
  input.type = 'text';
  input.placeholder = 'Zu Raum wechseln …';
  input.setAttribute('aria-label', 'Raum suchen');
  inputWrap.appendChild(input);
  panel.appendChild(inputWrap);

  const list = el('div', 'qs-list');
  panel.appendChild(list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  quickSwitcherEl = overlay;
  quickSwitcherIndex = 0;

  const renderList = () => {
    const q = input.value.trim().toLowerCase();
    const matches = [...rooms.values()]
      .map((room) => ({ room, name: roomDisplayName(room) }))
      .filter((x) => !q || x.name.toLowerCase().includes(q))
      .sort((a, b) => b.room.lastEventTs - a.room.lastEventTs)
      .slice(0, 40);
    if (quickSwitcherIndex >= matches.length) quickSwitcherIndex = Math.max(0, matches.length - 1);
    list.textContent = '';
    matches.forEach((x, i) => {
      const item = el('div', 'qs-item');
      if (i === quickSwitcherIndex) item.classList.add('active');
      const av = el('div', 'qs-avatar');
      setAvatar(av, x.room.roomId, x.name, roomAvatarMxc(x.room));
      item.appendChild(av);
      const meta = el('div', 'qs-meta');
      meta.appendChild(el('div', 'qs-name', x.name));
      meta.appendChild(el('div', 'qs-preview', x.room.lastPreview || ''));
      item.appendChild(meta);
      item.addEventListener('click', () => { closeQuickSwitcher(); openRoom(x.room.roomId); });
      item.addEventListener('mousemove', () => {
        if (quickSwitcherIndex !== i) { quickSwitcherIndex = i; highlightQs(list); }
      });
      list.appendChild(item);
    });
    if (!matches.length) list.appendChild(el('div', 'qs-empty', 'Keine Räume gefunden'));
    list._matches = matches;
  };

  input.addEventListener('input', () => { quickSwitcherIndex = 0; renderList(); });
  input.addEventListener('keydown', (e) => {
    const matches = list._matches || [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      quickSwitcherIndex = Math.min(quickSwitcherIndex + 1, matches.length - 1);
      highlightQs(list);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      quickSwitcherIndex = Math.max(quickSwitcherIndex - 1, 0);
      highlightQs(list);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[quickSwitcherIndex];
      if (m) { closeQuickSwitcher(); openRoom(m.room.roomId); }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickSwitcher();
    }
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeQuickSwitcher(); });

  renderList();
  input.focus();
}

function highlightQs(list) {
  const items = list.querySelectorAll('.qs-item');
  items.forEach((it, i) => {
    it.classList.toggle('active', i === quickSwitcherIndex);
    if (i === quickSwitcherIndex) it.scrollIntoView({ block: 'nearest' });
  });
}

function closeQuickSwitcher() {
  if (quickSwitcherEl) { quickSwitcherEl.remove(); quickSwitcherEl = null; }
}

/* ---------- Einstellungen ---------- */

settingsBtn.addEventListener('click', () => {
  renderSettingsPanel();
  settingsOverlay.classList.remove('hidden');
});

settingsClose.addEventListener('click', () => settingsOverlay.classList.add('hidden'));

settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) {
    settingsOverlay.classList.add('hidden');
  }
  // Strg/Cmd+K: Schnellwechsler
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (quickSwitcherEl) closeQuickSwitcher();
    else openQuickSwitcher();
  }
});

themeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-theme-opt]');
  if (!btn) return;
  settings.theme = btn.dataset.themeOpt;
  saveSettings();
  applySettings();
});

densitySeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-density-opt]');
  if (!btn) return;
  settings.density = btn.dataset.densityOpt;
  saveSettings();
  applySettings();
});

textSizeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-textsize-opt]');
  if (!btn) return;
  settings.textSize = btn.dataset.textsizeOpt;
  saveSettings();
  applySettings();
});

linkPreviewToggle.addEventListener('change', () => {
  settings.linkPreviews = linkPreviewToggle.checked;
  saveSettings();
  applySettings();
  if (activeRoomId) renderTimeline();
});

inlineMediaToggle.addEventListener('change', () => {
  settings.inlineMedia = inlineMediaToggle.checked;
  saveSettings();
  applySettings();
  if (activeRoomId) renderTimeline();
});

enterSendToggle.addEventListener('change', () => {
  settings.enterToSend = enterSendToggle.checked;
  saveSettings();
});

readReceiptToggle.addEventListener('change', () => {
  settings.readReceipts = readReceiptToggle.checked;
  saveSettings();
});

typingToggle.addEventListener('change', () => {
  settings.typingIndicators = typingToggle.checked;
  saveSettings();
});

notifToggle.addEventListener('change', async () => {
  if (notifToggle.checked) {
    if (!('Notification' in window)) {
      toast('Benachrichtigungen werden hier nicht unterstützt');
      notifToggle.checked = false;
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      try { perm = await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
    }
    if (perm !== 'granted') {
      toast('Benachrichtigungen wurden vom Browser blockiert');
      notifToggle.checked = false;
      settings.notifications = false;
    } else {
      settings.notifications = true;
    }
  } else {
    settings.notifications = false;
  }
  saveSettings();
});

logoutBtn.addEventListener('click', async () => {
  settingsOverlay.classList.add('hidden');
  await doLogout();
  toast('Abgemeldet');
});

/* ---------- Verschlüsselung: Recovery Key ---------- */

recoveryBtn.addEventListener('click', () => {
  recoveryForm.classList.toggle('hidden');
  if (!recoveryForm.classList.contains('hidden')) recoveryInput.focus();
});

recoveryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!cryptoReady || !cryptoEngine) {
    toast('Verschlüsselung ist nicht verfügbar');
    return;
  }
  const key = recoveryInput.value;
  if (!key.trim()) return;
  recoverySubmit.disabled = true;
  recoveryBtn.disabled = true;
  toast('Schlüssel-Backup wird importiert …');
  try {
    const { imported, failed } = await cryptoEngine.importFromRecoveryKey(key, (done, total) => {
      if (done % 200 === 0 && done < total) toast(`Import: ${done}/${total} Schlüssel …`);
    });
    recoveryInput.value = '';
    recoveryForm.classList.add('hidden');
    toast(`${imported} Schlüssel importiert` + (failed ? ` (${failed} fehlgeschlagen)` : ''));
    await retryPendingDecryption();
  } catch (err) {
    toast('Import fehlgeschlagen: ' + ((err && err.message) || err));
  } finally {
    recoverySubmit.disabled = false;
    recoveryBtn.disabled = !cryptoReady;
  }
});

/* ========================================================================
 * Start
 * ====================================================================== */

function init() {
  mountStaticIcons();
  initSidebarCollapsed();
  applySettings();
  autoGrowComposer();
  session = loadSession();
  if (session) {
    showApp();
    cryptoInitPromise = initCrypto();
    syncLoop();
  } else {
    showLogin();
  }
}

init();
