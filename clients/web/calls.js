/* MatrixMess Web – 1:1-Anrufe (calls.js)
 *
 * Sprach- und Videoanrufe über die Matrix-VoIP-Events (m.call.invite/
 * answer/candidates/hangup/reject/select_answer, Version "1") und WebRTC.
 * Reines 1:1 (DM), kein Gruppenanruf. Signalisierung läuft als Raum-Events;
 * der Integrator (app.js) verschlüsselt sie in E2EE-Räumen mit.
 *
 * Ehrliche Grenze: Ohne TURN-Server klappt die Verbindung nur, wenn
 * mindestens eine Seite nicht hinter symmetrischem NAT sitzt (öffentliche
 * STUN-Server reichen dann). Ein eigener TURN-Server lässt sich später
 * über setIceServers() ergänzen.
 *
 * Export-API:
 *   initCalls(deps)                     – Abhängigkeiten setzen
 *   startCall(roomId, withVideo)        – ausgehenden Anruf beginnen
 *   handleCallEvent(roomId, ev)         – eingehendes m.call.*-Event verarbeiten
 *   hangup()                            – aktiven Anruf/Anfrage beenden
 *   isBusy()                            – läuft gerade ein Anruf?
 *   setIceServers(list)                 – ICE-/TURN-Server überschreiben
 */

const CALL_VERSION = '1';
const INVITE_LIFETIME = 60000; // ms, Standard laut Spec
const CANDIDATE_BATCH_MS = 200;

let deps = {
  sendCallEvent: null,   // (roomId, type, content) -> Promise
  getRoom: null,
  roomDisplayName: null,
  roomAvatarMxc: null,
  setAvatar: null,
  icon: null,
  el: null,
  toast: null,
  getUserId: null,
};

let iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/* Aktiver Anruf-Zustand (immer nur einer). */
let call = null;
/* call = {
 *   roomId, callId, partyId, remoteParty,
 *   state: 'ringing_out'|'ringing_in'|'connecting'|'active'|'ended',
 *   video, pc, localStream, remoteStream,
 *   pendingCandidates: [], candidateTimer, incomingOffer, uiTimer, startedAt
 * } */

let ringtoneOsc = null;
let ringtoneCtx = null;

/* ========================================================================
 * Hilfen
 * ====================================================================== */

function E(tag, cls, text) { return deps.el(tag, cls, text); }

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function log(...a) { try { console.info('[calls]', ...a); } catch (e) { /* */ } }

export function setIceServers(list) {
  if (Array.isArray(list) && list.length) iceServers = list;
}

export function initCalls(d) {
  deps = Object.assign(deps, d || {});
}

export function isBusy() {
  return !!call && call.state !== 'ended';
}

/* ========================================================================
 * Signalisierung senden
 * ====================================================================== */

function send(type, content) {
  if (!call || typeof deps.sendCallEvent !== 'function') return Promise.resolve();
  const full = Object.assign({
    call_id: call.callId,
    party_id: call.partyId,
    version: CALL_VERSION,
  }, content);
  return Promise.resolve(deps.sendCallEvent(call.roomId, type, full))
    .catch((err) => log('send fehlgeschlagen', type, err));
}

function flushCandidates() {
  if (!call || !call.pendingCandidates.length) return;
  const candidates = call.pendingCandidates.splice(0);
  send('m.call.candidates', { candidates });
}

function queueCandidate(cand) {
  if (!call) return;
  call.pendingCandidates.push({
    candidate: cand.candidate,
    sdpMid: cand.sdpMid,
    sdpMLineIndex: cand.sdpMLineIndex,
  });
  clearTimeout(call.candidateTimer);
  call.candidateTimer = setTimeout(flushCandidates, CANDIDATE_BATCH_MS);
}

/* ========================================================================
 * WebRTC-Peer aufbauen
 * ====================================================================== */

async function createPeer() {
  const pc = new RTCPeerConnection({ iceServers });
  call.pc = pc;
  call.remoteStream = new MediaStream();

  pc.onicecandidate = (e) => {
    if (e.candidate) queueCandidate(e.candidate);
    else { flushCandidates(); send('m.call.candidates', { candidates: [] }); } // Ende-Signal
  };
  pc.ontrack = (e) => {
    for (const track of e.streams[0] ? e.streams[0].getTracks() : [e.track]) {
      call.remoteStream.addTrack(track);
    }
    const rv = document.getElementById('call-remote-video');
    if (rv && rv.srcObject !== call.remoteStream) rv.srcObject = call.remoteStream;
    updateCallUI();
  };
  pc.onconnectionstatechange = () => {
    if (!call) return;
    const st = pc.connectionState;
    log('pc state', st);
    if (st === 'connected') {
      call.state = 'active';
      if (!call.startedAt) call.startedAt = Date.now();
      stopRingtone();
      updateCallUI();
    } else if (st === 'failed') {
      deps.toast('Verbindung fehlgeschlagen – evtl. blockiert eine Firewall den Anruf.');
      endCall('ice_failed', true);
    } else if (st === 'disconnected' || st === 'closed') {
      if (call.state === 'active') endCall('user_hangup', false);
    }
  };

  for (const track of call.localStream.getTracks()) {
    pc.addTrack(track, call.localStream);
  }
  return pc;
}

async function getLocalMedia(video) {
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
  });
}

/* ========================================================================
 * Ausgehender Anruf
 * ====================================================================== */

export async function startCall(roomId, withVideo) {
  if (isBusy()) { deps.toast('Es läuft bereits ein Anruf.'); return; }
  const room = deps.getRoom(roomId);
  if (!room) return;
  if (!navigator.mediaDevices || !window.RTCPeerConnection) {
    deps.toast('Anrufe werden in diesem Browser nicht unterstützt.');
    return;
  }

  call = {
    roomId,
    callId: newId('c'),
    partyId: newId('p'),
    remoteParty: null,
    state: 'ringing_out',
    video: !!withVideo,
    pc: null,
    localStream: null,
    remoteStream: null,
    pendingCandidates: [],
    earlyCandidates: [],
    candidateTimer: null,
    incomingOffer: null,
    startedAt: 0,
  };

  try {
    call.localStream = await getLocalMedia(withVideo);
  } catch (err) {
    deps.toast(withVideo ? 'Kamera/Mikrofon nicht verfügbar.' : 'Mikrofon nicht verfügbar.');
    call = null;
    return;
  }

  openCallUI();
  try {
    const pc = await createPeer();
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: !!withVideo });
    await pc.setLocalDescription(offer);
    await send('m.call.invite', {
      lifetime: INVITE_LIFETIME,
      offer: { type: 'offer', sdp: offer.sdp },
    });
    startRingtone(false);
    // Timeout, falls niemand abnimmt.
    call.uiTimer = setTimeout(() => {
      if (call && call.state === 'ringing_out') {
        deps.toast('Keine Antwort.');
        endCall('invite_timeout', true);
      }
    }, INVITE_LIFETIME);
  } catch (err) {
    log('startCall Fehler', err);
    endCall('failed', true);
  }
}

/* ========================================================================
 * Eingehende Events
 * ====================================================================== */

export function handleCallEvent(roomId, ev) {
  const type = ev.type;
  const c = ev.content || {};
  if (!c.call_id) return;
  // Eigene Events nie verarbeiten: Der eigene invite/answer/candidate echot
  // über /sync zurück – ohne diesen Filter würde man sich (z. B. wenn man
  // vor dem Echo auflegt) selbst anklingeln. In 1:1 kommen alle relevanten
  // Signale von der Gegenseite; eigene Multi-Device-Answers behandelt
  // select_answer separat.
  const me = deps.getUserId ? deps.getUserId() : null;
  if (me && ev.sender === me) return;

  switch (type) {
    case 'm.call.invite': return onInvite(roomId, ev, c);
    case 'm.call.answer': return onAnswer(ev, c);
    case 'm.call.candidates': return onCandidates(ev, c);
    case 'm.call.hangup': return onHangup(ev, c);
    case 'm.call.reject': return onReject(ev, c);
    case 'm.call.select_answer': return onSelectAnswer(ev, c);
  }
}

function onInvite(roomId, ev, c) {
  // Alte Invites (aus dem Verlauf) verwerfen.
  const age = Date.now() - (ev.origin_server_ts || 0);
  if (age > (c.lifetime || INVITE_LIFETIME)) return;
  if (isBusy()) {
    // Schon im Gespräch: automatisch ablehnen.
    tempReject(roomId, c);
    return;
  }
  const hasVideo = !!(c.offer && /m=video/.test(c.offer.sdp || ''));
  call = {
    roomId,
    callId: c.call_id,
    partyId: newId('p'),
    remoteParty: c.party_id || null,
    state: 'ringing_in',
    video: hasVideo,
    pc: null,
    localStream: null,
    remoteStream: null,
    pendingCandidates: [],
    earlyCandidates: [],
    candidateTimer: null,
    incomingOffer: c.offer,
    startedAt: 0,
  };
  openCallUI();
  startRingtone(true);
}

function tempReject(roomId, c) {
  Promise.resolve(deps.sendCallEvent(roomId, 'm.call.reject', {
    call_id: c.call_id,
    party_id: newId('p'),
    version: CALL_VERSION,
  })).catch(() => {});
}

export async function acceptCall() {
  if (!call || call.state !== 'ringing_in') return;
  stopRingtone();
  try {
    call.localStream = await getLocalMedia(call.video);
  } catch (err) {
    deps.toast(call.video ? 'Kamera/Mikrofon nicht verfügbar.' : 'Mikrofon nicht verfügbar.');
    endCall('user_media_failed', true);
    return;
  }
  call.state = 'connecting';
  updateCallUI();
  try {
    const pc = await createPeer();
    await pc.setRemoteDescription({ type: 'offer', sdp: call.incomingOffer.sdp });
    await applyEarlyCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await send('m.call.answer', { answer: { type: 'answer', sdp: answer.sdp } });
  } catch (err) {
    log('acceptCall Fehler', err);
    endCall('failed', true);
  }
}

async function onAnswer(ev, c) {
  if (!call || call.state !== 'ringing_out') return;
  if (call.remoteParty && c.party_id && call.remoteParty !== c.party_id) return; // andere Antwort
  call.remoteParty = c.party_id || call.remoteParty;
  clearTimeout(call.uiTimer);
  stopRingtone();
  call.state = 'connecting';
  updateCallUI();
  try {
    await call.pc.setRemoteDescription({ type: 'answer', sdp: c.answer.sdp });
    await applyEarlyCandidates();
    // Anrufer bestätigt die gewählte Antwort (Glare-/Multi-Device-Schutz).
    await send('m.call.select_answer', { selected_party_id: call.remoteParty });
  } catch (err) {
    log('onAnswer Fehler', err);
    endCall('failed', true);
  }
}

async function onCandidates(ev, c) {
  if (!call) return;
  if (call.remoteParty && c.party_id && call.remoteParty !== c.party_id) return;
  for (const cand of c.candidates || []) {
    if (!cand || !cand.candidate) continue;
    // Kandidaten können vor der Remote-Description eintreffen (der Anrufer
    // sendet sie sofort nach dem Invite, der Angerufene hat aber noch keine
    // PeerConnection). Solche puffern und nach setRemoteDescription anwenden.
    if (!call.pc || !call.pc.remoteDescription) {
      call.earlyCandidates.push(cand);
      continue;
    }
    await addRemoteCandidate(cand);
  }
}

async function addRemoteCandidate(cand) {
  try {
    await call.pc.addIceCandidate({
      candidate: cand.candidate,
      sdpMid: cand.sdpMid,
      sdpMLineIndex: cand.sdpMLineIndex,
    });
  } catch (err) { /* einzelnen Kandidaten überspringen */ }
}

async function applyEarlyCandidates() {
  if (!call || !call.earlyCandidates.length) return;
  const list = call.earlyCandidates.splice(0);
  for (const cand of list) await addRemoteCandidate(cand);
}

function onHangup(ev, c) {
  if (!call || call.callId !== c.call_id) return;
  deps.toast('Anruf beendet.');
  endCall('remote_hangup', false);
}

function onReject(ev, c) {
  if (!call || call.callId !== c.call_id || call.state !== 'ringing_out') return;
  deps.toast('Anruf abgelehnt.');
  endCall('remote_reject', false);
}

function onSelectAnswer(ev, c) {
  // Ein anderes eigenes Gerät wurde als Antwort gewählt → hier auflegen.
  if (!call || call.callId !== c.call_id || call.state !== 'ringing_in') return;
  if (c.selected_party_id && c.selected_party_id !== call.partyId) {
    endCall('answered_elsewhere', false);
  }
}

/* ========================================================================
 * Beenden
 * ====================================================================== */

export function hangup() {
  if (!call) return;
  if (call.state === 'ringing_in') {
    // Eingehenden Anruf ablehnen.
    send('m.call.reject', {});
    endCall('user_reject', false);
    return;
  }
  send('m.call.hangup', { reason: 'user_hangup' });
  endCall('user_hangup', false);
}

function endCall(reason, sendHangup) {
  if (!call) return;
  if (sendHangup && call.callId) {
    send('m.call.hangup', { reason: reason || 'user_hangup' });
  }
  clearTimeout(call.uiTimer);
  clearTimeout(call.candidateTimer);
  stopRingtone();
  try { if (call.pc) call.pc.close(); } catch (e) { /* */ }
  if (call.localStream) { for (const t of call.localStream.getTracks()) { try { t.stop(); } catch (e) { /* */ } } }
  call.state = 'ended';
  closeCallUI();
  call = null;
}

/* ========================================================================
 * Klingelton (kurzer, per WebAudio erzeugter Ton – kein Asset nötig)
 * ====================================================================== */

function startRingtone(incoming) {
  stopRingtone();
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ringtoneCtx = new Ctx();
    const beep = () => {
      if (!ringtoneCtx) return;
      const osc = ringtoneCtx.createOscillator();
      const gain = ringtoneCtx.createGain();
      osc.frequency.value = incoming ? 520 : 440;
      gain.gain.value = 0.0001;
      osc.connect(gain); gain.connect(ringtoneCtx.destination);
      const t = ringtoneCtx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.start(t); osc.stop(t + 0.42);
    };
    beep();
    ringtoneOsc = setInterval(beep, incoming ? 1500 : 2500);
  } catch (e) { /* Ton ist optional */ }
}

function stopRingtone() {
  if (ringtoneOsc) { clearInterval(ringtoneOsc); ringtoneOsc = null; }
  if (ringtoneCtx) { try { ringtoneCtx.close(); } catch (e) { /* */ } ringtoneCtx = null; }
}

/* ========================================================================
 * Anruf-Oberfläche
 * ====================================================================== */

let durationTimer = null;

function openCallUI() {
  closeCallUI();
  const overlay = E('div', 'call-overlay');
  overlay.id = 'call-overlay';

  // Ferne Video/Avatar-Bühne
  const stage = E('div', 'call-stage');
  const remoteVideo = document.createElement('video');
  remoteVideo.id = 'call-remote-video';
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  stage.appendChild(remoteVideo);

  const poster = E('div', 'call-poster');
  poster.id = 'call-poster';
  const av = E('div', 'call-avatar');
  const room = deps.getRoom(call.roomId);
  const name = room ? deps.roomDisplayName(room) : 'Anruf';
  if (deps.setAvatar) deps.setAvatar(av, call.roomId, name, room ? deps.roomAvatarMxc(room) : null);
  poster.appendChild(av);
  poster.appendChild(E('div', 'call-name', name));
  poster.appendChild(E('div', 'call-status', ''));
  stage.appendChild(poster);

  // Eigenes Vorschaubild
  const localVideo = document.createElement('video');
  localVideo.id = 'call-local-video';
  localVideo.autoplay = true;
  localVideo.playsInline = true;
  localVideo.muted = true;
  localVideo.className = 'call-local';
  stage.appendChild(localVideo);
  overlay.appendChild(stage);

  // Steuerleiste
  const bar = E('div', 'call-bar');
  bar.id = 'call-bar';
  overlay.appendChild(bar);

  document.body.appendChild(overlay);
  if (call.localStream) localVideo.srcObject = call.localStream;
  const rv = document.getElementById('call-remote-video');
  if (call.remoteStream && rv) rv.srcObject = call.remoteStream;

  clearInterval(durationTimer);
  durationTimer = setInterval(updateCallUI, 1000);
  updateCallUI();
}

function iconBtn(name, label, cls, onClick) {
  const b = E('button', 'call-btn' + (cls ? ' ' + cls : ''));
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.appendChild(deps.icon(name, 24));
  b.addEventListener('click', onClick);
  return b;
}

function updateCallUI() {
  if (!call) return;
  const overlay = document.getElementById('call-overlay');
  if (!overlay) return;
  const bar = document.getElementById('call-bar');
  const poster = document.getElementById('call-poster');
  const statusEl = poster ? poster.querySelector('.call-status') : null;
  const remoteVideo = document.getElementById('call-remote-video');

  // Status-Text
  let status = '';
  if (call.state === 'ringing_out') status = 'Klingelt …';
  else if (call.state === 'ringing_in') status = call.video ? 'Eingehender Videoanruf' : 'Eingehender Anruf';
  else if (call.state === 'connecting') status = 'Verbinde …';
  else if (call.state === 'active') status = formatDuration(Date.now() - (call.startedAt || Date.now()));
  if (statusEl) statusEl.textContent = status;

  // Fernvideo nur zeigen, wenn Tracks da sind
  const hasRemoteVideo = call.remoteStream && call.remoteStream.getVideoTracks().length > 0;
  if (remoteVideo) remoteVideo.classList.toggle('active', !!hasRemoteVideo);
  if (poster) poster.classList.toggle('hidden', !!hasRemoteVideo);

  overlay.classList.toggle('video', call.video);

  // Steuerleiste je nach Zustand neu aufbauen
  if (!bar) return;
  bar.textContent = '';
  if (call.state === 'ringing_in') {
    bar.appendChild(iconBtn('phone-off', 'Ablehnen', 'hangup', () => hangup()));
    bar.appendChild(iconBtn('phone', 'Annehmen', 'accept', () => acceptCall()));
    return;
  }
  // Mikro stumm
  const micMuted = call.localStream && call.localStream.getAudioTracks().some((t) => !t.enabled);
  bar.appendChild(iconBtn(micMuted ? 'mic-off' : 'mic', micMuted ? 'Mikrofon an' : 'Mikrofon aus',
    micMuted ? 'off' : '', () => toggleMute()));
  // Kamera (nur bei Videoanruf)
  if (call.video) {
    const camOff = call.localStream && call.localStream.getVideoTracks().some((t) => !t.enabled);
    bar.appendChild(iconBtn(camOff ? 'video-off' : 'video', camOff ? 'Kamera an' : 'Kamera aus',
      camOff ? 'off' : '', () => toggleCamera()));
  }
  bar.appendChild(iconBtn('phone-off', 'Auflegen', 'hangup', () => hangup()));
}

function toggleMute() {
  if (!call || !call.localStream) return;
  for (const t of call.localStream.getAudioTracks()) t.enabled = !t.enabled;
  updateCallUI();
}

function toggleCamera() {
  if (!call || !call.localStream) return;
  for (const t of call.localStream.getVideoTracks()) t.enabled = !t.enabled;
  updateCallUI();
}

function closeCallUI() {
  clearInterval(durationTimer);
  const overlay = document.getElementById('call-overlay');
  if (overlay) overlay.remove();
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function formatDurationExport(ms) { return formatDuration(ms); }
export { formatDurationExport };
