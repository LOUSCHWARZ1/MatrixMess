/* MatrixMess – Service Worker
 *
 * Zeigt Benachrichtigungen an (auch wenn der App-Tab im Hintergrund lebt oder
 * die iOS-PWA gerade nicht im Vordergrund ist) und öffnet beim Antippen den
 * passenden Chat. Empfängt zwei Wege:
 *   1) Web-Push (echtes Hintergrund-Push über den Push-Gateway des Servers).
 *   2) postMessage vom laufenden App-Tab (Vordergrund/aktiv).
 *
 * Bewusst KEIN Offline-Caching: Die App lädt weiterhin frisch vom Server;
 * der Service Worker dient nur den Benachrichtigungen.
 */

self.addEventListener('install', (event) => {
  // Sofort aktiv werden, nicht erst nach Reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/** Zeigt eine Benachrichtigung mit einheitlichem Aussehen. */
function showNotification(data) {
  const title = (data && data.title) || 'MatrixMess';
  const options = {
    body: (data && data.body) || '',
    tag: (data && data.tag) || 'mm',
    icon: (data && data.icon) || './icon.svg',
    badge: './icon.svg',
    data: { roomId: (data && data.roomId) || null, url: (data && data.url) || './' },
    renotify: !!(data && data.renotify),
    silent: !!(data && data.silent),
  };
  return self.registration.showNotification(title, options);
}

// Nachricht aus dem App-Tab (Vordergrund-Weg).
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'mm-notify') {
    event.waitUntil(showNotification(msg.payload || {}));
  }
});

// Echtes Web-Push aus dem Push-Gateway.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {
    try { data = { body: event.data ? event.data.text() : '' }; } catch (e2) { data = {}; }
  }
  // Matrix-/Sygnal-Push kann in { notification: {...} } verschachtelt sein.
  const n = data.notification || data;
  const roomId = n.room_id || n.roomId || null;
  const sender = n.sender_display_name || n.sender || '';
  const content = n.content || {};
  const bodyText = content.body || n.body || 'Neue Nachricht';
  const title = n.room_name || n.roomName || sender || 'MatrixMess';
  const body = sender && content.body ? (sender + ': ' + bodyText) : bodyText;
  // "counts.unread == 0" ist ein reines Badge-Update ohne sichtbaren Inhalt.
  const counts = n.counts || {};
  if (n.event_id === undefined && counts.unread === 0 && !content.body) {
    return; // nichts anzuzeigen
  }
  event.waitUntil(showNotification({ title, body, roomId, tag: 'mm-' + (roomId || 'push') }));
});

// Antippen: bestehenden Tab fokussieren und in den Raum springen, sonst öffnen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const roomId = event.notification.data && event.notification.data.roomId;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if (roomId) client.postMessage({ type: 'mm-open-room', roomId });
        return;
      }
    }
    // Kein offener Tab: App öffnen (Raum wird per URL-Hash übergeben).
    const url = roomId ? ('./#room=' + encodeURIComponent(roomId)) : './';
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
