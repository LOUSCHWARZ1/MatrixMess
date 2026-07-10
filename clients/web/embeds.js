/**
 * MatrixMess Web – Link-Embed-Modul (embeds.js)
 *
 * Rendert Link-Vorschauen und Inline-Player (YouTube, TikTok, Instagram)
 * sowie generische Link-Karten – wie in der iOS-App. Vanilla-JS als
 * natives ES-Modul (ES2020+), keine Frameworks, kein Build-Step.
 *
 * SICHERHEIT:
 *  - DOM wird ausschließlich per document.createElement + textContent/append
 *    aufgebaut (NIE innerHTML/outerHTML/insertAdjacentHTML mit dyn. Daten).
 *  - In src/href landen nur geprüfte http(s)-URLs bzw. blob:-URLs
 *    (YouTube-Thumbnail wird per fetch geladen und als Blob eingebettet,
 *    da die CSP der App nur connect-src https: erlaubt, aber kein direktes
 *    img-src auf fremde Hosts).
 *  - Iframes werden IMMER lazy erzeugt, d. h. erst nach einem Nutzer-Klick,
 *    mit loading="lazy", referrerpolicy="no-referrer" und sandbox.
 *
 * HINWEIS FÜR DEN INTEGRATOR (CSP):
 *  Die Content-Security-Policy muss um genau diese frame-src-Hosts
 *  erweitert werden, damit die Player laufen:
 *    frame-src https://www.youtube-nocookie.com https://www.tiktok.com
 *              https://www.instagram.com
 *
 * PERSISTENZ:
 *  - localStorage "mm.embedTitleCache": kleiner Cache für per oEmbed
 *    geladene YouTube-Titel (max. 80 Einträge, Fehler werden toleriert).
 *
 * ======================= EXPORT-API =======================
 *
 * extractFirstUrl(text) -> string|null
 *   Findet die erste http(s)-URL in einem Freitext. Abschließende
 *   Satzzeichen (".", ",", ")", "!" …) werden abgeschnitten, unbalancierte
 *   schließende Klammern entfernt. Rückgabe ist die normalisierte URL
 *   (new URL(...).href) oder null, wenn keine gültige http/https-URL
 *   enthalten ist.
 *
 * renderLinkEmbed(url) -> HTMLElement|null
 *   Baut für eine URL eine Embed-Karte (div.mm-embed …) und gibt sie
 *   zurück; null bei ungültigen bzw. Nicht-http(s)-URLs.
 *   Verhalten je Anbieter:
 *    - YouTube (youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…):
 *      Karte mit Thumbnail (fetch https://i.ytimg.com/vi/<id>/hqdefault.jpg
 *      -> blob -> img.src) und Titel via oEmbed
 *      (https://www.youtube.com/oembed?…&format=json, Fehler toleriert).
 *      Play-Overlay; Klick ersetzt das Thumbnail durch ein 16:9-Iframe
 *      https://www.youtube-nocookie.com/embed/<id>?autoplay=1
 *      (allow="autoplay; encrypted-media; picture-in-picture",
 *      allowfullscreen, sandbox="allow-scripts allow-same-origin
 *      allow-presentation").
 *    - TikTok (tiktok.com/@user/video/<id>): Branding-Karte; Klick lädt
 *      https://www.tiktok.com/embed/v2/<id> (Hochformat, max-height 580px).
 *      Kurzlinks ohne Video-ID (vm.tiktok.com, vt.tiktok.com,
 *      tiktok.com/t/…): nur Karte mit "Auf TikTok öffnen" (extern).
 *    - Instagram (instagram.com/p/<code>/, /reel/<code>/, /reels/, /tv/):
 *      Branding-Karte; Klick lädt
 *      https://www.instagram.com/<p|reel|tv>/<code>/embed/ (Hochformat).
 *    - Alle Anbieter-Karten enthalten zusätzlich einen kleinen
 *      "Extern öffnen"-Link (target="_blank" rel="noopener noreferrer").
 *    - Generische URLs: kompakte Karte mit Favicon-Platzhalter (Initiale
 *      der Domain im Akzentkreis), Domain fett, gekürztem Pfad; Klick
 *      öffnet extern. Es findet KEIN fetch der Zielseite statt (CORS).
 *
 * Benötigt embeds.css (Klassenpräfix "mm-embed").
 */

'use strict';

/* ============================ Konstanten ============================ */

const LS_TITLE_CACHE = 'mm.embedTitleCache';
const TITLE_CACHE_MAX = 80;
const FETCH_TIMEOUT_MS = 8000;

const YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
]);
const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']);
const TIKTOK_SHORT_HOSTS = new Set(['vm.tiktok.com', 'vt.tiktok.com']);
const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);

const RE_YT_ID = /^[A-Za-z0-9_-]{10,12}$/;
const RE_TIKTOK_ID = /^\d{5,25}$/;
const RE_IG_CODE = /^[A-Za-z0-9_-]{5,30}$/;

/* ============================ Export-API ============================ */

/**
 * Findet die erste http(s)-URL in einem Freitext.
 * @param {string} text
 * @returns {string|null}
 */
export function extractFirstUrl(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const m = text.match(/https?:\/\/[^\s<>"'`“”‘’]+/i);
  if (!m) return null;
  let raw = m[0];

  // Abschließende Satzzeichen / unbalancierte Klammern abschneiden.
  for (;;) {
    const last = raw.charAt(raw.length - 1);
    if ('.,;:!?…»«'.includes(last) || last === ']' || last === '}') {
      raw = raw.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const opens = (raw.match(/\(/g) || []).length;
      const closes = (raw.match(/\)/g) || []).length;
      if (closes > opens) {
        raw = raw.slice(0, -1);
        continue;
      }
    }
    break;
  }

  const parsed = safeParseHttpUrl(raw);
  return parsed ? parsed.href : null;
}

/**
 * Baut eine Embed-Karte für eine URL.
 * @param {string} url
 * @returns {HTMLElement|null}
 */
export function renderLinkEmbed(url) {
  const u = safeParseHttpUrl(url);
  if (!u) return null;

  const yt = parseYouTube(u);
  if (yt) return buildYouTubeCard(yt, u);

  const tt = parseTikTok(u);
  if (tt) return buildTikTokCard(tt, u);

  const ig = parseInstagram(u);
  if (ig) return buildInstagramCard(ig, u);

  return buildGenericCard(u);
}

/* ========================= URL-Erkennung ========================= */

/**
 * @param {string} url
 * @returns {URL|null} nur http:/https:, sonst null
 */
function safeParseHttpUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u;
}

/**
 * @param {URL} u
 * @returns {{ id: string }|null}
 */
function parseYouTube(u) {
  const host = u.hostname.toLowerCase();
  let id = null;

  if (host === 'youtu.be') {
    id = u.pathname.split('/').filter(Boolean)[0] || null;
  } else if (YT_HOSTS.has(host)) {
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.pathname === '/watch' || u.pathname === '/watch/') {
      id = u.searchParams.get('v');
    } else if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live')) {
      id = parts[1];
    }
  }

  if (id && RE_YT_ID.test(id)) return { id };
  return null;
}

/**
 * @param {URL} u
 * @returns {{ id: string|null, short: boolean }|null}
 */
function parseTikTok(u) {
  const host = u.hostname.toLowerCase();

  if (TIKTOK_SHORT_HOSTS.has(host)) {
    return { id: null, short: true };
  }
  if (!TIKTOK_HOSTS.has(host)) return null;

  const parts = u.pathname.split('/').filter(Boolean);

  // tiktok.com/t/<code> -> Kurzlink ohne aufgelöste Video-ID
  if (parts[0] === 't') return { id: null, short: true };

  // tiktok.com/@user/video/<id>
  const vi = parts.indexOf('video');
  if (vi > 0 && parts[vi - 1].startsWith('@') && parts[vi + 1] && RE_TIKTOK_ID.test(parts[vi + 1])) {
    return { id: parts[vi + 1], short: false };
  }
  return null;
}

/**
 * @param {URL} u
 * @returns {{ kind: 'p'|'reel'|'tv', code: string }|null}
 */
function parseInstagram(u) {
  if (!IG_HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  let kind = parts[0];
  if (kind === 'reels') kind = 'reel';
  if (kind !== 'p' && kind !== 'reel' && kind !== 'tv') return null;

  const code = parts[1];
  if (!RE_IG_CODE.test(code)) return null;
  return { kind, code };
}

/* ========================== DOM-Helfer ========================== */

/**
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

/**
 * Kleiner externer Link ("Extern öffnen").
 * @param {string} href bereits validierte http(s)-URL
 * @param {string} [label]
 * @returns {HTMLAnchorElement}
 */
function externalLink(href, label) {
  const a = el('a', 'mm-embed-external', label || 'Extern öffnen ↗');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/**
 * Provider-Iframe – wird IMMER erst nach Nutzer-Klick erzeugt.
 * @param {string} src bereits validierte https-URL auf den Anbieter-Host
 * @param {string} title
 * @returns {HTMLIFrameElement}
 */
function createProviderIframe(src, title) {
  const f = document.createElement('iframe');
  f.src = src;
  f.title = title;
  f.loading = 'lazy';
  f.referrerPolicy = 'no-referrer';
  f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
  f.setAttribute('allowfullscreen', '');
  return f;
}

/**
 * Info-Zeile unterhalb des Medienbereichs (Badge + "Extern öffnen" + Titel).
 * @param {string} providerClass z. B. 'mm-badge-youtube'
 * @param {string} providerName
 * @param {string} href
 * @param {string|null} titleText null = keine Titelzeile
 * @returns {{ info: HTMLElement, titleEl: HTMLElement|null }}
 */
function buildInfoBar(providerClass, providerName, href, titleText) {
  const info = el('div', 'mm-embed-info');
  const row = el('div', 'mm-embed-info-row');
  row.append(
    el('span', 'mm-embed-badge ' + providerClass, providerName),
    externalLink(href),
  );
  info.append(row);

  let titleEl = null;
  if (titleText !== null) {
    titleEl = el('div', 'mm-embed-title', titleText);
    info.append(titleEl);
  }
  return { info, titleEl };
}

/** Play-Overlay (Kreis mit CSS-Dreieck). */
function playOverlay() {
  const play = el('span', 'mm-embed-play');
  play.setAttribute('aria-hidden', 'true');
  play.append(el('span', 'mm-embed-play-tri'));
  return play;
}

/* ========================== Titel-Cache ========================== */

/**
 * @param {string} key
 * @returns {string|null}
 */
function titleCacheGet(key) {
  try {
    const raw = localStorage.getItem(LS_TITLE_CACHE);
    if (!raw) return null;
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return null;
    for (const e of entries) {
      if (Array.isArray(e) && e[0] === key && typeof e[1] === 'string') return e[1];
    }
  } catch {
    /* localStorage/JSON-Fehler tolerieren */
  }
  return null;
}

/**
 * @param {string} key
 * @param {string} title
 */
function titleCacheSet(key, title) {
  try {
    const raw = localStorage.getItem(LS_TITLE_CACHE);
    let entries = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) entries = parsed;
    }
    entries = entries.filter((e) => Array.isArray(e) && e[0] !== key);
    entries.push([key, title]);
    while (entries.length > TITLE_CACHE_MAX) entries.shift();
    localStorage.setItem(LS_TITLE_CACHE, JSON.stringify(entries));
  } catch {
    /* Quota/Privacy-Fehler tolerieren */
  }
}

/* ============================ YouTube ============================ */

/**
 * YouTube-Titel per oEmbed laden (Fehler -> null).
 * @param {string} watchUrl
 * @returns {Promise<string|null>}
 */
async function fetchYouTubeTitle(watchUrl) {
  const cached = titleCacheGet(watchUrl);
  if (cached) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      'https://www.youtube.com/oembed?url=' + encodeURIComponent(watchUrl) + '&format=json',
      { signal: ctrl.signal },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const title = data && typeof data.title === 'string' ? data.title : null;
    if (title) titleCacheSet(watchUrl, title);
    return title;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Thumbnail per fetch -> blob -> img.src laden (CSP: nur connect-src https:,
 * kein direktes img-src auf fremde Hosts). Fehler werden toleriert.
 * @param {string} videoId
 * @param {HTMLElement} target
 */
async function loadYouTubeThumb(videoId, target) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg',
      { signal: ctrl.signal },
    );
    if (!res.ok) return;
    const blob = await res.blob();
    if (!blob || !blob.type.startsWith('image/')) return;

    const objUrl = URL.createObjectURL(blob);
    const img = el('img', 'mm-embed-thumb-img');
    img.alt = '';
    img.decoding = 'async';
    const revoke = () => URL.revokeObjectURL(objUrl);
    img.addEventListener('load', revoke, { once: true });
    img.addEventListener('error', revoke, { once: true });
    img.src = objUrl; // ausschließlich blob:-URL
    target.prepend(img);
  } catch {
    /* Netzwerkfehler tolerieren – Platzhalter bleibt sichtbar */
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ id: string }} yt
 * @param {URL} u Original-URL
 * @returns {HTMLElement}
 */
function buildYouTubeCard(yt, u) {
  const card = el('div', 'mm-embed mm-embed-card mm-embed-youtube');

  const media = el('div', 'mm-embed-media mm-embed-media-169');
  const poster = el('button', 'mm-embed-poster mm-poster-youtube');
  poster.type = 'button';
  poster.setAttribute('aria-label', 'YouTube-Video abspielen');
  poster.append(playOverlay());
  media.append(poster);

  const canonical = 'https://www.youtube.com/watch?v=' + yt.id;
  const { info, titleEl } = buildInfoBar('mm-badge-youtube', 'YouTube', u.href, 'YouTube-Video');

  poster.addEventListener('click', () => {
    const wrap = el('div', 'mm-embed-frame mm-embed-frame-169');
    wrap.append(createProviderIframe(
      'https://www.youtube-nocookie.com/embed/' + yt.id + '?autoplay=1',
      'YouTube-Video',
    ));
    // Für YouTube zusätzlich Autoplay/PiP erlauben:
    wrap.firstChild.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    media.replaceChildren(wrap);
    card.classList.add('mm-embed-playing');
  }, { once: true });

  card.append(media, info);

  // Asynchron (Fehler toleriert): Thumbnail + Titel nachladen.
  loadYouTubeThumb(yt.id, poster);
  fetchYouTubeTitle(canonical).then((title) => {
    if (title && titleEl) titleEl.textContent = title;
  });

  return card;
}

/* ============================ TikTok ============================ */

/**
 * @param {{ id: string|null, short: boolean }} tt
 * @param {URL} u Original-URL
 * @returns {HTMLElement}
 */
function buildTikTokCard(tt, u) {
  if (!tt.id) {
    // Kurzlink ohne auflösbare Video-ID: kompakte Karte, nur extern öffnen.
    return buildProviderLinkCard('mm-embed-tiktok', 'mm-badge-tiktok', 'TikTok',
      'Auf TikTok öffnen', u);
  }

  const card = el('div', 'mm-embed mm-embed-card mm-embed-tiktok');

  const media = el('div', 'mm-embed-media mm-embed-media-portrait');
  const poster = el('button', 'mm-embed-poster mm-poster-tiktok');
  poster.type = 'button';
  poster.setAttribute('aria-label', 'TikTok-Video abspielen');
  poster.append(
    el('span', 'mm-embed-brandmark', '♪'),
    el('span', 'mm-embed-brandname', 'TikTok'),
    el('span', 'mm-embed-hint', 'Zum Abspielen tippen'),
    playOverlay(),
  );
  media.append(poster);

  const { info } = buildInfoBar('mm-badge-tiktok', 'TikTok', u.href, null);

  poster.addEventListener('click', () => {
    const wrap = el('div', 'mm-embed-frame mm-embed-frame-portrait');
    wrap.append(createProviderIframe(
      'https://www.tiktok.com/embed/v2/' + tt.id,
      'TikTok-Video',
    ));
    media.replaceChildren(wrap);
    card.classList.add('mm-embed-playing');
  }, { once: true });

  card.append(media, info);
  return card;
}

/* =========================== Instagram =========================== */

/**
 * @param {{ kind: 'p'|'reel'|'tv', code: string }} ig
 * @param {URL} u Original-URL
 * @returns {HTMLElement}
 */
function buildInstagramCard(ig, u) {
  const card = el('div', 'mm-embed mm-embed-card mm-embed-instagram');

  const media = el('div', 'mm-embed-media mm-embed-media-portrait');
  const poster = el('button', 'mm-embed-poster mm-poster-instagram');
  poster.type = 'button';
  poster.setAttribute('aria-label', 'Instagram-Beitrag laden');
  poster.append(
    el('span', 'mm-embed-brandmark', '◎'),
    el('span', 'mm-embed-brandname', 'Instagram'),
    el('span', 'mm-embed-hint', ig.kind === 'reel' ? 'Reel laden' : 'Beitrag laden'),
    playOverlay(),
  );
  media.append(poster);

  const { info } = buildInfoBar('mm-badge-instagram', 'Instagram', u.href, null);

  poster.addEventListener('click', () => {
    const wrap = el('div', 'mm-embed-frame mm-embed-frame-portrait');
    wrap.append(createProviderIframe(
      'https://www.instagram.com/' + ig.kind + '/' + ig.code + '/embed/',
      'Instagram-Beitrag',
    ));
    media.replaceChildren(wrap);
    card.classList.add('mm-embed-playing');
  }, { once: true });

  card.append(media, info);
  return card;
}

/* ================== Anbieter-Karte ohne Player ================== */

/**
 * Kompakte Branding-Karte, die nur extern öffnet (z. B. TikTok-Kurzlink).
 * @param {string} cardClass
 * @param {string} badgeClass
 * @param {string} providerName
 * @param {string} label
 * @param {URL} u
 * @returns {HTMLElement}
 */
function buildProviderLinkCard(cardClass, badgeClass, providerName, label, u) {
  const card = el('div', 'mm-embed mm-embed-linkcard ' + cardClass);
  const a = el('a', 'mm-embed-linkcard-a');
  a.href = u.href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.append(
    el('span', 'mm-embed-badge ' + badgeClass, providerName),
    el('span', 'mm-embed-linkcard-label', label + ' ↗'),
  );
  card.append(a);
  return card;
}

/* ======================= Generische Karte ======================= */

/**
 * @param {URL} u
 * @returns {HTMLElement}
 */
function buildGenericCard(u) {
  const card = el('div', 'mm-embed mm-embed-generic');

  const a = el('a', 'mm-embed-generic-a');
  a.href = u.href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = u.href;

  const domain = u.hostname.replace(/^www\./i, '');
  const initial = (domain.charAt(0) || '?').toUpperCase();

  // Favicon-Platzhalter: Initiale der Domain im Akzentkreis
  // (bewusst KEIN fetch der Zielseite / des Favicons – CORS).
  const fav = el('span', 'mm-embed-favicon', initial);
  fav.setAttribute('aria-hidden', 'true');

  const textWrap = el('span', 'mm-embed-generic-text');
  textWrap.append(
    el('span', 'mm-embed-domain', domain),
    el('span', 'mm-embed-path', shortenPath(u)),
  );

  a.append(fav, textWrap, el('span', 'mm-embed-generic-arrow', '↗'));
  card.append(a);
  return card;
}

/**
 * Pfad + Query kompakt kürzen (max. ~42 Zeichen).
 * @param {URL} u
 * @returns {string}
 */
function shortenPath(u) {
  let p = u.pathname + u.search;
  if (p === '/' || p === '') return u.protocol.replace(':', '') + '://' + u.hostname.replace(/^www\./i, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    /* fehlerhafte %-Sequenzen: roh anzeigen */
  }
  if (p.length > 42) p = p.slice(0, 41) + '…';
  return p;
}
