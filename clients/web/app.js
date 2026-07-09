/* MatrixMess Web – Vanilla-JS-Matrix-Client (Client-Server API v3)
   Keine Frameworks, kein Build-Step, keine externen Abhängigkeiten. */
'use strict';

/* ========================================================================
 * Konstanten & DOM-Referenzen
 * ====================================================================== */

const LS_SESSION = 'mm.session';
const LS_SYNC_TOKEN = 'mm.syncToken';
const LS_SETTINGS = 'mm.settings';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥'];

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
  return `hsl(${hue}, 55%, 52%)`;
}

/* ========================================================================
 * Einstellungen (Theme, Akzentfarbe, Benachrichtigungen)
 * ====================================================================== */

function loadSettings() {
  const defaults = { theme: 'system', accent: '#8B4DF7', notifications: false };
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
  notifToggle.checked = !!settings.notifications &&
    ('Notification' in window) && Notification.permission === 'granted';
  settingsUserEl.textContent = session ? `Angemeldet als ${session.userId}` : '';
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
  showLogin();
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

/**
 * Verarbeitet ein Timeline-Event.
 * @returns {boolean} true, wenn ein neues sichtbares Event angefügt wurde
 */
function applyTimelineEvent(room, ev, live) {
  const type = ev.type;

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
      processSync(data);
      syncToken = data.next_batch;
      try { localStorage.setItem(LS_SYNC_TOKEN, syncToken); } catch (e) { /* */ }
      backoff = 1000;
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

function renderRoomList() {
  const query = roomSearchEl.value.trim().toLowerCase();
  const sorted = [...rooms.values()].sort((a, b) => b.lastEventTs - a.lastEventTs);
  roomListEl.textContent = '';
  let shown = 0;

  for (const room of sorted) {
    const name = roomDisplayName(room);
    if (query && !name.toLowerCase().includes(query)) continue;
    shown++;

    const item = el('div', 'room-item');
    item.setAttribute('role', 'button');
    if (room.roomId === activeRoomId) item.classList.add('active');

    const avatar = el('div', 'avatar');
    setAvatar(avatar, room.roomId, name, roomAvatarMxc(room));
    item.appendChild(avatar);

    const main = el('div', 'room-main');
    const row1 = el('div', 'room-row1');
    if (room.isEncrypted) row1.appendChild(el('span', 'room-lock', '🔒'));
    row1.appendChild(el('div', 'room-name', name));
    row1.appendChild(el('div', 'room-time', listTimeLabel(room.lastEventTs)));
    main.appendChild(row1);

    const row2 = el('div', 'room-row2');
    let preview = room.lastPreview || '';
    if (preview && session && room.lastPreviewSender === session.userId) {
      preview = 'Du: ' + preview;
    }
    row2.appendChild(el('div', 'room-preview', preview));
    if (room.unread > 0) {
      row2.appendChild(el('div', 'room-badge', room.unread > 99 ? '99+' : String(room.unread)));
    }
    main.appendChild(row2);
    item.appendChild(main);

    item.addEventListener('click', () => openRoom(room.roomId));
    roomListEl.appendChild(item);
  }

  if (!shown) {
    roomListEl.appendChild(
      el('div', 'room-list-empty', query ? 'Keine Räume gefunden' : 'Noch keine Räume – warte auf den ersten Sync …')
    );
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
  if (room.isEncrypted) subParts.push('🔒 Ende-zu-Ende-verschlüsselt');
  if (room.isDirect) subParts.push('Direktnachricht');
  chatSubEl.textContent = subParts.length ? subParts.join(' · ') : room.roomId;
  setAvatar(chatAvatarEl, room.roomId, name, roomAvatarMxc(room));

  // In E2EE-Raeumen niemals unverschluesselt senden: Composer sperren,
  // bis echte Verschluesselung unterstuetzt wird.
  if (room.isEncrypted) {
    composerInput.disabled = true;
    composerInput.value = '';
    composerInput.placeholder = 'Senden in verschlüsselte Räume wird in der Webversion noch nicht unterstützt';
    sendBtn.disabled = true;
  } else {
    composerInput.disabled = false;
    composerInput.placeholder = 'Nachricht';
    sendBtn.disabled = composerInput.value.trim().length === 0;
  }
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
  let prevEv = null;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const nextEv = events[i + 1] || null;

    const newDay = !prevEv || startOfDay(prevEv.ts) !== startOfDay(ev.ts);
    if (newDay) {
      const sep = el('div', 'day-sep');
      sep.appendChild(el('span', null, dayLabel(ev.ts)));
      timelineEl.appendChild(sep);
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
    meta.appendChild(el('span', null, '🕓'));
  } else if (endsGroup) {
    meta.appendChild(el('span', null, formatTime(ev.ts)));
  }
  if (ev.editedBody !== undefined && ev.editedBody !== null && !ev.redacted) {
    meta.insertBefore(el('span', 'edited-tag', '(bearbeitet)'), meta.firstChild);
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
    bubble.appendChild(el('span', null,
      '🔒 Verschlüsselte Nachricht – E2EE wird in der Webversion noch nicht unterstützt'));
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

  if (msgtype === 'm.image' && c.url) {
    bubble.classList.add('media');
    const holder = el('div', 'msg-image-loading', 'Bild wird geladen …');
    bubble.appendChild(holder);
    const info = c.info || {};
    mxcToObjectURL(c.url, { width: 640, height: 640, method: 'scale' })
      .then((url) => {
        if (!holder.isConnected) return;
        const img = document.createElement('img');
        img.className = 'msg-image';
        img.alt = c.body || 'Bild';
        if (info.w && info.h) img.style.aspectRatio = `${info.w} / ${info.h}`;
        img.src = url;
        img.addEventListener('click', () => {
          mxcToObjectURL(c.url)
            .then((full) => window.open(full, '_blank'))
            .catch(() => toast('Bild konnte nicht geladen werden'));
        });
        holder.replaceWith(img);
      })
      .catch(() => {
        if (holder.isConnected) holder.textContent = '🖼️ Bild nicht verfügbar';
      });
    if (hasMeta) bubble.appendChild(meta);
    return;
  }

  if ((msgtype === 'm.file' || msgtype === 'm.video' || msgtype === 'm.audio') && c.url) {
    const icons = { 'm.file': '📎', 'm.video': '🎬', 'm.audio': '🎵' };
    const card = el('div', 'attachment-card');
    card.appendChild(el('div', 'attachment-icon', icons[msgtype]));
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
  if (hasMeta) bubble.appendChild(meta);
}

function buildMessageActions(room, ev, mine) {
  if (ev.pending || ev.redacted || !ev.eventId) return null;
  const actions = el('div', 'msg-actions');

  if (ev.type === 'm.room.message') {
    const replyBtn = el('button', null, '↩');
    replyBtn.title = 'Antworten';
    replyBtn.addEventListener('click', () => startReply(room, ev));
    actions.appendChild(replyBtn);
  }

  const reactBtn = el('button', null, '☺');
  reactBtn.title = 'Reagieren';
  reactBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPopover(reactBtn, room, ev);
  });
  actions.appendChild(reactBtn);

  if (mine && ev.type === 'm.room.message') {
    const c = ev.content || {};
    const editable = !c.msgtype || c.msgtype === 'm.text' || c.msgtype === 'm.notice' || c.msgtype === 'm.emote';
    if (editable) {
      const editBtn = el('button', null, '✎');
      editBtn.title = 'Bearbeiten';
      editBtn.addEventListener('click', () => startEdit(room, ev));
      actions.appendChild(editBtn);
    }
    const delBtn = el('button', null, '🗑');
    delBtn.title = 'Löschen';
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
  for (const emoji of QUICK_EMOJIS) {
    const b = el('button', null, emoji);
    b.addEventListener('click', () => {
      closeEmojiPopover();
      toggleReaction(room, ev, emoji);
    });
    emojiPopover.appendChild(b);
  }
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
    const url = await mxcToObjectURL(content.url);
    const a = document.createElement('a');
    a.href = url;
    a.download = content.filename || content.body || 'datei';
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    for (const ev of chunk) {
      if (ev.state_key !== undefined) {
        applyStateEvent(room, ev);
        continue;
      }
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
    await api('POST', `/_matrix/client/v3/rooms/${enc(room.roomId)}/read_markers`, {
      'm.fully_read': last,
      'm.read': last,
    });
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

async function sendCurrentMessage() {
  const room = rooms.get(activeRoomId);
  if (!room) return;
  if (room.isEncrypted) {
    toast('Dieser Raum ist Ende-zu-Ende-verschlüsselt – Senden wird in der Webversion noch nicht unterstützt.');
    return;
  }
  const text = composerInput.value.replace(/\s+$/, '');
  if (!text.trim()) return;

  stopTypingSignal();

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
      await api('PUT',
        `/_matrix/client/v3/rooms/${enc(room.roomId)}/send/m.room.message/${enc(txnId())}`,
        content);
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
    const res = await api('PUT',
      `/_matrix/client/v3/rooms/${enc(room.roomId)}/send/m.room.message/${enc(txn)}`,
      content);
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
});

composerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendCurrentMessage();
  } else if (e.key === 'Escape' && (replyTarget || editTarget)) {
    cancelBanner();
  }
});

sendBtn.addEventListener('click', sendCurrentMessage);
bannerCancel.addEventListener('click', cancelBanner);

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
    syncLoop();
  } catch (err) {
    let msg = 'Anmeldung fehlgeschlagen';
    if (err && err.errcode === 'M_FORBIDDEN') msg = 'Benutzername oder Passwort falsch';
    else if (err && err.errcode === 'M_LIMIT_EXCEEDED') msg = 'Zu viele Versuche – bitte kurz warten';
    else if (err && err.message) msg = 'Anmeldung fehlgeschlagen: ' + err.message;
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
});

themeSeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-theme-opt]');
  if (!btn) return;
  settings.theme = btn.dataset.themeOpt;
  saveSettings();
  applySettings();
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

/* ========================================================================
 * Start
 * ====================================================================== */

function init() {
  applySettings();
  autoGrowComposer();
  session = loadSession();
  if (session) {
    showApp();
    syncLoop();
  } else {
    showLogin();
  }
}

init();
