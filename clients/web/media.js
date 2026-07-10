/**
 * MatrixMess Web – Medien-Modul: Inline-Playback (Audio/Video), Bild-Lightbox,
 * Sprachaufnahme und E2EE-Attachment-Entschlüsselung.
 *
 * Natives ES-Modul (ES2020+), keine Frameworks, kein Build-Step.
 * Sicherheit: DOM ausschließlich über document.createElement/createElementNS +
 * textContent/append – niemals innerHTML. In src/href landen ausschließlich
 * blob:-URLs, die von getBlobUrl() geliefert werden.
 *
 * EXPORT-API
 * ==========
 *
 * renderAudioPlayer({ getBlobUrl, durationMs, filename, isVoice }) -> HTMLElement
 *   Inline-Audio-Player (Voice-Player wie in der iOS-App).
 *   - getBlobUrl : () => Promise<string>  (Pflicht) Liefert eine blob:-URL des
 *                  Audios. Wird LAZY erst beim ersten Play aufgerufen; solange
 *                  läuft ein Spinner im Play-Button. Das Modul übernimmt die
 *                  Verantwortung für die gelieferte URL und ruft
 *                  URL.revokeObjectURL() auf, sobald der Player aus dem DOM
 *                  entfernt wird (oder ein Ladefehler auftrat).
 *   - durationMs : number (optional) Bekannte Dauer in ms für die Anzeige,
 *                  bevor das Blob geladen wurde.
 *   - filename   : string (optional) Dateiname; wird bei Nicht-Voice-Audios
 *                  über dem Player angezeigt.
 *   - isVoice    : boolean (optional) Stil "Sprachnachricht" (Mikrofon-Optik,
 *                  kein Dateiname).
 *   UI: Play/Pause-Button in Akzentfarbe, klick-/ziehbarer Fortschrittsbalken
 *   (Pointer-Events, auch Tastatur ←/→ = ±5 s), Zeitanzeige "m:ss / m:ss",
 *   Geschwindigkeits-Chip 1x → 1.5x → 2x (zyklisch, persistiert unter
 *   localStorage "mm.voiceSpeed" und gilt für alle Player). Es spielt immer
 *   nur EIN Medium gleichzeitig – andere Player werden pausiert.
 *
 * renderVideoPlayer({ getBlobUrl, filename, width, height }) -> HTMLElement
 *   Platzhalter-Karte mit Play-Overlay. Beim Klick wird das Blob geladen
 *   (Spinner) und die Karte durch <video controls autoplay playsinline>
 *   ersetzt. max-width 100 %, abgerundete Ecken; Seitenverhältnis wird aus
 *   width/height übernommen, sofern vorhanden. ObjectURL wird beim Entfernen
 *   aus dem DOM freigegeben.
 *
 * openImageLightbox({ getBlobUrl, filename }) -> void
 *   Vollbild-Overlay: Bild zentriert, Klick auf Hintergrund oder ESC (oder ✕)
 *   schließt, Download-Button (a[download] mit blob:-href), Klick auf das
 *   Bild zoomt auf Originalgröße (erneuter Klick zoomt zurück). ObjectURL
 *   wird beim Schließen freigegeben.
 *
 * createVoiceRecorder({ onFinish, onCancel }) -> { element, start, cancel }
 *   Sprachaufnahme per MediaRecorder.
 *   - onFinish(blob, durationMs, mimeType) : wird nach "Senden" mit dem
 *     fertigen Audio-Blob, der Aufnahmedauer in ms und dem tatsächlich
 *     verwendeten MIME-Type aufgerufen.
 *   - onCancel() : wird nach "Abbrechen" (Button oder cancel()) aufgerufen.
 *   Rückgabe:
 *   - element  : HTMLElement – rote Aufnahme-UI mit pulsierendem Punkt,
 *                laufendem Timer und den Buttons "Abbrechen"/"Senden".
 *                Der Aufrufer fügt es selbst ins DOM ein.
 *   - start()  : Promise<void> – fordert das Mikrofon an und startet die
 *                Aufnahme. Bevorzugt "audio/webm;codecs=opus", Fallback
 *                "audio/mp4" (Safari). Reject mit Error (deutsche message)
 *                bei fehlender Browser-Unterstützung oder Mikrofon-Fehlern.
 *   - cancel() : bricht die Aufnahme programmatisch ab (wie "Abbrechen").
 *
 * decryptAttachment(arrayBuffer, fileInfo) -> Promise<ArrayBuffer>
 *   Entschlüsselt ein Matrix-E2EE-Attachment (EncryptedFile v2).
 *   - fileInfo = { key: { k: <base64url, A256CTR-JWK> , ... },
 *                  iv: <unpadded base64>,
 *                  hashes: { sha256: <unpadded base64> } }
 *   Ablauf: SHA-256 des Ciphertexts wird gegen hashes.sha256 geprüft (wirft
 *   bei Abweichung), danach AES-CTR-Entschlüsselung per WebCrypto
 *   (counter = iv, length = 64). Base64/Base64url-Dekodierung ist selbst
 *   implementiert (atob mit Padding-/URL-Zeichen-Normalisierung).
 *
 * formatDuration(ms) -> string
 *   Formatiert Millisekunden als "m:ss" (z. B. 83000 -> "1:23").
 */

const LS_VOICE_SPEED = 'mm.voiceSpeed';
const SPEEDS = [1, 1.5, 2];

/* ========================================================================
 * DOM-Helfer (sicher: createElement + textContent, kein innerHTML)
 * ====================================================================== */

/**
 * Erzeugt ein Element mit Klasse und optionalem Textinhalt.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Erzeugt ein kleines Inline-SVG-Icon (fill: currentColor).
 * @param {string[]} paths - SVG-Pfaddaten (d-Attribute)
 * @returns {SVGSVGElement}
 */
function svgIcon(paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
  }
  return svg;
}

const ICON_PLAY = ['M8 5.14v13.72c0 .79.87 1.27 1.54.84l10.4-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z'];
const ICON_PAUSE = ['M7 5h3.4v14H7z', 'M13.6 5H17v14h-3.6z'];
const ICON_MIC = ['M12 14.5a3 3 0 0 0 3-3v-6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z', 'M17.8 11.5a.9.9 0 0 0-1.8 0 4 4 0 0 1-8 0 .9.9 0 0 0-1.8 0 5.8 5.8 0 0 0 4.9 5.72v1.98H9.4a.9.9 0 1 0 0 1.8h5.2a.9.9 0 1 0 0-1.8h-1.7v-1.98a5.8 5.8 0 0 0 4.9-5.72z'];
const ICON_DOWNLOAD = ['M12 3a1 1 0 0 1 1 1v8.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L11 12.6V4a1 1 0 0 1 1-1z', 'M5 18a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z'];
const ICON_CLOSE = ['M6.3 6.3a1 1 0 0 1 1.4 0L12 10.6l4.3-4.3a1 1 0 1 1 1.4 1.4L13.4 12l4.3 4.3a1 1 0 0 1-1.4 1.4L12 13.4l-4.3 4.3a1 1 0 0 1-1.4-1.4L10.6 12 6.3 7.7a1 1 0 0 1 0-1.4z'];

/** Kleiner CSS-Spinner. */
function makeSpinner() {
  const s = el('span', 'mm-spinner');
  s.setAttribute('role', 'status');
  s.setAttribute('aria-label', 'Lädt …');
  return s;
}

/* ========================================================================
 * Exklusives Playback: nur EIN Medium spielt gleichzeitig
 * ====================================================================== */

/** @type {null | (() => void)} */
let activeStopper = null;

/** Pausiert das aktuell spielende Medium (falls vorhanden) und merkt sich das neue. */
function claimPlayback(stopFn) {
  if (activeStopper && activeStopper !== stopFn) {
    try { activeStopper(); } catch (e) { /* ignorieren */ }
  }
  activeStopper = stopFn;
}

function releasePlayback(stopFn) {
  if (activeStopper === stopFn) activeStopper = null;
}

/* ========================================================================
 * Aufräumen: ObjectURLs freigeben, wenn Elemente aus dem DOM entfernt werden
 * ====================================================================== */

/** @type {Set<{ node: Element, fn: () => void }>} */
const cleanupRegistry = new Set();
let cleanupObserver = null;

/**
 * Führt fn aus, sobald node nicht mehr im DOM hängt.
 * (node muss beim Registrieren bereits verbunden sein – ist es beim
 * Lazy-Load nach dem ersten Play-Klick immer.)
 */
function registerRemovalCleanup(node, fn) {
  if (!node.isConnected) {
    // Nie eingefügt – nichts zu beobachten, sofort in einer Mikrotask prüfen.
    queueMicrotask(() => {
      if (!node.isConnected) { try { fn(); } catch (e) { /* */ } }
      else cleanupRegistry.add({ node, fn });
    });
    return;
  }
  cleanupRegistry.add({ node, fn });
  if (!cleanupObserver) {
    cleanupObserver = new MutationObserver((mutations) => {
      let removedSomething = false;
      for (const m of mutations) {
        if (m.removedNodes.length > 0) { removedSomething = true; break; }
      }
      if (!removedSomething) return;
      for (const entry of cleanupRegistry) {
        if (!entry.node.isConnected) {
          cleanupRegistry.delete(entry);
          try { entry.fn(); } catch (e) { /* */ }
        }
      }
      if (cleanupRegistry.size === 0 && cleanupObserver) {
        cleanupObserver.disconnect();
        cleanupObserver = null;
      }
    });
    cleanupObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}

/* ========================================================================
 * formatDuration
 * ====================================================================== */

/**
 * Formatiert Millisekunden als "m:ss".
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const totalSec = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ========================================================================
 * Geschwindigkeit (persistiert)
 * ====================================================================== */

function loadSpeed() {
  try {
    const v = parseFloat(localStorage.getItem(LS_VOICE_SPEED) || '');
    if (SPEEDS.includes(v)) return v;
  } catch (e) { /* localStorage evtl. blockiert */ }
  return 1;
}

function saveSpeed(v) {
  try { localStorage.setItem(LS_VOICE_SPEED, String(v)); } catch (e) { /* */ }
}

function speedLabel(v) {
  return `${v}x`;
}

/* ========================================================================
 * renderAudioPlayer
 * ====================================================================== */

/**
 * Erzeugt einen Inline-Audio-Player (siehe Modul-JSDoc).
 * @param {{ getBlobUrl: () => Promise<string>, durationMs?: number,
 *           filename?: string, isVoice?: boolean }} opts
 * @returns {HTMLElement}
 */
export function renderAudioPlayer({ getBlobUrl, durationMs, filename, isVoice } = {}) {
  if (typeof getBlobUrl !== 'function') {
    throw new Error('renderAudioPlayer: getBlobUrl (Funktion) ist erforderlich.');
  }

  const root = el('div', 'mm-audio' + (isVoice ? ' mm-audio--voice' : ''));

  if (filename && !isVoice) {
    root.appendChild(el('div', 'mm-audio-name', filename));
  }

  const row = el('div', 'mm-audio-row');
  root.appendChild(row);

  if (isVoice) {
    const micBadge = el('span', 'mm-audio-mic');
    micBadge.setAttribute('aria-hidden', 'true');
    micBadge.appendChild(svgIcon(ICON_MIC));
    row.appendChild(micBadge);
  }

  const playBtn = el('button', 'mm-audio-btn');
  playBtn.type = 'button';
  playBtn.setAttribute('aria-label', 'Abspielen');
  playBtn.appendChild(svgIcon(ICON_PLAY));
  row.appendChild(playBtn);

  const main = el('div', 'mm-audio-main');
  row.appendChild(main);

  const track = el('div', 'mm-audio-track');
  track.setAttribute('role', 'slider');
  track.setAttribute('tabindex', '0');
  track.setAttribute('aria-label', 'Wiedergabeposition');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', '0');
  const fill = el('div', 'mm-audio-fill');
  const knob = el('div', 'mm-audio-knob');
  track.append(fill, knob);
  main.appendChild(track);

  const row2 = el('div', 'mm-audio-meta');
  const timeLabel = el('span', 'mm-audio-time');
  const speedBtn = el('button', 'mm-audio-speed');
  speedBtn.type = 'button';
  speedBtn.setAttribute('aria-label', 'Wiedergabegeschwindigkeit ändern');
  row2.append(timeLabel, speedBtn);
  main.appendChild(row2);

  /* ----- Zustand ----- */
  /** @type {HTMLAudioElement | null} */
  let audio = null;
  /** @type {string | null} */
  let blobUrl = null;
  let loading = false;
  let dragging = false;
  let pendingSeekRatio = -1;
  let knownDurMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  let speed = loadSpeed();
  speedBtn.textContent = speedLabel(speed);

  const stopFn = () => { if (audio && !audio.paused) audio.pause(); };

  function durMs() {
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      return audio.duration * 1000;
    }
    return knownDurMs;
  }

  function posMs() {
    if (dragging || (!audio && pendingSeekRatio >= 0)) {
      const r = pendingSeekRatio >= 0 ? pendingSeekRatio : 0;
      return r * durMs();
    }
    return audio ? audio.currentTime * 1000 : 0;
  }

  function updateUI() {
    const d = durMs();
    const p = posMs();
    const ratio = d > 0 ? Math.min(1, Math.max(0, p / d)) : 0;
    const pct = ratio * 100;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    track.setAttribute('aria-valuenow', String(Math.round(pct)));
    timeLabel.textContent = `${formatDuration(p)} / ${formatDuration(d)}`;
  }

  function setIcon(playing) {
    playBtn.replaceChildren(svgIcon(playing ? ICON_PAUSE : ICON_PLAY));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Abspielen');
    playBtn.classList.toggle('mm-playing', playing);
  }

  function showError(msg) {
    timeLabel.textContent = msg;
    timeLabel.classList.add('mm-error-text');
  }

  function clearError() {
    timeLabel.classList.remove('mm-error-text');
  }

  function revoke() {
    if (blobUrl) {
      try { URL.revokeObjectURL(blobUrl); } catch (e) { /* */ }
      blobUrl = null;
    }
  }

  async function ensureLoadedAndPlay() {
    if (loading) return;
    loading = true;
    clearError();
    playBtn.replaceChildren(makeSpinner());
    playBtn.setAttribute('aria-label', 'Lädt …');
    try {
      blobUrl = await getBlobUrl();
      if (typeof blobUrl !== 'string' || !blobUrl.startsWith('blob:')) {
        revoke();
        throw new Error('Keine gültige blob:-URL erhalten.');
      }
      audio = document.createElement('audio');
      audio.preload = 'metadata';
      if ('preservesPitch' in audio) audio.preservesPitch = true;
      audio.src = blobUrl;
      audio.playbackRate = speed;

      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          knownDurMs = audio.duration * 1000;
        }
        if (pendingSeekRatio >= 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = pendingSeekRatio * audio.duration;
          pendingSeekRatio = -1;
        }
        updateUI();
      });
      audio.addEventListener('timeupdate', () => { if (!dragging) updateUI(); });
      audio.addEventListener('play', () => {
        claimPlayback(stopFn);
        setIcon(true);
      });
      audio.addEventListener('pause', () => {
        releasePlayback(stopFn);
        setIcon(false);
      });
      audio.addEventListener('ended', () => {
        releasePlayback(stopFn);
        setIcon(false);
        audio.currentTime = 0;
        updateUI();
      });
      audio.addEventListener('error', () => {
        releasePlayback(stopFn);
        setIcon(false);
        showError('Fehler beim Abspielen');
        try { audio.removeAttribute('src'); } catch (e) { /* */ }
        audio = null;
        revoke();
      });

      // Beim Entfernen aus dem DOM: pausieren + ObjectURL freigeben.
      registerRemovalCleanup(root, () => {
        if (audio) {
          try { audio.pause(); } catch (e) { /* */ }
          try { audio.removeAttribute('src'); audio.load(); } catch (e) { /* */ }
          audio = null;
        }
        releasePlayback(stopFn);
        revoke();
      });

      await audio.play();
    } catch (err) {
      setIcon(false);
      if (audio === null) {
        // Laden des Blobs schlug fehl
        showError('Laden fehlgeschlagen – erneut tippen');
        revoke();
      }
    } finally {
      loading = false;
      if (audio && audio.paused) setIcon(false);
    }
  }

  playBtn.addEventListener('click', () => {
    if (loading) return;
    if (!audio) {
      ensureLoadedAndPlay();
      return;
    }
    if (audio.paused) {
      audio.playbackRate = speed;
      audio.play().catch(() => showError('Fehler beim Abspielen'));
    } else {
      audio.pause();
    }
  });

  speedBtn.addEventListener('click', () => {
    const idx = SPEEDS.indexOf(speed);
    speed = SPEEDS[(idx + 1) % SPEEDS.length];
    saveSpeed(speed);
    speedBtn.textContent = speedLabel(speed);
    if (audio) audio.playbackRate = speed;
  });

  /* ----- Spulen (klicken/ziehen, Pointer-Events) ----- */

  function ratioFromEvent(ev) {
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
  }

  function previewRatio(r) {
    pendingSeekRatio = r;
    updateUI();
  }

  function commitRatio(r) {
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = r * audio.duration;
      pendingSeekRatio = -1;
    } else {
      pendingSeekRatio = r; // wird nach dem Laden angewendet
    }
    updateUI();
  }

  track.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    dragging = true;
    try { track.setPointerCapture(ev.pointerId); } catch (e) { /* */ }
    previewRatio(ratioFromEvent(ev));
  });
  track.addEventListener('pointermove', (ev) => {
    if (dragging) previewRatio(ratioFromEvent(ev));
  });
  track.addEventListener('pointerup', (ev) => {
    if (!dragging) return;
    dragging = false;
    commitRatio(ratioFromEvent(ev));
  });
  track.addEventListener('pointercancel', () => {
    dragging = false;
    pendingSeekRatio = audio ? -1 : pendingSeekRatio;
    updateUI();
  });
  track.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const d = durMs();
    if (d <= 0) return;
    const delta = ev.key === 'ArrowRight' ? 5000 : -5000;
    const target = Math.min(d, Math.max(0, posMs() + delta));
    commitRatio(target / d);
  });

  updateUI();
  return root;
}

/* ========================================================================
 * renderVideoPlayer
 * ====================================================================== */

/**
 * Erzeugt eine Video-Platzhalter-Karte mit Play-Overlay (siehe Modul-JSDoc).
 * @param {{ getBlobUrl: () => Promise<string>, filename?: string,
 *           width?: number, height?: number }} opts
 * @returns {HTMLElement}
 */
export function renderVideoPlayer({ getBlobUrl, filename, width, height } = {}) {
  if (typeof getBlobUrl !== 'function') {
    throw new Error('renderVideoPlayer: getBlobUrl (Funktion) ist erforderlich.');
  }

  const root = el('div', 'mm-video');
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  if (w && h) {
    root.style.aspectRatio = `${w} / ${h}`;
    root.style.width = `${Math.min(w, 480)}px`;
  }

  const overlay = el('button', 'mm-video-overlay');
  overlay.type = 'button';
  overlay.setAttribute('aria-label', filename ? `Video abspielen: ${filename}` : 'Video abspielen');
  const playBadge = el('span', 'mm-video-playbtn');
  playBadge.appendChild(svgIcon(ICON_PLAY));
  overlay.appendChild(playBadge);
  if (filename) overlay.appendChild(el('span', 'mm-video-name', filename));
  root.appendChild(overlay);

  let loading = false;

  overlay.addEventListener('click', async () => {
    if (loading) return;
    loading = true;
    playBadge.replaceChildren(makeSpinner());
    let blobUrl = null;
    try {
      blobUrl = await getBlobUrl();
      if (typeof blobUrl !== 'string' || !blobUrl.startsWith('blob:')) {
        throw new Error('Keine gültige blob:-URL erhalten.');
      }
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.setAttribute('playsinline', '');
      video.playsInline = true;
      video.src = blobUrl;

      const stopFn = () => { if (!video.paused) video.pause(); };
      video.addEventListener('play', () => claimPlayback(stopFn));
      video.addEventListener('pause', () => releasePlayback(stopFn));
      video.addEventListener('ended', () => releasePlayback(stopFn));
      video.addEventListener('error', () => {
        releasePlayback(stopFn);
        root.replaceChildren(el('div', 'mm-media-error', 'Video konnte nicht abgespielt werden.'));
      });

      registerRemovalCleanup(root, () => {
        try { video.pause(); } catch (e) { /* */ }
        try { video.removeAttribute('src'); video.load(); } catch (e) { /* */ }
        releasePlayback(stopFn);
        if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e) { /* */ } }
      });

      root.replaceChildren(video);
      video.play().catch(() => { /* Autoplay evtl. blockiert – Controls sind da */ });
    } catch (err) {
      if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e) { /* */ } }
      playBadge.replaceChildren(svgIcon(ICON_PLAY));
      let msg = overlay.querySelector('.mm-media-error');
      if (!msg) {
        msg = el('span', 'mm-media-error');
        overlay.appendChild(msg);
      }
      msg.textContent = 'Video konnte nicht geladen werden – erneut tippen.';
    } finally {
      loading = false;
    }
  });

  return root;
}

/* ========================================================================
 * openImageLightbox
 * ====================================================================== */

/**
 * Öffnet ein Vollbild-Overlay für ein Bild (siehe Modul-JSDoc).
 * @param {{ getBlobUrl: () => Promise<string>, filename?: string }} opts
 * @returns {void}
 */
export function openImageLightbox({ getBlobUrl, filename } = {}) {
  if (typeof getBlobUrl !== 'function') {
    throw new Error('openImageLightbox: getBlobUrl (Funktion) ist erforderlich.');
  }

  const overlay = el('div', 'mm-lightbox');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', filename ? `Bild: ${filename}` : 'Bild');

  const bar = el('div', 'mm-lightbox-bar');
  const closeBtn = el('button', 'mm-lightbox-btn');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Schließen');
  closeBtn.appendChild(svgIcon(ICON_CLOSE));
  bar.appendChild(closeBtn);
  overlay.appendChild(bar);

  const stage = el('div', 'mm-lightbox-stage');
  stage.appendChild(makeSpinner());
  overlay.appendChild(stage);

  if (filename) overlay.appendChild(el('div', 'mm-lightbox-caption', filename));

  let blobUrl = null;
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (e) { /* */ } blobUrl = null; }
  }

  function onKey(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (ev) => {
    // Klick auf den Hintergrund (nicht auf Bild/Buttons) schließt.
    if (ev.target === overlay || ev.target === stage) close();
  });
  document.addEventListener('keydown', onKey, true);

  document.body.appendChild(overlay);

  getBlobUrl().then((url) => {
    if (closed) {
      if (typeof url === 'string' && url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch (e) { /* */ }
      }
      return;
    }
    if (typeof url !== 'string' || !url.startsWith('blob:')) {
      stage.replaceChildren(el('div', 'mm-media-error', 'Bild konnte nicht geladen werden.'));
      return;
    }
    blobUrl = url;

    const img = document.createElement('img');
    img.className = 'mm-lightbox-img';
    img.alt = filename || 'Bild';
    img.draggable = false;
    img.src = blobUrl;
    img.addEventListener('click', (ev) => {
      ev.stopPropagation();
      overlay.classList.toggle('mm-zoomed');
    });
    stage.replaceChildren(img);

    // Download-Button erst anbieten, wenn das Blob da ist.
    const dl = document.createElement('a');
    dl.className = 'mm-lightbox-btn';
    dl.setAttribute('aria-label', 'Herunterladen');
    dl.href = blobUrl;
    dl.download = filename || 'bild';
    dl.appendChild(svgIcon(ICON_DOWNLOAD));
    bar.insertBefore(dl, closeBtn);
  }).catch(() => {
    if (!closed) {
      stage.replaceChildren(el('div', 'mm-media-error', 'Bild konnte nicht geladen werden.'));
    }
  });
}

/* ========================================================================
 * createVoiceRecorder
 * ====================================================================== */

/** Bevorzugte Aufnahme-Formate (Opus in WebM, Fallback MP4/AAC für Safari). */
const RECORDER_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

function germanMicError(err) {
  const name = err && err.name;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Mikrofonzugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'Kein Mikrofon gefunden.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Das Mikrofon ist belegt oder kann nicht gelesen werden.';
    case 'AbortError':
      return 'Der Mikrofonzugriff wurde abgebrochen.';
    default:
      return 'Aufnahme konnte nicht gestartet werden' +
        (err && err.message ? `: ${err.message}` : '.');
  }
}

/**
 * Erzeugt eine Sprachaufnahme-Steuerung (siehe Modul-JSDoc).
 * @param {{ onFinish?: (blob: Blob, durationMs: number, mimeType: string) => void,
 *           onCancel?: () => void }} opts
 * @returns {{ element: HTMLElement, start: () => Promise<void>, cancel: () => void }}
 */
export function createVoiceRecorder({ onFinish, onCancel } = {}) {
  const root = el('div', 'mm-recorder');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Sprachaufnahme');

  const dot = el('span', 'mm-rec-dot');
  dot.setAttribute('aria-hidden', 'true');
  const timeEl = el('span', 'mm-rec-time', '0:00');
  const hint = el('span', 'mm-rec-hint', 'Bereit …');
  const cancelBtn = el('button', 'mm-rec-cancel', 'Abbrechen');
  cancelBtn.type = 'button';
  const sendBtn = el('button', 'mm-rec-send', 'Senden');
  sendBtn.type = 'button';
  cancelBtn.disabled = true;
  sendBtn.disabled = true;
  root.append(dot, timeEl, hint, cancelBtn, sendBtn);

  /** 'idle' | 'starting' | 'recording' | 'stopping' | 'done' */
  let state = 'idle';
  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {MediaRecorder | null} */
  let recorder = null;
  /** @type {BlobPart[]} */
  let chunks = [];
  let mimeType = '';
  let startedAt = 0;
  let timerId = 0;
  /** 'finish' | 'cancel' */
  let stopMode = 'cancel';

  function stopTracks() {
    if (stream) {
      for (const t of stream.getTracks()) {
        try { t.stop(); } catch (e) { /* */ }
      }
      stream = null;
    }
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = 0; }
  }

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    for (const m of RECORDER_MIME_CANDIDATES) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch (e) { /* */ }
    }
    return '';
  }

  function handleStop() {
    stopTimer();
    stopTracks();
    const durationMs = startedAt ? Date.now() - startedAt : 0;
    const mode = stopMode;
    state = 'done';
    root.classList.remove('mm-recording');
    if (mode === 'finish') {
      const finalMime = (recorder && recorder.mimeType) || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type: finalMime });
      chunks = [];
      if (typeof onFinish === 'function') onFinish(blob, durationMs, finalMime);
    } else {
      chunks = [];
      if (typeof onCancel === 'function') onCancel();
    }
  }

  async function start() {
    if (state !== 'idle') {
      throw new Error('Die Aufnahme wurde bereits gestartet.');
    }
    state = 'starting';
    hint.textContent = 'Mikrofon wird angefordert …';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      state = 'idle';
      hint.textContent = 'Nicht verfügbar';
      throw new Error('Dieser Browser unterstützt keinen Mikrofonzugriff (getUserMedia fehlt).');
    }
    if (typeof MediaRecorder === 'undefined') {
      state = 'idle';
      hint.textContent = 'Nicht verfügbar';
      throw new Error('Dieser Browser unterstützt keine Audioaufnahme (MediaRecorder fehlt).');
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      state = 'idle';
      hint.textContent = 'Mikrofon-Fehler';
      throw new Error(germanMicError(err));
    }

    mimeType = pickMimeType();
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      try {
        recorder = new MediaRecorder(stream);
        mimeType = '';
      } catch (err2) {
        stopTracks();
        state = 'idle';
        hint.textContent = 'Nicht verfügbar';
        throw new Error('Audioaufnahme wird von diesem Browser nicht unterstützt.');
      }
    }

    chunks = [];
    recorder.addEventListener('dataavailable', (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    });
    recorder.addEventListener('stop', handleStop);
    recorder.addEventListener('error', () => {
      // Aufnahmefehler während des Laufs: wie Abbruch behandeln.
      stopMode = 'cancel';
      stopTimer();
      stopTracks();
      if (state === 'recording' || state === 'starting') {
        state = 'done';
        root.classList.remove('mm-recording');
        hint.textContent = 'Aufnahmefehler';
        if (typeof onCancel === 'function') onCancel();
      }
    });

    recorder.start();
    startedAt = Date.now();
    state = 'recording';
    root.classList.add('mm-recording');
    hint.textContent = 'Aufnahme läuft …';
    cancelBtn.disabled = false;
    sendBtn.disabled = false;
    timerId = setInterval(() => {
      timeEl.textContent = formatDuration(Date.now() - startedAt);
    }, 200);
  }

  function requestStop(mode) {
    if (state !== 'recording') return;
    state = 'stopping';
    stopMode = mode;
    cancelBtn.disabled = true;
    sendBtn.disabled = true;
    hint.textContent = mode === 'finish' ? 'Wird gesendet …' : 'Abgebrochen';
    try {
      recorder.stop();
    } catch (e) {
      handleStop();
    }
  }

  function cancel() {
    if (state === 'recording') {
      requestStop('cancel');
      return;
    }
    if (state === 'starting' || state === 'idle') {
      // Noch keine laufende Aufnahme: nur aufräumen und Abbruch melden.
      stopTracks();
      stopTimer();
      state = 'done';
      root.classList.remove('mm-recording');
      if (typeof onCancel === 'function') onCancel();
    }
  }

  cancelBtn.addEventListener('click', () => requestStop('cancel'));
  sendBtn.addEventListener('click', () => requestStop('finish'));

  registerRemovalCleanup(root, () => {
    // Element wurde entfernt, ohne dass gesendet/abgebrochen wurde: Mikro freigeben.
    if (state === 'recording' || state === 'starting') {
      stopMode = 'cancel';
      try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch (e) { /* */ }
      stopTimer();
      stopTracks();
      state = 'done';
    }
  });

  return { element: root, start, cancel };
}

/* ========================================================================
 * decryptAttachment (Matrix EncryptedFile v2)
 * ====================================================================== */

/**
 * Dekodiert Base64 (auch base64url, auch ohne Padding) zu Bytes.
 * @param {string} input
 * @returns {Uint8Array}
 */
function base64ToBytes(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Ungültige Base64-Daten im verschlüsselten Anhang.');
  }
  // URL-sichere Zeichen normalisieren, Whitespace entfernen, Padding ergänzen.
  let s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  let bin;
  try {
    bin = atob(s);
  } catch (e) {
    throw new Error('Ungültige Base64-Daten im verschlüsselten Anhang.');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Byteweiser Vergleich zweier Uint8Arrays (ohne frühen Abbruch). */
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Entschlüsselt ein Matrix-E2EE-Attachment (EncryptedFile v2), siehe Modul-JSDoc.
 * @param {ArrayBuffer} arrayBuffer - Ciphertext
 * @param {{ key: { k: string }, iv: string, hashes: { sha256: string } }} fileInfo
 * @returns {Promise<ArrayBuffer>} Klartext
 */
export async function decryptAttachment(arrayBuffer, fileInfo) {
  if (!(arrayBuffer instanceof ArrayBuffer) && !ArrayBuffer.isView(arrayBuffer)) {
    throw new Error('decryptAttachment: arrayBuffer (ArrayBuffer) ist erforderlich.');
  }
  if (!fileInfo || typeof fileInfo !== 'object' ||
      !fileInfo.key || typeof fileInfo.key.k !== 'string' ||
      typeof fileInfo.iv !== 'string' ||
      !fileInfo.hashes || typeof fileInfo.hashes.sha256 !== 'string') {
    throw new Error('Ungültige Verschlüsselungs-Metadaten für den Anhang (key/iv/hashes fehlen).');
  }
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error('WebCrypto ist in diesem Kontext nicht verfügbar (HTTPS erforderlich).');
  }

  const cipherBytes = arrayBuffer instanceof ArrayBuffer
    ? arrayBuffer
    : arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength);

  // JWK "k" ist base64url (unpadded); iv/hash sind unpadded Standard-Base64.
  const keyBytes = base64ToBytes(fileInfo.key.k);
  if (keyBytes.length !== 32) {
    throw new Error('Ungültiger Anhangs-Schlüssel (A256CTR erwartet 32 Byte).');
  }
  const iv = base64ToBytes(fileInfo.iv);
  if (iv.length !== 16) {
    throw new Error('Ungültiger IV im verschlüsselten Anhang (16 Byte erwartet).');
  }
  const expectedHash = base64ToBytes(fileInfo.hashes.sha256);

  // 1) Integrität: SHA-256 des Ciphertexts prüfen.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', cipherBytes));
  if (!bytesEqual(digest, expectedHash)) {
    throw new Error('Prüfsumme des verschlüsselten Anhangs stimmt nicht überein – Datei wird verworfen.');
  }

  // 2) AES-256-CTR entschlüsseln (counter = iv, 64 Zähler-Bits).
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt']
  );
  return crypto.subtle.decrypt(
    { name: 'AES-CTR', counter: iv, length: 64 },
    key,
    cipherBytes
  );
}
