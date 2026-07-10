/* MatrixMess Web – Raum-Info-Panel (rechte Seitenleiste)
 *
 * Zeigt Info, Mitglieder, geteilte Medien, Dateien und Links eines Raums.
 * Vanilla JS, kein innerHTML mit dynamischen Daten (nur createElement/textContent).
 *
 * Export-API:
 *   initRoomInfo(deps) – einmalig verdrahten. deps = {
 *     icon(name,size)->SVGElement,
 *     el(tag,cls,text)->HTMLElement,
 *     getRoom(roomId)->room,                       // room mit .members Map, .events []
 *     roomDisplayName(room)->string,
 *     memberName(room,userId)->string,
 *     roomAvatarMxc(room)->string|null,
 *     setAvatar(node,key,name,mxc),
 *     avatarColor(key)->string,
 *     getJoinedMembers(roomId)->Promise<string[]>,
 *     getAttachmentBlob(content)->Promise<Blob>,   // lädt/entschlüsselt Anhang
 *     openImageLightbox({getBlobUrl,filename}),
 *     extractFirstUrl(text)->string|null,
 *     formatBytes(n)->string,
 *   }
 *   openRoomInfo(roomId)   – Panel für einen Raum öffnen
 *   closeRoomInfo()        – Panel schließen
 *   isRoomInfoOpen()->bool
 *   refreshRoomInfo(roomId) – neu rendern, wenn dieser Raum offen ist (z. B. nach Sync)
 */

let D = null;         // Dependencies
let overlayEl = null; // Panel-Overlay
let panelEl = null;
let bodyEl = null;
let titleEl = null;
let activeRoomId = null;
let activeTab = 'info';

const TABS = [
  { id: 'info', label: 'Info', icon: 'user' },
  { id: 'members', label: 'Mitglieder', icon: 'users' },
  { id: 'media', label: 'Medien', icon: 'image' },
  { id: 'files', label: 'Dateien', icon: 'file' },
  { id: 'links', label: 'Links', icon: 'globe' },
];

export function initRoomInfo(deps) {
  D = deps;
  overlayEl = document.getElementById('roominfo-overlay');
  panelEl = document.getElementById('roominfo-panel');
  bodyEl = document.getElementById('roominfo-body');
  titleEl = document.getElementById('roominfo-title');
  const closeBtn = document.getElementById('roominfo-close');
  if (closeBtn) closeBtn.appendChild(D.icon('x', 16));
  if (closeBtn) closeBtn.addEventListener('click', closeRoomInfo);
  if (overlayEl) {
    overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeRoomInfo(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isRoomInfoOpen()) closeRoomInfo();
  });
}

export function isRoomInfoOpen() {
  return !!(overlayEl && !overlayEl.classList.contains('hidden'));
}

export function openRoomInfo(roomId) {
  if (!overlayEl) return;
  activeRoomId = roomId;
  activeTab = 'info';
  overlayEl.classList.remove('hidden');
  render();
}

export function closeRoomInfo() {
  if (overlayEl) overlayEl.classList.add('hidden');
  activeRoomId = null;
}

export function refreshRoomInfo(roomId) {
  if (isRoomInfoOpen() && roomId === activeRoomId) render();
}

function render() {
  const room = D.getRoom(activeRoomId);
  if (!room || !bodyEl) return;
  titleEl.textContent = D.roomDisplayName(room);

  bodyEl.textContent = '';

  // Tab-Leiste
  const tabbar = D.el('div', 'ri-tabbar');
  for (const t of TABS) {
    const btn = D.el('button', 'ri-tab');
    if (t.id === activeTab) btn.classList.add('active');
    btn.appendChild(D.icon(t.icon, 16));
    btn.appendChild(D.el('span', null, t.label));
    btn.addEventListener('click', () => { activeTab = t.id; render(); });
    tabbar.appendChild(btn);
  }
  bodyEl.appendChild(tabbar);

  const content = D.el('div', 'ri-content');
  bodyEl.appendChild(content);

  if (activeTab === 'info') renderInfo(room, content);
  else if (activeTab === 'members') renderMembers(room, content);
  else if (activeTab === 'media') renderMedia(room, content);
  else if (activeTab === 'files') renderFiles(room, content);
  else if (activeTab === 'links') renderLinks(room, content);
}

function renderInfo(room, c) {
  const head = D.el('div', 'ri-hero');
  const av = D.el('div', 'ri-hero-avatar');
  D.setAvatar(av, room.roomId, D.roomDisplayName(room), D.roomAvatarMxc(room));
  head.appendChild(av);
  head.appendChild(D.el('div', 'ri-hero-name', D.roomDisplayName(room)));
  const meta = [];
  if (room.isDirect) meta.push('Direktnachricht');
  if (room.isEncrypted) meta.push('Ende-zu-Ende-verschlüsselt');
  head.appendChild(D.el('div', 'ri-hero-meta', meta.join(' · ')));
  c.appendChild(head);

  if (room.topic) {
    const box = D.el('div', 'ri-section');
    box.appendChild(D.el('div', 'ri-section-title', 'Thema'));
    box.appendChild(D.el('div', 'ri-topic', room.topic));
    c.appendChild(box);
  }

  const rows = D.el('div', 'ri-section');
  addRow(rows, 'Raum-ID', room.roomId);
  const mc = room.members ? room.members.size : 0;
  if (mc) addRow(rows, 'Mitglieder', String(mc));
  addRow(rows, 'Verschlüsselung', room.isEncrypted ? 'Aktiv' : 'Aus');
  c.appendChild(rows);
}

function addRow(parent, label, value) {
  const row = D.el('div', 'ri-row');
  row.appendChild(D.el('span', 'ri-row-label', label));
  row.appendChild(D.el('span', 'ri-row-value', value));
  parent.appendChild(row);
}

async function renderMembers(room, c) {
  const list = D.el('div', 'ri-member-list');
  c.appendChild(list);
  // Sofort aus dem lokalen State, danach vom Server nachladen.
  let ids = room.members ? [...room.members.keys()].filter((id) => {
    const m = room.members.get(id);
    return !m || !m.membership || m.membership === 'join';
  }) : [];
  const fill = (userIds) => {
    list.textContent = '';
    const sorted = userIds.slice().sort((a, b) =>
      D.memberName(room, a).localeCompare(D.memberName(room, b)));
    list.appendChild(D.el('div', 'ri-count', sorted.length + ' Mitglieder'));
    for (const uid of sorted) {
      const item = D.el('div', 'ri-member');
      const av = D.el('div', 'ri-member-avatar');
      const m = room.members && room.members.get(uid);
      D.setAvatar(av, uid, D.memberName(room, uid), m && m.avatarUrl);
      item.appendChild(av);
      const info = D.el('div', 'ri-member-info');
      info.appendChild(D.el('div', 'ri-member-name', D.memberName(room, uid)));
      info.appendChild(D.el('div', 'ri-member-id', uid));
      item.appendChild(info);
      list.appendChild(item);
    }
  };
  fill(ids);
  try {
    const server = await D.getJoinedMembers(room.roomId);
    if (isRoomInfoOpen() && activeRoomId === room.roomId && activeTab === 'members' && server && server.length) {
      fill(server);
    }
  } catch (e) { /* lokaler Stand bleibt */ }
}

function collectAttachments(room, kinds) {
  const out = [];
  for (const ev of room.events || []) {
    if (ev.redacted || ev.pending) continue;
    const c = ev.content || {};
    if (kinds.includes(c.msgtype) && (c.url || c.file)) {
      out.push({ ev, content: c });
    }
  }
  return out.reverse(); // neueste zuerst
}

function renderMedia(room, c) {
  const items = collectAttachments(room, ['m.image', 'm.video']);
  if (!items.length) { c.appendChild(emptyState('Noch keine Medien geteilt.')); return; }
  const grid = D.el('div', 'ri-media-grid');
  for (const it of items) {
    const cell = D.el('button', 'ri-media-cell');
    const isVideo = it.content.msgtype === 'm.video';
    cell.title = it.content.body || (isVideo ? 'Video' : 'Bild');
    if (isVideo) {
      // Kein Voll-Download nur fürs Raster: Play-Symbol; Abspielen im Chat.
      cell.classList.add('ri-media-video');
      cell.appendChild(D.icon('play', 22));
    } else {
      // Bild lazy laden.
      D.getAttachmentBlob(it.content).then((blob) => {
        if (!cell.isConnected) return;
        const img = document.createElement('img');
        img.alt = ''; img.src = URL.createObjectURL(blob);
        cell.appendChild(img);
      }).catch(() => { /* Zelle bleibt leer */ });
      cell.addEventListener('click', () => {
        D.openImageLightbox({
          getBlobUrl: async () => URL.createObjectURL(await D.getAttachmentBlob(it.content)),
          filename: it.content.body || 'Bild',
        });
      });
    }
    grid.appendChild(cell);
  }
  c.appendChild(grid);
}

function renderFiles(room, c) {
  const items = collectAttachments(room, ['m.file', 'm.audio']);
  if (!items.length) { c.appendChild(emptyState('Noch keine Dateien geteilt.')); return; }
  const list = D.el('div', 'ri-file-list');
  for (const it of items) {
    const row = D.el('button', 'ri-file');
    row.appendChild(D.icon(it.content.msgtype === 'm.audio' ? 'play' : 'file', 18));
    const info = D.el('div', 'ri-file-info');
    info.appendChild(D.el('div', 'ri-file-name', it.content.filename || it.content.body || 'Datei'));
    const size = it.content.info && it.content.info.size;
    if (size) info.appendChild(D.el('div', 'ri-file-size', D.formatBytes(size)));
    row.appendChild(info);
    row.appendChild(D.icon('download', 16));
    row.addEventListener('click', async () => {
      try {
        const blob = await D.getAttachmentBlob(it.content);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = it.content.filename || it.content.body || 'datei';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (e) { /* Download fehlgeschlagen */ }
    });
    list.appendChild(row);
  }
  c.appendChild(list);
}

function renderLinks(room, c) {
  const seen = new Set();
  const links = [];
  for (const ev of [...(room.events || [])].reverse()) {
    if (ev.redacted || ev.pending) continue;
    const cc = ev.content || {};
    if ((cc.msgtype || 'm.text') !== 'm.text' && (cc.msgtype || 'm.text') !== 'm.notice') continue;
    const url = D.extractFirstUrl(cc.body || '');
    if (url && !seen.has(url)) { seen.add(url); links.push({ url, ev }); }
  }
  if (!links.length) { c.appendChild(emptyState('Noch keine Links geteilt.')); return; }
  const list = D.el('div', 'ri-link-list');
  for (const l of links) {
    let host = l.url;
    try { host = new URL(l.url).host; } catch (e) { /* */ }
    const a = document.createElement('a');
    a.className = 'ri-link';
    a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const badge = D.el('div', 'ri-link-badge', (host[0] || '?').toUpperCase());
    a.appendChild(badge);
    const info = D.el('div', 'ri-link-info');
    info.appendChild(D.el('div', 'ri-link-host', host));
    info.appendChild(D.el('div', 'ri-link-url', l.url));
    a.appendChild(info);
    list.appendChild(a);
  }
  c.appendChild(list);
}

function emptyState(text) {
  const box = D.el('div', 'ri-empty');
  box.appendChild(D.icon('folder', 28));
  box.appendChild(D.el('div', null, text));
  return box;
}
