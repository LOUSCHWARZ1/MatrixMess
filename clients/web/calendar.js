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
};

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
  const out = { events: [] };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) return out;
  const seen = new Set();
  for (const rawEvt of raw.events) {
    const evt = coerceEvent(rawEvt);
    if (!evt || seen.has(evt.id)) continue;
    seen.add(evt.id);
    out.events.push(evt);
  }
  out.events.sort((a, b) => a.startTs - b.startTs || a.endTs - b.endTs);
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
  const closeBtn = el('button', 'mm-cal-close', '✕');
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
  head.append(
    el('span', 'mm-cal-card-icon', '📅'),
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
  const closeBtn = el('button', 'mm-cal-close', '✕');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Kalender schließen');
  header.append(title, closeBtn);
  panel.append(header);

  // Ehrlicher Hinweis: ICS-Export statt Kalender-Sync
  panel.append(el('div', 'mm-cal-sync-hint',
    'Termine syncen über dein Matrix-Konto zwischen deinen Geräten. '
    + 'Für Apple-, Google- oder Outlook-Kalender gibt es keinen automatischen '
    + 'Sync – exportiere Termine als ICS-Datei (.ics) und importiere sie dort manuell.'));

  // Toolbar: Alle als ICS exportieren
  const toolbar = el('div', 'mm-cal-toolbar');
  const exportBtn = el('button', 'mm-cal-export-btn');
  exportBtn.type = 'button';
  exportBtn.append(
    el('span', 'mm-cal-export-icon', '⬇'),
    el('span', null, 'Alle als ICS exportieren'),
  );
  exportBtn.title = 'Alle kommenden Termine als .ics-Datei herunterladen';
  exportBtn.addEventListener('click', () => exportIcs(upcomingEvents()));
  toolbar.append(exportBtn);
  panel.append(toolbar);

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

  openPanel = { overlay, listWrap, exportBtn };
  rebuildPanelList(openPanel);

  return overlay;
}

/** Liste im offenen Panel (neu) aufbauen. */
function rebuildPanelList(p) {
  const events = upcomingEvents();
  p.exportBtn.disabled = events.length === 0;
  p.listWrap.replaceChildren();

  if (!events.length) {
    const empty = el('div', 'mm-cal-empty');
    empty.append(
      el('div', 'mm-cal-empty-icon', '📅'),
      el('div', 'mm-cal-empty-title', 'Keine kommenden Termine'),
      el('div', 'mm-cal-empty-hint',
        'Plane einen Termin direkt aus einem Chat – er erscheint dann hier und als Karte im Chatverlauf.'),
    );
    p.listWrap.append(empty);
    return;
  }

  let currentKey = null;
  let currentGroup = null;
  for (const evt of events) {
    const key = dayKey(evt.startTs);
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = el('div', 'mm-cal-day');
      currentGroup.append(el('div', 'mm-cal-day-label', dayGroupLabel(new Date(evt.startTs))));
      p.listWrap.append(currentGroup);
    }
    currentGroup.append(buildPanelEntry(evt));
  }
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
  room.append(
    el('span', 'mm-cal-entry-room-icon', '💬'),
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
