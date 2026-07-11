/**
 * MatrixMess Web – Kalender-Modul (calendar.js)
 *
 * Termine aus Chats planen (wie in der iOS-App), Termin-Karten im Chat
 * rendern und eine Kalender-Übersicht anzeigen. Vanilla-JS als natives
 * ES-Modul (ES2020+), keine Frameworks, kein Build-Step.
 *
 * WEB-BESONDERHEIT: Statt Apple-/Google-/Outlook-Sync gibt es einen
 * ehrlichen ICS-Export – Termine werden als .ics-Datei heruntergeladen
 * und können manuell in jede Kalender-App importiert werden. Es findet
 * KEIN automatischer Kalender-Sync mit Fremddiensten statt.
 *
 * SICHERHEIT:
 *  - DOM wird ausschließlich per document.createElement + textContent/append
 *    aufgebaut (NIE innerHTML/outerHTML/insertAdjacentHTML mit dyn. Daten).
 *  - Keine javascript:-URLs; in href landen ausschließlich blob:-URLs
 *    (ICS-Download über URL.createObjectURL).
 *
 * DATENMODELL (ein Termin):
 *   { id, roomId, roomName, title, note, startTs, endTs, createdBy }
 *   - id        : string, modulintern vergeben
 *   - roomId    : Matrix-Raum-ID, aus dem der Termin geplant wurde
 *   - roomName  : Anzeigename des Raums (Snapshot beim Anlegen)
 *   - title     : Titel (Pflicht), note: Freitext-Notiz (optional)
 *   - startTs/endTs : Unix-Millisekunden (endTs > startTs)
 *   - createdBy : Matrix-User-ID des Erstellers ('' wenn unbekannt)
 *
 * PERSISTENZ:
 *  - primär Matrix-account_data, Typ "io.matrixmess.calendar"
 *    (synct über Geräte): { version: 1, events: [Termin, …] }
 *  - localStorage "mm.calendar" als Cache/Fallback
 *
 * ======================= EXPORT-API =======================
 *
 * initCalendar(opts) -> Promise<void>
 *   opts = {
 *     getAccountData(type)      -> Promise<object|null>  (account_data lesen),
 *     putAccountData(type, obj) -> Promise               (account_data schreiben),
 *     sendEventMessage(roomId, evt) -> Promise           (Termin-Nachricht in den
 *                                                         Raum senden; evt ist das
 *                                                         komplette Termin-Objekt),
 *     onChange()                                         (wird bei JEDER Änderung
 *                                                         gerufen; der Integrator
 *                                                         rendert dann z. B. den
 *                                                         Badge-Zähler neu),
 *     getUserId()  -> string    (OPTIONAL: eigene Matrix-User-ID für createdBy)
 *   }
 *   Lädt den Zustand: erst localStorage-Cache ("mm.calendar"), dann
 *   account_data ("io.matrixmess.calendar") als primäre Quelle; bei
 *   Fehlern bleibt der lokale Fallback aktiv.
 *
 * openEventPlanner({ roomId, roomName })
 *   Öffnet das Planungs-Modal für einen Chat:
 *   Titel (Pflichtfeld), Notiz (optional), Start (datetime-local, Default
 *   nächste volle Stunde), Dauer-Auswahl (30/45/60/90/120 Min, Default 45).
 *   "Speichern" legt den Termin an (Persistenz + onChange) und ruft danach
 *   sendEventMessage(roomId, evt) auf (Fehler dabei werden nur geloggt,
 *   der Termin bleibt im Kalender).
 *
 * renderCalendarPanel() -> HTMLElement
 *   Baut das Kalender-Overlay (Backdrop + Panel) und gibt es zurück; der
 *   Aufrufer hängt es in den DOM (z. B. document.body.append(...)).
 *   Inhalt: Hinweis auf den ICS-Export (kein Auto-Sync), Button
 *   "Alle als ICS exportieren", Liste der kommenden Termine gruppiert
 *   nach Tag ("Heute" / "Morgen" / "Mi., 15. Juli"); je Eintrag Zeitspanne,
 *   Titel, Raumname, Notiz sowie Buttons Bearbeiten / Löschen (zweistufig) /
 *   ICS. Leerer Zustand mit Hinweistext. Schließen über ✕, Klick auf den
 *   Backdrop oder Escape entfernt das Element wieder aus dem DOM. Solange
 *   das Panel offen ist, aktualisiert es sich bei Änderungen selbst.
 *
 * renderEventCard(evtLike) -> HTMLElement
 *   Karte für Chat-Nachrichten (div.mm-cal-card): 📅-Icon, Titel,
 *   formatiertes Datum wie "Mi., 15. Juli, 14:00–14:45" (bei Terminen über
 *   Mitternacht mit End-Datum, bei fremdem Jahr mit Jahreszahl), Notiz,
 *   dezenter Akzent-Rahmen. Tolerant gegenüber unvollständigen Objekten
 *   (z. B. aus empfangenen Matrix-Events) – fehlende Felder werden
 *   weggelassen statt zu werfen.
 *
 * getUpcomingCount() -> number
 *   Anzahl der Termine ab jetzt (noch nicht beendete Termine, d. h.
 *   endTs >= Date.now(); laufende Termine zählen mit).
 *
 * exportIcs(events)
 *   Erzeugt einen RFC-5545-Kalender (BEGIN:VCALENDAR/VEVENT mit UID,
 *   DTSTAMP, DTSTART/DTEND als UTC "…Z", SUMMARY, DESCRIPTION und LOCATION
 *   TEXT-escaped, Zeilen CRLF-terminiert und auf 75 Oktette gefaltet) und
 *   triggert den Download als .ics-Datei via Blob-URL. `events` ist ein
 *   Array von Termin-Objekten (ein einzelnes Objekt wird auch akzeptiert);
 *   ungültige Einträge werden übersprungen, bei leerer Liste passiert nichts.
 *
 * Datum/Zeit-Formatierung durchgängig via Intl.DateTimeFormat('de-DE').
 * Benötigt calendar.css (Klassenpräfix "mm-cal-").
 */

'use strict';

import { icon } from './icons.js';

/* ============================ Konstanten ============================ */

const ACCOUNT_DATA_TYPE = 'io.matrixmess.calendar';
const LS_STATE = 'mm.calendar';

const PUT_DEBOUNCE_MS = 600;

/** Wählbare Dauern im Planer (Minuten) + Default. */
const DURATIONS_MIN = [30, 45, 60, 90, 120];
const DEFAULT_DURATION_MIN = 45;

const MS_PER_MIN = 60 * 1000;

const TITLE_MAX_LEN = 120;
const NOTE_MAX_LEN = 500;

/* ============================ Modul-Zustand ============================ */

let hooks = {
  getAccountData: null,
  putAccountData: null,
  sendEventMessage: null,
  onChange: null,
  getUserId: null,
};

/** Persistenter, geräteübergreifender Zustand. */
let state = {
  events: [], // [Termin] – sortiert nach startTs aufsteigend
  feeds: [],  // Kalender-Abos: [{ id, url, name }] (Apple/Google/Outlook per ICS-URL)
};

/** Laufzeit-Cache der Abo-Inhalte (nicht in account_data – nur die URLs syncen).
 *  feedId -> { events: [], fetchedAt: number, error: string|null } */
const feedCache = new Map();
const LS_FEED_CACHE = 'mm.calendarFeedCache';
const FEED_STALE_MS = 15 * 60 * 1000;   // Panel-Öffnen: nur ältere Abos neu laden
const FEED_WINDOW_MS = 120 * 24 * 3600 * 1000; // Termine bis 120 Tage voraus
const FEED_MAX_EVENTS = 300;            // pro Abo

let putTimer = null;
let activeModal = null;

/** Aktuell offenes Kalender-Panel (für Live-Refresh bei Änderungen). */
let openPanel = null; // { overlay, listWrap, exportBtn }

/* ============================ DOM-Helfer ============================ */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/* ============================ Persistenz ============================ */

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

function schedulePutAccountData() {
  if (typeof hooks.putAccountData !== 'function') return;
  clearTimeout(putTimer);
  putTimer = setTimeout(() => {
    const payload = {
      version: 1,
      events: state.events.map((evt) => ({ ...evt })),
      feeds: state.feeds.map((f) => ({ ...f })),
    };
    Promise.resolve(hooks.putAccountData(ACCOUNT_DATA_TYPE, payload)).catch((e) => {
      console.warn('[calendar] account_data konnte nicht geschrieben werden (lokaler Cache bleibt):', e);
    });
  }, PUT_DEBOUNCE_MS);
}

function notifyChange() {
  refreshPanelIfOpen();
  if (typeof hooks.onChange === 'function') {
    try { hooks.onChange(); } catch (e) { console.error('[calendar] onChange-Fehler:', e); }
  }
}

/** Zentrale "es hat sich etwas geändert"-Routine. */
function changed() {
  sortEvents();
  saveLocal(LS_STATE, state);
  schedulePutAccountData();
  notifyChange();
}

/* ============================ Termin-Helfer ============================ */

function newEventId() {
  return 'evt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function sortEvents() {
  state.events.sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs);
}

/**
 * Ein rohes Objekt tolerant in ein gültiges Termin-Objekt wandeln.
 * Gibt null zurück, wenn kein brauchbarer Zeitpunkt vorhanden ist.
 */
function coerceEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const startTs = Number(raw.startTs);
  if (!Number.isFinite(startTs)) return null;
  let endTs = Number(raw.endTs);
  if (!Number.isFinite(endTs) || endTs <= startTs) {
    endTs = startTs + DEFAULT_DURATION_MIN * MS_PER_MIN;
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newEventId(),
    roomId: typeof raw.roomId === 'string' ? raw.roomId : '',
    roomName: typeof raw.roomName === 'string' ? raw.roomName : '',
    title: typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim().slice(0, TITLE_MAX_LEN)
      : 'Termin',
    note: typeof raw.note === 'string' ? raw.note.slice(0, NOTE_MAX_LEN) : '',
    startTs,
    endTs,
    createdBy: typeof raw.createdBy === 'string' ? raw.createdBy : '',
  };
}

/** Rohdaten (account_data / localStorage) in einen sauberen Zustand wandeln. */
function sanitizeState(raw) {
  const out = { events: [], feeds: [] };
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.events)) {
    const seen = new Set();
    for (const rawEvt of raw.events) {
      const evt = coerceEvent(rawEvt);
      if (!evt || seen.has(evt.id)) continue;
      seen.add(evt.id);
      out.events.push(evt);
    }
    out.events.sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs);
  }
  if (Array.isArray(raw.feeds)) {
    const seenF = new Set();
    for (const f of raw.feeds) {
      if (!f || typeof f !== 'object') continue;
      const url = normalizeFeedUrl(f.url);
      if (!url || typeof f.id !== 'string' || !f.id || seenF.has(f.id)) continue;
      seenF.add(f.id);
      out.feeds.push({
        id: f.id,
        url,
        name: typeof f.name === 'string' && f.name.trim() ? f.name.trim().slice(0, 60) : 'Kalender',
      });
      if (out.feeds.length >= 10) break;
    }
  }
  return out;
}

function eventById(id) {
  return state.events.find((evt) => evt.id === id) || null;
}

/** Kommende (noch nicht beendete) Termine, sortiert nach Start. */
function upcomingEvents() {
  const now = Date.now();
  return state.events.filter((evt) => evt.endTs >= now);
}

function ownUserId() {
  if (typeof hooks.getUserId !== 'function') return '';
  try {
    const uid = hooks.getUserId();
    return typeof uid === 'string' ? uid : '';
  } catch (e) {
    return '';
  }
}

/* ============================ Datum/Zeit (de-DE) ============================ */

/** "Mi." – Punkt wird normalisiert (manche ICU-Versionen liefern "Mi"). */
function fmtWeekdayShort(d) {
  let wd = new Intl.DateTimeFormat('de-DE', { weekday: 'short' }).format(d);
  if (!wd.endsWith('.')) wd += '.';
  return wd;
}

/** "15. Juli" bzw. "15. Juli 2027". */
function fmtDayMonth(d, withYear) {
  const opts = { day: 'numeric', month: 'long' };
  if (withYear) opts.year = 'numeric';
  return new Intl.DateTimeFormat('de-DE', opts).format(d);
}

/** "14:00". */
function fmtTime(d) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(d);
}

function isCurrentYear(d) {
  return d.getFullYear() === new Date().getFullYear();
}

/** "Mi., 15. Juli" (Jahr nur, wenn nicht das laufende Jahr). */
function fmtDayHeading(d) {
  return fmtWeekdayShort(d) + ', ' + fmtDayMonth(d, !isCurrentYear(d));
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** "Mi., 15. Juli, 14:00–14:45" (über Mitternacht mit beiden Tagen). */
function formatEventRange(startTs, endTs) {
  const start = new Date(startTs);
  const end = new Date(endTs);
  if (isSameLocalDay(start, end)) {
    return fmtDayHeading(start) + ', ' + fmtTime(start) + '–' + fmtTime(end);
  }
  return fmtDayHeading(start) + ', ' + fmtTime(start)
    + ' – ' + fmtDayHeading(end) + ', ' + fmtTime(end);
}

/** Gruppen-Überschrift für die Panel-Liste: Heute / Morgen / Datum. */
function dayGroupLabel(d) {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (isSameLocalDay(d, today)) return 'Heute';
  if (isSameLocalDay(d, tomorrow)) return 'Morgen';
  return fmtDayHeading(d);
}

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Date -> Wert für <input type="datetime-local"> (lokale Zeit). */
function toDatetimeLocalValue(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** "YYYY-MM-DDTHH:MM[:SS]" (lokal) -> Unix-ms oder null. */
function parseDatetimeLocal(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Nächste volle Stunde (lokal). */
function nextFullHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/* ============================ Öffentliche API – Zustand ============================ */

export async function initCalendar(opts) {
  const o = opts || {};
  hooks = {
    getAccountData: typeof o.getAccountData === 'function' ? o.getAccountData : null,
    putAccountData: typeof o.putAccountData === 'function' ? o.putAccountData : null,
    sendEventMessage: typeof o.sendEventMessage === 'function' ? o.sendEventMessage : null,
    onChange: typeof o.onChange === 'function' ? o.onChange : null,
    getUserId: typeof o.getUserId === 'function' ? o.getUserId : null,
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
      console.warn('[calendar] account_data nicht ladbar, nutze lokalen Cache:', e);
    }
  }

  // 3) Abonnierte Kalender: gecachte Inhalte sofort, dann im Hintergrund laden.
  loadFeedCache();
  refreshAllFeeds(false);

  notifyChange();
}

export function getUpcomingCount() {
  return upcomingEvents().length;
}

/* ============================ Interne Mutationen ============================ */

function addEvent(evt) {
  state.events.push(evt);
  changed();
}

function updateEvent(id, patch) {
  const evt = eventById(id);
  if (!evt) return false;
  const p = patch || {};
  if (typeof p.title === 'string' && p.title.trim()) {
    evt.title = p.title.trim().slice(0, TITLE_MAX_LEN);
  }
  if (typeof p.note === 'string') evt.note = p.note.slice(0, NOTE_MAX_LEN);
  if (Number.isFinite(p.startTs)) evt.startTs = p.startTs;
  if (Number.isFinite(p.endTs) && p.endTs > evt.startTs) evt.endTs = p.endTs;
  changed();
  return true;
}

function deleteEvent(id) {
  const idx = state.events.findIndex((evt) => evt.id === id);
  if (idx === -1) return false;
  state.events.splice(idx, 1);
  changed();
  return true;
}

/* ============================ ICS-Parser ============================ */

/** webcal:// -> https://; nur http(s) zulassen. */
function normalizeFeedUrl(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^webcal:\/\//i, 'https://');
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.toString();
  } catch (e) {
    return null;
  }
}

/** ICS-Zeilen entfalten (RFC 5545: Fortsetzungszeilen beginnen mit Space/Tab). */
function unfoldIcsLines(text) {
  const rawLines = String(text).split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** "SUMMARY;LANGUAGE=de:Titel" -> { name, params: {LANGUAGE:'de'}, value } */
function parseIcsLine(line) {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const parts = left.split(';');
  const name = parts[0].toUpperCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq > 0) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

function unescapeIcsText(value) {
  return String(value)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** ICS-Zeitwert -> { ts, allDay }. TZID wird als lokale Zeit interpretiert
 *  (korrekt für den Normalfall "eigener Kalender in eigener Zeitzone"). */
function parseIcsDate(value, params) {
  const v = String(value).trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (m || (params && params.VALUE === 'DATE')) {
    m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { ts: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), allDay: true };
  }
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/.exec(v);
  if (!m) return null;
  const sec = m[6] ? +m[6] : 0;
  if (m[7] === 'Z') {
    return { ts: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], sec), allDay: false };
  }
  return { ts: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], sec).getTime(), allDay: false };
}

/** ISO-8601-Dauer (PT1H30M, P1D …) in Millisekunden. */
function parseIcsDuration(value) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const ms = ((+m[2] || 0) * 7 * 24 * 3600 + (+m[3] || 0) * 24 * 3600 +
    (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

/** "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10" -> Objekt. */
function parseRrule(value) {
  const out = {};
  for (const part of String(value).split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return out;
}

/** Alle VEVENTs eines ICS-Texts als Rohobjekte. */
function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of unfoldIcsLines(text)) {
    if (/^BEGIN:VEVENT/i.test(line)) { cur = { exdates: [] }; continue; }
    if (/^END:VEVENT/i.test(line)) {
      if (cur && cur.start) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseIcsLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break;
      case 'SUMMARY': cur.title = unescapeIcsText(p.value).trim(); break;
      case 'DESCRIPTION': cur.note = unescapeIcsText(p.value).trim(); break;
      case 'LOCATION': cur.location = unescapeIcsText(p.value).trim(); break;
      case 'DTSTART': cur.start = parseIcsDate(p.value, p.params); break;
      case 'DTEND': cur.end = parseIcsDate(p.value, p.params); break;
      case 'DURATION': cur.durationMs = parseIcsDuration(p.value); break;
      case 'RRULE': cur.rrule = parseRrule(p.value); break;
      case 'EXDATE':
        for (const part of p.value.split(',')) {
          const d = parseIcsDate(part, p.params);
          if (d) cur.exdates.push(d.ts);
        }
        break;
      case 'STATUS': cur.cancelled = /^CANCELLED$/i.test(p.value.trim()); break;
    }
  }
  return events;
}

const ICS_WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Ein VEVENT in konkrete Vorkommen im Fenster [von, bis] expandieren.
 * Unterstützt die gängigen RRULEs (DAILY/WEEKLY inkl. BYDAY/MONTHLY/YEARLY
 * mit INTERVAL, COUNT, UNTIL, EXDATE); Exoten fallen auf das Einzel-Event
 * zurück. Ergebnis: [{ title, note, startTs, endTs, allDay, uid }]
 */
function expandVevent(ve, windowStart, windowEnd, cap) {
  if (ve.cancelled || !ve.start) return [];
  const title = ve.title || 'Termin';
  const note = [ve.location, ve.note].filter(Boolean).join('\n').slice(0, NOTE_MAX_LEN);
  const allDay = !!ve.start.allDay;
  let durMs = 0;
  if (ve.end) durMs = Math.max(0, ve.end.ts - ve.start.ts);
  else if (Number.isFinite(ve.durationMs)) durMs = Math.max(0, ve.durationMs);
  else durMs = allDay ? 24 * 3600 * 1000 : DEFAULT_DURATION_MIN * MS_PER_MIN;

  const mk = (startTs) => ({
    title, note, allDay, uid: ve.uid || null,
    startTs, endTs: startTs + durMs,
  });
  const excluded = (ts) => ve.exdates.some((x) => Math.abs(x - ts) < 1000);

  const r = ve.rrule;
  if (!r || !r.FREQ) {
    const one = ve.start.ts;
    return (one + durMs >= windowStart && one <= windowEnd && !excluded(one)) ? [mk(one)] : [];
  }

  const freq = String(r.FREQ).toUpperCase();
  const interval = Math.max(1, parseInt(r.INTERVAL, 10) || 1);
  const count = r.COUNT ? Math.max(1, parseInt(r.COUNT, 10) || 1) : Infinity;
  let until = Infinity;
  if (r.UNTIL) {
    const u = parseIcsDate(r.UNTIL, {});
    if (u) until = u.ts + (u.allDay ? 24 * 3600 * 1000 : 0);
  }
  const out = [];
  const startDate = new Date(ve.start.ts);
  let produced = 0; // zählt ALLE Vorkommen (für COUNT), nicht nur die im Fenster

  if (freq === 'WEEKLY' && r.BYDAY) {
    const days = String(r.BYDAY).split(',')
      .map((d) => ICS_WEEKDAYS[d.trim().slice(-2).toUpperCase()])
      .filter((d) => d !== undefined);
    if (days.length) {
      // Wochenweise ab der Woche des Starts iterieren.
      const weekAnchor = new Date(startDate);
      weekAnchor.setHours(0, 0, 0, 0);
      weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay()); // Sonntag
      for (let w = 0; produced < count; w += interval) {
        const base = new Date(weekAnchor);
        base.setDate(base.getDate() + w * 7);
        if (base.getTime() > Math.min(windowEnd, until)) break;
        for (const wd of days.slice().sort((a, b) => a - b)) {
          const occ = new Date(base);
          occ.setDate(occ.getDate() + wd);
          occ.setHours(startDate.getHours(), startDate.getMinutes(), startDate.getSeconds(), 0);
          const ts = occ.getTime();
          if (ts < ve.start.ts) continue;
          if (ts > until || produced >= count) break;
          produced++;
          if (ts + durMs >= windowStart && ts <= windowEnd && !excluded(ts)) {
            out.push(mk(ts));
            if (out.length >= cap) return out;
          }
        }
      }
      return out;
    }
  }

  // DAILY / WEEKLY ohne BYDAY / MONTHLY / YEARLY: Start fortschreiben.
  const next = (d, i) => {
    const n = new Date(d);
    if (freq === 'DAILY') n.setDate(n.getDate() + i);
    else if (freq === 'WEEKLY') n.setDate(n.getDate() + 7 * i);
    else if (freq === 'MONTHLY') n.setMonth(n.getMonth() + i);
    else if (freq === 'YEARLY') n.setFullYear(n.getFullYear() + i);
    else return null;
    return n;
  };
  for (let i = 0, d = new Date(startDate); d; i++, d = next(startDate, i * interval)) {
    const ts = d.getTime();
    if (ts > until || produced >= count) break;
    if (ts > windowEnd) break;
    produced++;
    if (ts + durMs >= windowStart && !excluded(ts)) {
      out.push(mk(ts));
      if (out.length >= cap) break;
    }
    if (i > 4000) break; // Sicherheitsnetz
  }
  return out;
}

/** Kompletten ICS-Text in Vorkommen im Standard-Fenster wandeln. */
function icsToOccurrences(text, cap) {
  const windowStart = Date.now() - 24 * 3600 * 1000;
  const windowEnd = Date.now() + FEED_WINDOW_MS;
  const out = [];
  for (const ve of parseIcs(text)) {
    for (const occ of expandVevent(ve, windowStart, windowEnd, cap - out.length)) {
      out.push(occ);
      if (out.length >= cap) return out;
    }
  }
  out.sort((a, b) => a.startTs - b.startTs);
  return out;
}

/* ============================ Kalender-Abos ============================ */

function loadFeedCache() {
  const raw = loadLocal(LS_FEED_CACHE);
  if (!raw || typeof raw !== 'object') return;
  for (const [id, rec] of Object.entries(raw)) {
    if (rec && Array.isArray(rec.events)) {
      feedCache.set(id, { events: rec.events, fetchedAt: rec.fetchedAt || 0, error: null });
    }
  }
}

function saveFeedCache() {
  const obj = {};
  for (const [id, rec] of feedCache) {
    if (state.feeds.some((f) => f.id === id)) {
      obj[id] = { events: rec.events, fetchedAt: rec.fetchedAt };
    }
  }
  saveLocal(LS_FEED_CACHE, obj);
}

/** Ein Abo abrufen und parsen; Fehler landen im Cache-Eintrag (UI zeigt sie). */
async function refreshFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { Accept: 'text/calendar, text/plain, */*' },
      redirect: 'follow',
      credentials: 'omit',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Keine ICS-Daten');
    const events = icsToOccurrences(text, FEED_MAX_EVENTS);
    feedCache.set(feed.id, { events, fetchedAt: Date.now(), error: null });
    saveFeedCache();
  } catch (err) {
    const prev = feedCache.get(feed.id) || { events: [], fetchedAt: 0 };
    // "Failed to fetch" ist im Browser fast immer eine CORS-Sperre des Anbieters.
    const msg = err && /fetch/i.test(String(err.message))
      ? 'Abruf im Browser blockiert (CORS) – in der Windows-App funktioniert dieses Abo.'
      : 'Abruf fehlgeschlagen: ' + ((err && err.message) || 'Unbekannt');
    feedCache.set(feed.id, { events: prev.events, fetchedAt: prev.fetchedAt, error: msg });
  }
  refreshPanelIfOpen();
  if (typeof hooks.onChange === 'function') {
    try { hooks.onChange(); } catch (e) { /* */ }
  }
}

/** Alle Abos laden; ohne force nur veraltete. */
function refreshAllFeeds(force) {
  for (const feed of state.feeds) {
    const rec = feedCache.get(feed.id);
    if (!force && rec && Date.now() - rec.fetchedAt < FEED_STALE_MS) continue;
    refreshFeed(feed); // bewusst parallel, Fehler landen im Cache
  }
}

function addFeed(url, name) {
  const clean = normalizeFeedUrl(url);
  if (!clean) return { ok: false, reason: 'Ungültige URL (https:// oder webcal:// erwartet)' };
  if (state.feeds.some((f) => f.url === clean)) return { ok: false, reason: 'Dieser Kalender ist bereits abonniert' };
  if (state.feeds.length >= 10) return { ok: false, reason: 'Maximal 10 Kalender-Abos' };
  const feed = {
    id: 'feed-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    url: clean,
    name: (typeof name === 'string' && name.trim() ? name.trim() : feedNameFromUrl(clean)).slice(0, 60),
  };
  state.feeds.push(feed);
  changed();
  refreshFeed(feed);
  return { ok: true, feed };
}

function removeFeed(id) {
  const idx = state.feeds.findIndex((f) => f.id === id);
  if (idx === -1) return;
  state.feeds.splice(idx, 1);
  feedCache.delete(id);
  saveFeedCache();
  changed();
}

function feedNameFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (/icloud\.com$/i.test(host)) return 'Apple Kalender';
    if (/google\.com$/i.test(host)) return 'Google Kalender';
    if (/(office365|outlook|live)\.com$/i.test(host)) return 'Outlook Kalender';
    return host;
  } catch (e) {
    return 'Kalender';
  }
}

/** Kommende Abo-Termine (read-only), mit Quellenname versehen. */
function upcomingFeedEvents() {
  const now = Date.now();
  const out = [];
  for (const feed of state.feeds) {
    const rec = feedCache.get(feed.id);
    if (!rec) continue;
    for (const occ of rec.events) {
      if (occ.endTs >= now) out.push(Object.assign({ feedName: feed.name, feedId: feed.id }, occ));
    }
  }
  return out;
}

/* ============================ ICS-Datei-Import ============================ */

/**
 * ICS-Text als eigene Termine importieren (synct dann über Matrix).
 * Wiederkehrende Termine werden im 120-Tage-Fenster expandiert; erneuter
 * Import derselben Datei aktualisiert statt zu duplizieren (stabile IDs).
 */
function importIcsText(text) {
  const occs = icsToOccurrences(text, 200);
  let added = 0;
  let updated = 0;
  for (const occ of occs) {
    const id = occ.uid ? 'ics:' + occ.uid + ':' + occ.startTs : newEventId();
    const existing = eventById(id);
    if (existing) {
      existing.title = occ.title.slice(0, TITLE_MAX_LEN);
      existing.note = occ.note;
      existing.startTs = occ.startTs;
      existing.endTs = occ.endTs;
      updated++;
    } else {
      state.events.push({
        id,
        roomId: '',
        roomName: '',
        title: occ.title.slice(0, TITLE_MAX_LEN) || 'Termin',
        note: occ.note,
        startTs: occ.startTs,
        endTs: occ.endTs,
        createdBy: ownUserId(),
      });
      added++;
    }
  }
  if (added || updated) changed();
  return { added, updated, total: occs.length };
}

/* ============================ Leichtes Modal ============================ */

function openModal(titleText, subText) {
  if (activeModal) activeModal.close();

  const overlay = el('div', 'mm-cal-overlay mm-cal-modal-overlay');
  const panel = el('div', 'mm-cal-modal');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', titleText);
  panel.tabIndex = -1;

  const header = el('div', 'mm-cal-modal-header');
  const title = el('h3', 'mm-cal-modal-title', titleText);
  const closeBtn = el('button', 'mm-cal-close');
  closeBtn.append(icon('x', 16));
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Schließen');
  header.append(title, closeBtn);

  const body = el('div', 'mm-cal-modal-body');
  const footer = el('div', 'mm-cal-modal-footer');
  panel.append(header);
  if (subText) panel.append(el('div', 'mm-cal-modal-sub', subText));
  panel.append(body, footer);
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
  const btn = el('button', primary ? 'mm-cal-btn primary' : 'mm-cal-btn', labelText);
  btn.type = 'button';
  return btn;
}

/* ============================ Termin-Formular (Anlegen + Bearbeiten) ============================ */

/**
 * Gemeinsames Formular. mode = 'create' (mit roomCtx) oder 'edit'
 * (mit existing = vorhandener Termin).
 */
function openEventForm(mode, roomCtx, existing) {
  const isEdit = mode === 'edit' && existing;
  const subText = isEdit
    ? (existing.roomName || existing.roomId || '')
    : (roomCtx.roomName || roomCtx.roomId);
  const modal = openModal(isEdit ? 'Termin bearbeiten' : 'Termin planen', subText);

  // --- Titel (Pflicht) ---
  const titleField = el('label', 'mm-cal-field');
  titleField.append(el('span', 'mm-cal-field-label', 'Titel'));
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'mm-cal-input';
  titleInput.placeholder = 'z. B. Videocall';
  titleInput.maxLength = TITLE_MAX_LEN;
  titleInput.value = isEdit ? existing.title : '';
  titleInput.addEventListener('input', () => titleInput.classList.remove('invalid'));
  titleField.append(titleInput);
  modal.body.append(titleField);

  // --- Notiz (optional) ---
  const noteField = el('label', 'mm-cal-field');
  noteField.append(el('span', 'mm-cal-field-label', 'Notiz (optional)'));
  const noteInput = document.createElement('textarea');
  noteInput.className = 'mm-cal-textarea';
  noteInput.placeholder = 'z. B. Agenda oder Treffpunkt';
  noteInput.maxLength = NOTE_MAX_LEN;
  noteInput.rows = 3;
  noteInput.value = isEdit ? existing.note : '';
  noteField.append(noteInput);
  modal.body.append(noteField);

  // --- Start (datetime-local, Default: nächste volle Stunde) ---
  const startField = el('label', 'mm-cal-field');
  startField.append(el('span', 'mm-cal-field-label', 'Start'));
  const startInput = document.createElement('input');
  startInput.type = 'datetime-local';
  startInput.className = 'mm-cal-input';
  startInput.value = toDatetimeLocalValue(isEdit ? new Date(existing.startTs) : nextFullHour());
  startInput.addEventListener('input', () => startInput.classList.remove('invalid'));
  startField.append(startInput);
  modal.body.append(startField);

  // --- Dauer (Chips: 30/45/60/90/120 Min, Default 45) ---
  let duration = DEFAULT_DURATION_MIN;
  if (isEdit) {
    duration = Math.max(1, Math.round((existing.endTs - existing.startTs) / MS_PER_MIN));
  }
  const durField = el('div', 'mm-cal-field');
  durField.append(el('span', 'mm-cal-field-label', 'Dauer'));
  const durRow = el('div', 'mm-cal-dur-row');
  durRow.setAttribute('role', 'radiogroup');
  durRow.setAttribute('aria-label', 'Dauer');
  const durValues = DURATIONS_MIN.includes(duration)
    ? DURATIONS_MIN
    : [...DURATIONS_MIN, duration].sort((a, b) => a - b);
  const durButtons = [];
  for (const min of durValues) {
    const chip = el('button', 'mm-cal-dur-chip', min + ' Min');
    chip.type = 'button';
    chip.setAttribute('role', 'radio');
    const select = () => {
      duration = min;
      for (const other of durButtons) {
        const sel = other === chip;
        other.classList.toggle('selected', sel);
        other.setAttribute('aria-checked', sel ? 'true' : 'false');
      }
    };
    if (min === duration) {
      chip.classList.add('selected');
      chip.setAttribute('aria-checked', 'true');
    } else {
      chip.setAttribute('aria-checked', 'false');
    }
    chip.addEventListener('click', select);
    durButtons.push(chip);
    durRow.append(chip);
  }
  durField.append(durRow);
  modal.body.append(durField);

  // --- Footer ---
  const cancelBtn = footerButton('Abbrechen', false);
  cancelBtn.addEventListener('click', modal.close);

  const saveBtn = footerButton(isEdit ? 'Speichern' : 'Termin anlegen', true);
  saveBtn.addEventListener('click', () => {
    const title = titleInput.value.trim();
    const startTs = parseDatetimeLocal(startInput.value);
    let ok = true;
    if (!title) {
      titleInput.classList.add('invalid');
      ok = false;
    }
    if (startTs === null) {
      startInput.classList.add('invalid');
      ok = false;
    }
    if (!ok) {
      (title ? startInput : titleInput).focus();
      return;
    }
    const endTs = startTs + duration * MS_PER_MIN;
    const note = noteInput.value.slice(0, NOTE_MAX_LEN);

    if (isEdit) {
      updateEvent(existing.id, { title, note, startTs, endTs });
    } else {
      const evt = {
        id: newEventId(),
        roomId: roomCtx.roomId,
        roomName: roomCtx.roomName || '',
        title: title.slice(0, TITLE_MAX_LEN),
        note,
        startTs,
        endTs,
        createdBy: ownUserId(),
      };
      addEvent(evt);
      if (hooks.sendEventMessage) {
        Promise.resolve(hooks.sendEventMessage(evt.roomId, { ...evt })).catch((e) => {
          console.warn('[calendar] Termin-Nachricht konnte nicht gesendet werden (Termin bleibt im Kalender):', e);
        });
      }
    }
    modal.close();
  });

  modal.footer.append(cancelBtn, saveBtn);
  titleInput.focus();
}

/* ============================ Öffentliche API – Planer ============================ */

export function openEventPlanner(opts) {
  const o = opts || {};
  if (typeof o.roomId !== 'string' || !o.roomId) {
    console.warn('[calendar] openEventPlanner: roomId fehlt');
    return;
  }
  openEventForm('create', {
    roomId: o.roomId,
    roomName: typeof o.roomName === 'string' ? o.roomName : '',
  }, null);
}

/* ============================ Öffentliche API – Termin-Karte (Chat) ============================ */

export function renderEventCard(evtLike) {
  const evt = coerceEvent(evtLike) || {
    title: (evtLike && typeof evtLike.title === 'string' && evtLike.title.trim())
      ? evtLike.title.trim().slice(0, TITLE_MAX_LEN)
      : 'Termin',
    note: (evtLike && typeof evtLike.note === 'string')
      ? evtLike.note.slice(0, NOTE_MAX_LEN)
      : '',
    startTs: NaN,
    endTs: NaN,
  };

  const card = el('div', 'mm-cal-card');

  const head = el('div', 'mm-cal-card-head');
  const cardIcon = el('span', 'mm-cal-card-icon');
  cardIcon.append(icon('calendar', 14));
  head.append(
    cardIcon,
    el('span', 'mm-cal-card-kicker', 'Termin'),
  );
  card.append(head);

  card.append(el('div', 'mm-cal-card-title', evt.title));

  if (Number.isFinite(evt.startTs)) {
    card.append(el('div', 'mm-cal-card-when', formatEventRange(evt.startTs, evt.endTs)));
  }
  if (evt.note) {
    card.append(el('div', 'mm-cal-card-note', evt.note));
  }

  return card;
}

/* ============================ Öffentliche API – Kalender-Panel ============================ */

export function renderCalendarPanel() {
  const overlay = el('div', 'mm-cal-overlay');
  const panel = el('div', 'mm-cal-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Kalender');
  panel.tabIndex = -1;

  // Header
  const header = el('div', 'mm-cal-panel-header');
  const title = el('h3', 'mm-cal-panel-title', 'Kalender');
  const closeBtn = el('button', 'mm-cal-close');
  closeBtn.append(icon('x', 16));
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Kalender schließen');
  header.append(title, closeBtn);
  panel.append(header);

  panel.append(el('div', 'mm-cal-sync-hint',
    'Termine syncen über dein Matrix-Konto zwischen deinen Geräten. '
    + 'Apple-, Google- oder Outlook-Kalender bindest du als Abo (ICS-Link) ein '
    + 'oder importierst sie als ICS-Datei – Export als .ics gibt es weiterhin.'));

  // Toolbar: Abo hinzufügen, ICS importieren, alle exportieren
  const toolbar = el('div', 'mm-cal-toolbar');

  const subBtn = el('button', 'mm-cal-export-btn');
  subBtn.type = 'button';
  const subIcon = el('span', 'mm-cal-export-icon');
  subIcon.append(icon('plus', 14));
  subBtn.append(subIcon, el('span', null, 'Kalender abonnieren'));
  subBtn.title = 'Apple/Google/Outlook-Kalender per ICS-Link einbinden';
  toolbar.append(subBtn);

  const importBtn = el('button', 'mm-cal-export-btn');
  importBtn.type = 'button';
  const importIcon = el('span', 'mm-cal-export-icon');
  importIcon.append(icon('external', 14));
  importBtn.append(importIcon, el('span', null, 'ICS importieren'));
  importBtn.title = 'Termine aus einer .ics-Datei übernehmen (synct dann über Matrix)';
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.ics,text/calendar';
  importInput.style.display = 'none';
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!file) return;
    file.text().then((text) => {
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        importFeedback.textContent = 'Keine gültige ICS-Datei.';
        return;
      }
      const res = importIcsText(text);
      importFeedback.textContent = res.total
        ? res.added + ' neu, ' + res.updated + ' aktualisiert.'
        : 'Keine (kommenden) Termine in der Datei gefunden.';
    }).catch(() => { importFeedback.textContent = 'Datei konnte nicht gelesen werden.'; });
  });
  toolbar.append(importBtn, importInput);

  const exportBtn = el('button', 'mm-cal-export-btn');
  exportBtn.type = 'button';
  const exportIcon = el('span', 'mm-cal-export-icon');
  exportIcon.append(icon('download', 14));
  exportBtn.append(exportIcon, el('span', null, 'Als ICS exportieren'));
  exportBtn.title = 'Alle kommenden eigenen Termine als .ics-Datei herunterladen';
  exportBtn.addEventListener('click', () => exportIcs(upcomingEvents()));
  toolbar.append(exportBtn);

  panel.append(toolbar);

  const importFeedback = el('div', 'mm-cal-feedback');
  panel.append(importFeedback);

  // Abo-Formular (eingeklappt, öffnet über den Button)
  const subForm = el('div', 'mm-cal-subform');
  subForm.style.display = 'none';
  const subUrl = document.createElement('input');
  subUrl.type = 'url';
  subUrl.className = 'mm-cal-input';
  subUrl.placeholder = 'webcal://… oder https://… (ICS-Link)';
  const subName = document.createElement('input');
  subName.type = 'text';
  subName.className = 'mm-cal-input';
  subName.placeholder = 'Name (optional, z. B. Privat)';
  subName.maxLength = 60;
  const subActions = el('div', 'mm-cal-subform-actions');
  const subAdd = el('button', 'mm-cal-export-btn primary', 'Abonnieren');
  subAdd.type = 'button';
  const subHint = el('div', 'mm-cal-subhint',
    'Apple: iCloud-Kalender „teilen“ → „Öffentlicher Kalender“ → Link kopieren. '
    + 'Google: Einstellungen → Kalender → „Privatadresse im iCal-Format“. '
    + 'Outlook: Kalender veröffentlichen → ICS-Link.');
  subAdd.addEventListener('click', () => {
    const res = addFeed(subUrl.value, subName.value);
    if (!res.ok) {
      importFeedback.textContent = res.reason;
      return;
    }
    subUrl.value = '';
    subName.value = '';
    subForm.style.display = 'none';
    importFeedback.textContent = 'Kalender abonniert – wird geladen …';
  });
  subUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); subAdd.click(); } });
  subActions.append(subAdd);
  subForm.append(subUrl, subName, subActions, subHint);
  panel.append(subForm);
  subBtn.addEventListener('click', () => {
    subForm.style.display = subForm.style.display === 'none' ? 'flex' : 'none';
    if (subForm.style.display !== 'none') subUrl.focus();
  });

  // Liste der Abos mit Status
  const feedsWrap = el('div', 'mm-cal-feeds');
  panel.append(feedsWrap);

  // Liste
  const listWrap = el('div', 'mm-cal-list');
  panel.append(listWrap);
  overlay.append(panel);

  let closed = false;

  function onKeydown(e) {
    if (!overlay.isConnected) {
      // Panel wurde extern entfernt – Listener aufräumen.
      document.removeEventListener('keydown', onKeydown, true);
      return;
    }
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
    if (openPanel && openPanel.overlay === overlay) openPanel = null;
  }

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown, true);

  openPanel = { overlay, listWrap, exportBtn, feedsWrap };
  rebuildPanelList(openPanel);
  refreshAllFeeds(false); // veraltete Abos beim Öffnen nachladen

  return overlay;
}

/** Abo-Liste (Name, Status, Aktualisieren/Entfernen) rendern. */
function rebuildFeedList(p) {
  if (!p.feedsWrap) return;
  p.feedsWrap.replaceChildren();
  for (const feed of state.feeds) {
    const rec = feedCache.get(feed.id);
    const row = el('div', 'mm-cal-feed-row');
    const info = el('div', 'mm-cal-feed-info');
    info.append(el('div', 'mm-cal-feed-name', feed.name));
    let status;
    if (rec && rec.error) status = rec.error;
    else if (rec && rec.fetchedAt) {
      status = rec.events.length + ' Termine · aktualisiert ' + fmtTime(new Date(rec.fetchedAt));
    } else status = 'Wird geladen …';
    const statusEl = el('div', 'mm-cal-feed-status', status);
    if (rec && rec.error) statusEl.classList.add('error');
    info.append(statusEl);
    row.append(info);

    const reload = el('button', 'mm-cal-feed-btn');
    reload.type = 'button';
    reload.title = 'Jetzt aktualisieren';
    reload.setAttribute('aria-label', 'Kalender aktualisieren: ' + feed.name);
    reload.append(icon('refresh', 14));
    reload.addEventListener('click', () => {
      feedCache.set(feed.id, Object.assign({ events: [], fetchedAt: 0 }, feedCache.get(feed.id), { error: null }));
      rebuildFeedList(p);
      refreshFeed(feed);
    });
    row.append(reload);

    const del = el('button', 'mm-cal-feed-btn danger');
    del.type = 'button';
    del.title = 'Abo entfernen';
    del.setAttribute('aria-label', 'Kalender-Abo entfernen: ' + feed.name);
    del.append(icon('trash', 14));
    del.addEventListener('click', () => removeFeed(feed.id));
    row.append(del);

    p.feedsWrap.append(row);
  }
}

/** Liste im offenen Panel (neu) aufbauen – eigene Termine + Abo-Termine. */
function rebuildPanelList(p) {
  const own = upcomingEvents();
  p.exportBtn.disabled = own.length === 0;
  rebuildFeedList(p);
  p.listWrap.replaceChildren();

  const merged = own.concat(upcomingFeedEvents())
    .sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs);

  if (!merged.length) {
    const empty = el('div', 'mm-cal-empty');
    const emptyIcon = el('div', 'mm-cal-empty-icon');
    emptyIcon.append(icon('calendar', 40));
    empty.append(
      emptyIcon,
      el('div', 'mm-cal-empty-title', 'Keine kommenden Termine'),
      el('div', 'mm-cal-empty-hint',
        'Plane einen Termin direkt aus einem Chat oder binde deinen Apple-/Google-/Outlook-Kalender oben als Abo ein.'),
    );
    p.listWrap.append(empty);
    return;
  }

  let currentKey = null;
  let currentGroup = null;
  for (const evt of merged) {
    const key = dayKey(evt.startTs);
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = el('div', 'mm-cal-day');
      currentGroup.append(el('div', 'mm-cal-day-label', dayGroupLabel(new Date(evt.startTs))));
      p.listWrap.append(currentGroup);
    }
    currentGroup.append(evt.feedId ? buildFeedEntry(evt) : buildPanelEntry(evt));
  }
}

/** Read-only-Eintrag eines abonnierten Termins (mit Quellen-Badge). */
function buildFeedEntry(evt) {
  const entry = el('div', 'mm-cal-entry mm-cal-entry-feed');

  const time = el('div', 'mm-cal-entry-time');
  const start = new Date(evt.startTs);
  const end = new Date(evt.endTs);
  if (evt.allDay) {
    time.append(el('div', 'mm-cal-entry-start', 'ganz-'));
    time.append(el('div', 'mm-cal-entry-end', 'tägig'));
  } else {
    time.append(el('div', 'mm-cal-entry-start', fmtTime(start)));
    const endLabel = isSameLocalDay(start, end)
      ? 'bis ' + fmtTime(end)
      : 'bis ' + fmtWeekdayShort(end) + ' ' + fmtTime(end);
    time.append(el('div', 'mm-cal-entry-end', endLabel));
  }
  entry.append(time);

  const main = el('div', 'mm-cal-entry-main');
  main.append(el('div', 'mm-cal-entry-title', evt.title));
  const src = el('div', 'mm-cal-entry-room');
  const srcIcon = el('span', 'mm-cal-entry-room-icon');
  srcIcon.append(icon('calendar', 11));
  src.append(srcIcon, el('span', null, evt.feedName || 'Abo'));
  main.append(src);
  if (evt.note) main.append(el('div', 'mm-cal-entry-note', evt.note));
  entry.append(main);

  return entry;
}

function buildPanelEntry(evt) {
  const entry = el('div', 'mm-cal-entry');

  // Zeitspanne
  const time = el('div', 'mm-cal-entry-time');
  const start = new Date(evt.startTs);
  const end = new Date(evt.endTs);
  time.append(el('div', 'mm-cal-entry-start', fmtTime(start)));
  const endLabel = isSameLocalDay(start, end)
    ? 'bis ' + fmtTime(end)
    : 'bis ' + fmtWeekdayShort(end) + ' ' + fmtTime(end);
  time.append(el('div', 'mm-cal-entry-end', endLabel));
  entry.append(time);

  // Titel, Raum, Notiz
  const main = el('div', 'mm-cal-entry-main');
  main.append(el('div', 'mm-cal-entry-title', evt.title));
  const room = el('div', 'mm-cal-entry-room');
  const roomIcon = el('span', 'mm-cal-entry-room-icon');
  roomIcon.append(icon('chat', 11));
  room.append(
    roomIcon,
    el('span', null, evt.roomName || evt.roomId || 'Unbekannter Raum'),
  );
  main.append(room);
  if (evt.note) main.append(el('div', 'mm-cal-entry-note', evt.note));
  entry.append(main);

  // Aktionen: Bearbeiten / Löschen / ICS
  const actions = el('div', 'mm-cal-entry-actions');

  const editBtn = el('button', 'mm-cal-action-btn', 'Bearbeiten');
  editBtn.type = 'button';
  editBtn.title = 'Termin bearbeiten';
  editBtn.addEventListener('click', () => openEventForm('edit', null, evt));

  const delBtn = el('button', 'mm-cal-action-btn mm-cal-danger', 'Löschen');
  delBtn.type = 'button';
  delBtn.title = 'Termin löschen';
  delBtn.addEventListener('click', () => {
    if (delBtn.dataset.confirm === '1') {
      deleteEvent(evt.id);
    } else {
      delBtn.dataset.confirm = '1';
      delBtn.textContent = 'Sicher?';
      setTimeout(() => {
        if (delBtn.isConnected) {
          delete delBtn.dataset.confirm;
          delBtn.textContent = 'Löschen';
        }
      }, 3000);
    }
  });

  const icsBtn = el('button', 'mm-cal-action-btn', 'ICS');
  icsBtn.type = 'button';
  icsBtn.title = 'Diesen Termin als .ics-Datei herunterladen';
  icsBtn.addEventListener('click', () => exportIcs([evt]));

  actions.append(editBtn, delBtn, icsBtn);
  entry.append(actions);

  return entry;
}

function refreshPanelIfOpen() {
  if (!openPanel) return;
  if (!openPanel.overlay.isConnected) {
    openPanel = null;
    return;
  }
  rebuildPanelList(openPanel);
}

/* ============================ Öffentliche API – ICS-Export ============================ */

const icsEncoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

/** TEXT-Escaping nach RFC 5545 (Backslash, Zeilenumbruch, Semikolon, Komma). */
function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Unix-ms -> ICS-UTC-Zeitstempel "YYYYMMDDTHHMMSSZ". */
function icsUtc(ts) {
  const d = new Date(ts);
  return d.getUTCFullYear()
    + pad2(d.getUTCMonth() + 1)
    + pad2(d.getUTCDate())
    + 'T' + pad2(d.getUTCHours())
    + pad2(d.getUTCMinutes())
    + pad2(d.getUTCSeconds())
    + 'Z';
}

/** UID-sichere Zeichen (RFC-freundlich, ohne Escaping-Bedarf). */
function icsUidSafe(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, '-');
}

/**
 * Content-Line auf max. 75 Oktette falten (Fortsetzungszeilen beginnen
 * mit einem Leerzeichen); es wird nie mitten in einem Codepoint geteilt.
 */
function foldIcsLine(line) {
  const limit = 73; // konservativ unter 75 Oktetten
  let out = '';
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = icsEncoder ? icsEncoder.encode(ch).length : ch.length;
    if (bytes + b > limit && cur) {
      out += (out ? '\r\n' : '') + cur;
      cur = ' ' + ch;
      bytes = 1 + b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  return out ? out + '\r\n' + cur : cur;
}

/** Dateiname-Slug aus dem Termin-Titel. */
function icsFileSlug(title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'termin';
}

export function exportIcs(events) {
  const list = Array.isArray(events) ? events : (events ? [events] : []);
  const clean = [];
  for (const raw of list) {
    const evt = coerceEvent(raw);
    if (evt) clean.push(evt);
  }
  if (!clean.length) return;

  const dtstamp = icsUtc(Date.now());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MatrixMess//Web Kalender//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const evt of clean) {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + icsUidSafe(evt.id) + '@matrixmess');
    lines.push('DTSTAMP:' + dtstamp);
    lines.push('DTSTART:' + icsUtc(evt.startTs));
    lines.push('DTEND:' + icsUtc(evt.endTs));
    lines.push('SUMMARY:' + escapeIcsText(evt.title));
    if (evt.note) lines.push('DESCRIPTION:' + escapeIcsText(evt.note));
    if (evt.roomName) lines.push('LOCATION:' + escapeIcsText(evt.roomName));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');

  const text = lines.map(foldIcsLine).join('\r\n') + '\r\n';
  const filename = clean.length === 1
    ? 'termin-' + icsFileSlug(clean[0].title) + '.ics'
    : 'matrixmess-termine.ics';

  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; // blob:-URL
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
