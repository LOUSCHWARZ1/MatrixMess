/* MatrixMess Web – Benachrichtigungen (notify.js)
 *
 * Zwei Ebenen:
 *  1) ANZEIGE über den Service Worker (registration.showNotification), damit
 *     Benachrichtigungen auch aus einem Hintergrund-Tab / einer nicht ganz
 *     im Vordergrund liegenden iOS-PWA erscheinen. Fällt auf die klassische
 *     Notification-API zurück, wenn kein Service Worker verfügbar ist.
 *  2) SERVER-PUSH-REGELN (Matrix /pushrules): globaler Modus, Stichwörter und
 *     stummgeschaltete Räume werden serverseitig gesetzt. Diese Regeln gelten
 *     GERÄTEÜBERGREIFEND – also auch für die iPhone-Element-App, native Push
 *     und den Ungelesen-Zähler. Das ist der eigentliche Hebel dafür, dass
 *     Benachrichtigungen „auf allen Geräten" richtig gesteuert werden.
 *
 * Echtes Hintergrund-Push (App komplett geschlossen) setzt zusätzlich einen
 * Push-Gateway auf dem Homeserver voraus (z. B. Sygnal). Ist keiner vorhanden,
 * greifen die Regeln trotzdem für jeden push-fähigen Client und für die App,
 * solange sie (auch im Hintergrund) lebt.
 */

let deps = {
  api: null,        // (method, path, body) -> Promise
  getUserId: null,
};

let swReg = null;

export function initNotify(opts) {
  deps = Object.assign(deps, opts || {});
}

/* ========================================================================
 * Service Worker + Anzeige
 * ====================================================================== */

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    return swReg;
  } catch (e) {
    console.warn('[notify] Service Worker nicht registrierbar:', e);
    return null;
  }
}

/** Zeigt eine Benachrichtigung – bevorzugt über den Service Worker. */
export async function showNotification(payload) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const reg = swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
    if (reg && reg.active) {
      // Über den SW zeigen (funktioniert auch bei Hintergrund-Tab).
      reg.active.postMessage({ type: 'mm-notify', payload });
      return;
    }
    if (reg && reg.showNotification) {
      await reg.showNotification(payload.title || 'MatrixMess', {
        body: payload.body || '', tag: payload.tag || 'mm', icon: './icon.svg',
        data: { roomId: payload.roomId || null },
      });
      return;
    }
  } catch (e) { /* Fallback unten */ }
  // Klassische Notification (z. B. Desktop ohne aktiven SW).
  try {
    const n = new Notification(payload.title || 'MatrixMess', {
      body: payload.body || '', tag: payload.tag || 'mm', icon: './icon.svg',
    });
    if (payload.onClick) n.onclick = payload.onClick;
  } catch (e) { /* WebView ohne Notification */ }
}

export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); } catch (e) { return 'denied'; }
}

/* ========================================================================
 * Matrix-Push-Regeln (gerätübergreifend)
 * ====================================================================== */

function api(method, path, body) {
  if (typeof deps.api !== 'function') return Promise.reject(new Error('api fehlt'));
  return deps.api(method, path, body);
}

/** Aktuelle globale Regeln lesen (für die UI-Initialisierung). */
export async function getPushRules() {
  try { return await api('GET', '/_matrix/client/v3/pushrules/'); }
  catch (e) { return null; }
}

async function setRuleEnabled(kind, ruleId, enabled) {
  try {
    await api('PUT',
      `/_matrix/client/v3/pushrules/global/${kind}/${encodeURIComponent(ruleId)}/enabled`,
      { enabled: !!enabled });
  } catch (e) { /* Regel existiert evtl. nicht – ignorieren */ }
}

/**
 * Globaler Modus:
 *   'all'      – alles benachrichtigt (Standard-Regeln aktiv)
 *   'mentions' – nur Erwähnungen & Stichwörter (Nachrichten-Regeln aus)
 *   'off'      – nichts (Master-Regel aktiv = alles unterdrücken)
 */
export async function applyGlobalMode(mode) {
  if (mode === 'off') {
    await setRuleEnabled('override', '.m.rule.master', true);
    return;
  }
  await setRuleEnabled('override', '.m.rule.master', false);
  const messagesOn = mode !== 'mentions';
  // Diese Underride-Regeln erzeugen die „normale" Nachrichten-Benachrichtigung.
  await setRuleEnabled('underride', '.m.rule.message', messagesOn);
  await setRuleEnabled('underride', '.m.rule.encrypted', messagesOn);
  await setRuleEnabled('underride', '.m.rule.room_one_to_one', messagesOn);
  await setRuleEnabled('underride', '.m.rule.encrypted_room_one_to_one', messagesOn);
}

/** Einen Raum serverseitig stummschalten/aktivieren (gilt auf allen Geräten). */
export async function applyRoomMute(roomId, muted) {
  const path = `/_matrix/client/v3/pushrules/global/room/${encodeURIComponent(roomId)}`;
  try {
    if (muted) {
      await api('PUT', path, { actions: ['dont_notify'] });
    } else {
      await api('DELETE', path, null);
    }
  } catch (e) { /* nicht kritisch – lokale Stummschaltung greift zusätzlich */ }
}

/** Stichwort-Regeln setzen (content rules). Ersetzt vorhandene mm-Stichwörter. */
export async function applyKeywords(keywords) {
  const clean = (Array.isArray(keywords) ? keywords : [])
    .map((k) => String(k).trim()).filter(Boolean).slice(0, 20);
  // Bestehende mm-Stichwort-Regeln entfernen.
  try {
    const rules = await getPushRules();
    const content = rules && rules.global && rules.global.content;
    if (Array.isArray(content)) {
      for (const r of content) {
        if (r.rule_id && r.rule_id.indexOf('mm.kw.') === 0) {
          await api('DELETE',
            `/_matrix/client/v3/pushrules/global/content/${encodeURIComponent(r.rule_id)}`, null)
            .catch(() => {});
        }
      }
    }
  } catch (e) { /* */ }
  // Neue setzen.
  for (const kw of clean) {
    const id = 'mm.kw.' + kw.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    await api('PUT',
      `/_matrix/client/v3/pushrules/global/content/${encodeURIComponent(id)}`,
      { pattern: kw, actions: ['notify', { set_tweak: 'sound', value: 'default' }, { set_tweak: 'highlight' }] })
      .catch(() => {});
  }
}
