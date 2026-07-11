/* MatrixMess Web – Ende-zu-Ende-Verschlüsselung (Olm/Megolm)
   Dünner Wrapper um die offizielle Matrix-Rust-Crypto-Engine
   (matrix-sdk-crypto-wasm, gevendort unter ./vendor/matrix-sdk-crypto-wasm/).

   Alle verwendeten API-Signaturen sind gegen
   vendor/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm.d.ts verifiziert:

   - OlmMachine.initialize(user_id: UserId, device_id: DeviceId,
       store_name?: string, store_passphrase?: string): Promise<OlmMachine>
   - machine.receiveSyncChanges(to_device_events: string (JSON),
       changed_devices: DeviceLists, one_time_keys_counts: Map<string, number>,
       unused_fallback_keys?: Set<string>): Promise<ProcessedToDeviceEvent[]>
   - machine.outgoingRequests(): Promise<OutgoingRequest[]>
   - machine.markRequestAsSent(request_id: string, request_type: RequestType,
       response: string): Promise<true>
   - machine.decryptRoomEvent(event: string (JSON), room_id: RoomId,
       decryption_settings: DecryptionSettings): Promise<DecryptedRoomEvent>
       (DecryptedRoomEvent.event: string (JSON); rejects mit MegolmDecryptionError)
   - machine.updateTrackedUsers(users: UserId[]): Promise<void>   (invalidiert UserIds!)
   - machine.getMissingSessions(users: UserId[]): Promise<KeysClaimRequest | null>
   - machine.shareRoomKey(room_id: RoomId, users: UserId[],
       encryption_settings: EncryptionSettings): Promise<ToDeviceRequest[]>
   - machine.encryptRoomEvent(room_id: RoomId, event_type: string,
       content: string (JSON)): Promise<string (JSON)>
   - machine.importBackedUpRoomKeys(backed_up_room_keys: Map<RoomId, Map<string, any>>,
       progress_listener: ((progress, total, failures) => void) | undefined,
       backup_version: string): Promise<RoomKeyImportResult>
   - new DeviceLists(changed?: UserId[] | null, left?: UserId[] | null)
   - new DecryptionSettings(sender_device_trust_requirement: TrustRequirement)
   - new EncryptionSettings()  (Default-Werte)
   - RequestType: KeysUpload=0, KeysQuery=1, KeysClaim=2, ToDevice=3,
       SignatureUpload=4, RoomMessage=5, KeysBackup=6
   - ToDeviceRequest: { id, event_type, txn_id, body (JSON-String), type }
   - RoomMessageRequest: { id, room_id, txn_id, event_type, body, type }
   - KeysBackupRequest: { id, body, version, type }
   - SignatureUploadRequest: { id: string | undefined, body, type }
   - BackupDecryptionKey.fromBase64(key: string),
     .decryptV1(ephemeral_key: string, mac: string, ciphertext: string): string,
     .megolmV1PublicKey.publicKeyBase64: string
   - new UserId(id: string), new DeviceId(id: string), new RoomId(id: string)
*/

import {
  initAsync,
  OlmMachine,
  UserId,
  DeviceId,
  RoomId,
  DeviceLists,
  RequestType,
  DecryptionSettings,
  TrustRequirement,
  EncryptionSettings,
  BackupDecryptionKey,
} from './vendor/matrix-sdk-crypto-wasm/index.mjs';

const LS_PICKLE = 'mm.cryptoPickle';

/** Löscht die IndexedDB-Datenbanken eines Krypto-Stores (Basisname + die von
 *  matrix-sdk-crypto-wasm angelegten "::matrix-sdk-crypto"(-meta)-Varianten). */
function deleteCryptoStore(base) {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  const names = [base, base + '::matrix-sdk-crypto', base + '::matrix-sdk-crypto-meta'];
  return Promise.all(names.map((name) => new Promise((resolve) => {
    let req;
    try { req = indexedDB.deleteDatabase(name); } catch (e) { resolve(); return; }
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  })));
}

/** Liest den Store-Passphrase-Schlüssel oder erzeugt ihn einmalig
 *  (32 zufällige Bytes, Base64, in localStorage gehalten). */
function getOrCreatePickleKey() {
  let key = null;
  try {
    key = localStorage.getItem(LS_PICKLE);
  } catch (e) { /* localStorage nicht verfügbar -> unten neu erzeugen */ }
  if (key) return key;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  key = btoa(bin);
  // Wirft, wenn nicht persistierbar – dann soll init() bewusst fehlschlagen,
  // damit wir nicht bei jedem Start einen neuen (nutzlosen) Store anlegen.
  localStorage.setItem(LS_PICKLE, key);
  return key;
}

export class CryptoEngine {
  constructor() {
    this.machine = null;
    this.api = null;          // authentifizierte fetch-Hilfsfunktion aus app.js
    this.baseUrl = null;
    this.userId = null;
    this.deviceId = null;
    this.storeName = null;
    this._outgoingBusy = false;
    this._encryptLock = Promise.resolve();
  }

  /**
   * Initialisiert WASM-Modul und OlmMachine mit persistentem IndexedDB-Store.
   * Wirft bei jedem Fehler – der Aufrufer degradiert dann auf den
   * Platzhalter-Modus (nur Anzeige, kein Senden in E2EE-Räumen).
   */
  async init({ baseUrl, userId, deviceId, accessToken, apiFetch }) {
    if (!userId || !deviceId) throw new Error('Session ohne userId/deviceId – E2EE nicht möglich');
    if (typeof apiFetch !== 'function') throw new Error('apiFetch fehlt');
    this.api = apiFetch;
    this.baseUrl = baseUrl || null;
    this.userId = userId;
    this.deviceId = deviceId;
    // Store PRO GERÄT: Jede Neuanmeldung erhält eine neue Device-ID. Hinge der
    // Store nur am userId, würde die OlmMachine den alten Store (anderes Gerät)
    // öffnen und mit "account in the store doesn't match" scheitern.
    this.storeName = 'mm-crypto-' + userId + '-' + deviceId;
    void accessToken; // HTTP läuft komplett über apiFetch

    await initAsync();
    const passphrase = getOrCreatePickleKey();
    try {
      this.machine = await OlmMachine.initialize(
        new UserId(userId),
        new DeviceId(deviceId),
        this.storeName,
        passphrase
      );
    } catch (err) {
      // Store gehört zu einem anderen Gerät/Konto (z. B. Reste einer früheren
      // Anmeldung im selben Browser): verwerfen und einmal frisch anlegen.
      const msg = (err && err.message) || String(err);
      if (/doesn't match|account in the store|does not match/i.test(msg)) {
        console.warn('[crypto] Store gehört zu anderem Gerät – wird zurückgesetzt.');
        await deleteCryptoStore(this.storeName);
        await deleteCryptoStore('mm-crypto-' + userId); // Alt-Store ohne Device-ID
        this.machine = await OlmMachine.initialize(
          new UserId(userId),
          new DeviceId(deviceId),
          this.storeName,
          passphrase
        );
      } else {
        throw err;
      }
    }
    // Geräte-/One-Time-Keys möglichst sofort hochladen, damit andere Geräte
    // diesem Gerät Room-Keys schicken können. Ein Fehler hierbei darf die
    // Engine-Initialisierung NICHT scheitern lassen – der Upload wird sonst
    // beim ersten /sync ohnehin erneut versucht.
    try {
      await this.processOutgoing();
    } catch (err) {
      console.warn('[crypto] Initialer Key-Upload verschoben:', err);
    }
    return this;
  }

  _recoveryKeyStorageKey() { return 'mm.recoveryKey.' + this.userId; }

  /** Gespeicherten Recovery Key lesen (falls der Nutzer ihn einmal eingegeben hat). */
  getStoredRecoveryKey() {
    try { return localStorage.getItem(this._recoveryKeyStorageKey()) || null; }
    catch (e) { return null; }
  }

  hasStoredRecoveryKey() { return !!this.getStoredRecoveryKey(); }

  /** Recovery Key vergessen (Logout). */
  forgetRecoveryKey() {
    try { localStorage.removeItem(this._recoveryKeyStorageKey()); } catch (e) { /* */ }
  }

  /**
   * Versucht, das Backup automatisch mit einem zuvor gespeicherten Recovery Key
   * wiederherzustellen. Liefert das Import-Ergebnis oder null, wenn kein Key
   * gespeichert ist bzw. der Import scheitert (dann bleibt der UI-Fluss beim
   * manuellen Eingeben).
   */
  async tryAutoRestore() {
    const stored = this.getStoredRecoveryKey();
    if (!stored) return null;
    try {
      return await this.importFromRecoveryKey(stored);
    } catch (err) {
      console.warn('[crypto] Auto-Restore fehlgeschlagen:', err);
      return null;
    }
  }

  /** OlmMachine (und IndexedDB-Verbindungen) schließen. */
  close() {
    if (this.machine) {
      try { this.machine.close(); } catch (e) { /* bereits geschlossen */ }
      this.machine = null;
    }
  }

  _requireMachine() {
    if (!this.machine) throw new Error('CryptoEngine ist nicht initialisiert');
    return this.machine;
  }

  /** Hilfsfunktion: string[] -> UserId[] (ungültige IDs überspringen).
   *  Muss pro Machine-Aufruf frisch erzeugt werden, da updateTrackedUsers/
   *  getMissingSessions/shareRoomKey die UserId-Objekte invalidieren. */
  _toUserIds(ids) {
    const out = [];
    for (const id of ids || []) {
      try { out.push(new UserId(String(id))); }
      catch (e) { console.warn('[crypto] Ungültige User-ID übersprungen:', id); }
    }
    return out;
  }

  /**
   * Füttert die relevanten Teile einer /sync-Antwort in die OlmMachine
   * und arbeitet danach ausstehende Requests ab.
   * @returns {Promise<number>} Anzahl der empfangenen to_device-Events
   *   (Aufrufer kann daran Retry für pendente Entschlüsselungen aufhängen).
   */
  async processSync(syncResponse) {
    const machine = this._requireMachine();
    const res = syncResponse || {};

    const toDeviceEvents = (res.to_device && Array.isArray(res.to_device.events))
      ? res.to_device.events
      : [];

    const dl = res.device_lists || {};
    const deviceLists = new DeviceLists(
      this._toUserIds(Array.isArray(dl.changed) ? dl.changed : []),
      this._toUserIds(Array.isArray(dl.left) ? dl.left : [])
    );

    const otkCounts = new Map();
    for (const [alg, count] of Object.entries(res.device_one_time_keys_count || {})) {
      if (typeof count === 'number') otkCounts.set(alg, count);
    }

    let fallbackKeys; // undefined lassen, wenn der Server das Feld nicht liefert
    const fb = res.device_unused_fallback_key_types !== undefined
      ? res.device_unused_fallback_key_types
      : res['org.matrix.msc2732.device_unused_fallback_key_types'];
    if (Array.isArray(fb)) fallbackKeys = new Set(fb);

    await machine.receiveSyncChanges(
      JSON.stringify(toDeviceEvents),
      deviceLists,
      otkCounts,
      fallbackKeys
    );

    await this.processOutgoing();
    return toDeviceEvents.length;
  }

  /** Sendet einen einzelnen Outgoing-Request an den passenden Endpunkt und
   *  meldet die Antwort an die Machine zurück. */
  async _dispatchRequest(req) {
    const machine = this._requireMachine();
    const type = req.type;
    let response;

    if (type === RequestType.KeysUpload) {
      response = await this.api('POST', '/_matrix/client/v3/keys/upload', JSON.parse(req.body));
    } else if (type === RequestType.KeysQuery) {
      response = await this.api('POST', '/_matrix/client/v3/keys/query', JSON.parse(req.body));
    } else if (type === RequestType.KeysClaim) {
      response = await this.api('POST', '/_matrix/client/v3/keys/claim', JSON.parse(req.body));
    } else if (type === RequestType.SignatureUpload) {
      response = await this.api('POST', '/_matrix/client/v3/keys/signatures/upload', JSON.parse(req.body));
    } else if (type === RequestType.ToDevice) {
      response = await this.api(
        'PUT',
        `/_matrix/client/v3/sendToDevice/${encodeURIComponent(req.event_type)}/${encodeURIComponent(req.txn_id)}`,
        JSON.parse(req.body)
      );
    } else if (type === RequestType.RoomMessage) {
      response = await this.api(
        'PUT',
        `/_matrix/client/v3/rooms/${encodeURIComponent(req.room_id)}/send/${encodeURIComponent(req.event_type)}/${encodeURIComponent(req.txn_id)}`,
        JSON.parse(req.body)
      );
    } else if (type === RequestType.KeysBackup) {
      response = await this.api(
        'PUT',
        `/_matrix/client/v3/room_keys/keys?version=${encodeURIComponent(req.version)}`,
        JSON.parse(req.body)
      );
    } else {
      throw new Error('Unbekannter Outgoing-Request-Typ: ' + type);
    }

    // SignatureUploadRequest.id kann laut .d.ts undefined sein – dann können
    // wir die Antwort nicht zuordnen und markieren nichts.
    if (req.id !== undefined && req.id !== null) {
      await machine.markRequestAsSent(req.id, type, JSON.stringify(response || {}));
    }
  }

  /**
   * Arbeitet machine.outgoingRequests() ab (Keys-Upload/-Query/-Claim,
   * to-device-Nachrichten, …). Fehler einzelner Requests werden geloggt,
   * die Schleife läuft weiter; maximal 2 Durchläufe pro Aufruf.
   */
  async processOutgoing() {
    if (!this.machine || this._outgoingBusy) return;
    this._outgoingBusy = true;
    try {
      // Bis zu 8 Durchläufe: manche Requests erzeugen Folge-Requests
      // (Upload -> Query -> Claim). Sicherheits-Cap gegen Endlosschleifen.
      for (let pass = 0; pass < 8; pass++) {
        let requests;
        try {
          requests = await this.machine.outgoingRequests();
        } catch (err) {
          console.warn('[crypto] outgoingRequests fehlgeschlagen:', err);
          break;
        }
        if (!requests || requests.length === 0) break;
        for (const req of requests) {
          try {
            await this._dispatchRequest(req);
          } catch (err) {
            console.warn('[crypto] Outgoing-Request fehlgeschlagen (Typ ' + req.type + '):', err);
          }
        }
      }
    } finally {
      this._outgoingBusy = false;
    }
  }

  /**
   * Entschlüsselt ein m.room.encrypted-Timeline-Event.
   * @returns {Promise<object|null>} das entschlüsselte Event (geparst) oder
   *   null, wenn (noch) nicht entschlüsselbar (z. B. Schlüssel fehlt).
   */
  async decryptEvent(event, roomId) {
    if (!this.machine) return null;
    try {
      const settings = new DecryptionSettings(TrustRequirement.Untrusted);
      const result = await this.machine.decryptRoomEvent(
        JSON.stringify(event),
        new RoomId(roomId),
        settings
      );
      return JSON.parse(result.event);
    } catch (err) {
      // MegolmDecryptionError (u. a. MissingRoomKey/UnableToDecrypt) -> Platzhalter
      return null;
    }
  }

  /**
   * Verschlüsselt einen Event-Content für einen Raum:
   * Tracked Users aktualisieren -> fehlende Olm-Sessions claimen ->
   * Room-Key an alle Geräte verteilen -> Event verschlüsseln.
   * @returns {Promise<object>} Content-Objekt für ein m.room.encrypted-Event.
   */
  async encryptEvent(roomId, eventType, content, memberUserIds) {
    // Serieller Ablauf: getMissingSessions/shareRoomKey sollen laut Doku
    // nicht parallel laufen.
    const run = this._encryptLock.then(() =>
      this._encryptEventInner(roomId, eventType, content, memberUserIds)
    );
    this._encryptLock = run.then(() => undefined, () => undefined);
    return run;
  }

  async _encryptEventInner(roomId, eventType, content, memberUserIds) {
    const machine = this._requireMachine();
    const ids = Array.isArray(memberUserIds) ? memberUserIds : [];

    // 1) Nutzer tracken (löst bei neuen Nutzern eine KeysQuery aus) …
    await machine.updateTrackedUsers(this._toUserIds(ids));
    // … und die daraus entstehenden Requests (v. a. /keys/query) rausschicken.
    await this.processOutgoing();

    // 2) Fehlende 1:1-Olm-Sessions über /keys/claim aufbauen.
    const claim = await machine.getMissingSessions(this._toUserIds(ids));
    if (claim) {
      const res = await this.api('POST', '/_matrix/client/v3/keys/claim', JSON.parse(claim.body));
      await machine.markRequestAsSent(claim.id, claim.type, JSON.stringify(res || {}));
    }

    // 3) Room-Key als to-device-Nachrichten an alle Geräte verteilen.
    const toDeviceRequests = await machine.shareRoomKey(
      new RoomId(roomId),
      this._toUserIds(ids),
      new EncryptionSettings()
    );
    for (const req of toDeviceRequests) {
      const res = await this.api(
        'PUT',
        `/_matrix/client/v3/sendToDevice/${encodeURIComponent(req.event_type)}/${encodeURIComponent(req.txn_id)}`,
        JSON.parse(req.body)
      );
      await machine.markRequestAsSent(req.id, req.type, JSON.stringify(res || {}));
    }

    // 4) Eigentliches Event verschlüsseln.
    const encrypted = await machine.encryptRoomEvent(
      new RoomId(roomId),
      eventType,
      JSON.stringify(content)
    );
    return JSON.parse(encrypted);
  }

  /**
   * Importiert Megolm-Sitzungsschlüssel aus dem serverseitigen Key-Backup.
   * Akzeptiert den ueblichen Base58-Recovery-Key (Element-Format "EsTx ...",
   * Matrix-Spec: 0x8B 0x01 + 32 Key-Bytes + XOR-Paritaetsbyte) sowie rohes Base64.
   * @param {string} recoveryKey Recovery Key (Base58 oder Base64)
   * @param {(done: number, total: number) => void} [onProgress]
   * @returns {Promise<{imported: number, failed: number}>}
   */
  async importFromRecoveryKey(recoveryKey, onProgress) {
    const machine = this._requireMachine();

    const trimmed = String(recoveryKey || '').replace(/\s+/g, '');
    if (!trimmed) throw new Error('Kein Recovery Key angegeben');

    let decryptionKey = null;

    const base58Bytes = decodeBase58(trimmed);
    if (base58Bytes && base58Bytes.length === 35 && base58Bytes[0] === 0x8b && base58Bytes[1] === 0x01) {
      let parity = 0;
      for (const byte of base58Bytes) parity ^= byte;
      if (parity !== 0) {
        throw new Error('Recovery Key ist fehlerhaft (Prüfsumme stimmt nicht – bitte auf Tippfehler prüfen)');
      }
      const keyBytes = base58Bytes.slice(2, 34);
      decryptionKey = BackupDecryptionKey.fromBase64(bytesToBase64(keyBytes));
    }

    if (!decryptionKey) {
      try {
        decryptionKey = BackupDecryptionKey.fromBase64(trimmed);
      } catch (err) {
        throw new Error('Recovery Key konnte nicht gelesen werden (weder gültiges Base58- noch Base64-Format)');
      }
    }

    // Aktuelle Backup-Version vom Server holen.
    let versionInfo;
    try {
      versionInfo = await this.api('GET', '/_matrix/client/v3/room_keys/version');
    } catch (err) {
      if (err && (err.status === 404 || err.errcode === 'M_NOT_FOUND')) {
        throw new Error('Kein Key-Backup auf dem Server');
      }
      throw err;
    }
    const version = versionInfo && versionInfo.version;
    const serverPublicKey = versionInfo && versionInfo.auth_data && versionInfo.auth_data.public_key;
    if (!version || !serverPublicKey) {
      throw new Error('Server-Backup ist unvollständig (Version/Public-Key fehlt)');
    }
    if (decryptionKey.megolmV1PublicKey.publicKeyBase64 !== serverPublicKey) {
      throw new Error('Recovery Key passt nicht zum Server-Backup');
    }

    // Alle gesicherten Room-Keys herunterladen.
    const backup = await this.api(
      'GET',
      '/_matrix/client/v3/room_keys/keys?version=' + encodeURIComponent(version)
    );
    const roomsObj = (backup && backup.rooms) || {};

    let total = 0;
    for (const roomData of Object.values(roomsObj)) {
      total += Object.keys((roomData && roomData.sessions) || {}).length;
    }

    // Struktur laut .d.ts: Map<RoomId, Map<sessionId, entschlüsselte Session-Daten>>
    const backedUp = new Map();
    let failed = 0;
    let done = 0;
    for (const [roomIdStr, roomData] of Object.entries(roomsObj)) {
      const sessions = (roomData && roomData.sessions) || {};
      const sessionCount = Object.keys(sessions).length;
      let roomId;
      try {
        roomId = new RoomId(roomIdStr);
      } catch (e) {
        failed += sessionCount;
        done += sessionCount;
        continue;
      }
      const inner = new Map();
      for (const [sessionId, entry] of Object.entries(sessions)) {
        done++;
        try {
          const sd = entry && entry.session_data;
          if (!sd) throw new Error('session_data fehlt');
          const json = decryptionKey.decryptV1(sd.ephemeral, sd.mac, sd.ciphertext);
          inner.set(sessionId, JSON.parse(json));
        } catch (e) {
          failed++; // einzelne Fehlschläge überspringen und zählen
        }
        if (onProgress && (done % 50 === 0 || done === total)) {
          try { onProgress(done, total); } catch (e) { /* UI-Fehler ignorieren */ }
        }
      }
      if (inner.size > 0) backedUp.set(roomId, inner);
    }

    const result = await machine.importBackedUpRoomKeys(backedUp, undefined, version);

    // Recovery Key merken, damit spätere Sitzungen automatisch wiederherstellen
    // (gleiche Vertrauensgrenze wie der bereits lokal liegende Pickle-Key).
    try { localStorage.setItem(this._recoveryKeyStorageKey(), trimmed); } catch (e) { /* */ }

    return { imported: result.importedCount, failed };
  }

  /* ===================================================================
   * Geräte-Verifizierung (SAS / Emoji-Vergleich)
   * Vollständig gekapselt: jeder Fehler wird abgefangen und darf die
   * übrigen Krypto-Pfade (Init/Entschlüsselung/Senden) nicht berühren.
   * =================================================================== */

  /** Callback registrieren, der bei jeder Zustandsänderung die UI-Ansicht erhält. */
  setVerificationChangeHandler(fn) {
    this._onVerificationChange = typeof fn === 'function' ? fn : null;
  }

  _emitVerificationChange() {
    if (this._onVerificationChange) {
      try { this._onVerificationChange(this.getVerificationView()); } catch (e) { /* UI-Fehler ignorieren */ }
    }
  }

  /** Sendet einen ausgehenden Verifizierungs-Request (To-Device oder Raum). */
  async _dispatchVerification(outgoing) {
    if (!outgoing) return;
    try {
      if (outgoing.room_id) {
        await this.api(
          'PUT',
          `/_matrix/client/v3/rooms/${encodeURIComponent(outgoing.room_id)}/send/${encodeURIComponent(outgoing.event_type)}/${encodeURIComponent(outgoing.txn_id)}`,
          JSON.parse(outgoing.body)
        );
      } else {
        await this.api(
          'PUT',
          `/_matrix/client/v3/sendToDevice/${encodeURIComponent(outgoing.event_type)}/${encodeURIComponent(outgoing.txn_id)}`,
          JSON.parse(outgoing.body)
        );
      }
    } catch (err) {
      console.warn('[crypto] Verifizierungs-Request fehlgeschlagen:', err);
    }
  }

  _registerVreqCallback() {
    if (this._vreq && this._vreq.registerChangesCallback) {
      try { this._vreq.registerChangesCallback(async () => { await this._advanceVerification(); }); }
      catch (e) { /* */ }
    }
  }

  _registerSasCallback() {
    if (this._vsas && this._vsas.registerChangesCallback) {
      try { this._vsas.registerChangesCallback(async () => { await this._advanceVerification(); }); }
      catch (e) { /* */ }
    }
  }

  /** Startet die Verifizierung DIESES Geräts gegenüber den anderen (verifizierten) Geräten. */
  async startSelfVerification() {
    const machine = this._requireMachine();
    const identity = await machine.getIdentity(new UserId(this.userId));
    if (!identity || typeof identity.requestVerification !== 'function') {
      throw new Error('Keine eigene Cross-Signing-Identität gefunden. Richte die Verschlüsselung zuerst auf einem anderen Gerät (z. B. iPhone) ein.');
    }
    const [request, outgoing] = await identity.requestVerification();
    this._vreq = request;
    this._vsas = null;
    this._registerVreqCallback();
    await this._dispatchVerification(outgoing);
    await this._advanceVerification();
    return this.getVerificationView();
  }

  /** Prüft nach jedem Sync auf eingehende Verifizierungs-Anfragen anderer Geräte. */
  async checkIncomingVerifications() {
    if (!this.machine) return;
    if (this._vreq && !this._vreqFinished()) return; // bereits aktiv
    try {
      const requests = this.machine.getVerificationRequests(new UserId(this.userId));
      for (const req of (requests || [])) {
        if (req.isDone() || req.isCancelled() || req.isPassive()) continue;
        this._vreq = req;
        this._vsas = null;
        this._registerVreqCallback();
        await this._advanceVerification();
        return;
      }
    } catch (e) { /* keine ausstehenden Anfragen */ }
  }

  _vreqFinished() {
    try { return !this._vreq || this._vreq.isDone() || this._vreq.isCancelled(); }
    catch (e) { return true; }
  }

  /** Bewegt den Verifizierungs-Fluss voran (accept/startSas/getVerification). */
  async _advanceVerification() {
    // Reentrancy-Guard: mehrere Change-Callbacks können quasi-gleichzeitig
    // feuern; ohne Lock könnten zwei startSas()-Aufrufe ein Glare auslösen.
    if (this._vAdvancing) { this._vAdvancePending = true; return; }
    this._vAdvancing = true;
    try {
      const req = this._vreq;
      if (req && !req.isDone() && !req.isCancelled()) {
        // Eingehende Anfrage, die wir noch nicht beantwortet haben: annehmen.
        if (!req.weStarted() && !req.isReady()) {
          const out = req.accept();
          if (out) await this._dispatchVerification(out);
        }
        // Bereit + von uns gestartet: in SAS übergehen (sendet m.key.verification.start).
        if (req.isReady() && req.weStarted() && !this._vsas) {
          const started = await req.startSas();
          if (started && started[0]) {
            this._vsas = started[0];
            this._registerSasCallback();
            await this._dispatchVerification(started[1]);
          }
        }
        // Gegenseite hat SAS gestartet: die Verification abgreifen.
        if (!this._vsas) {
          const v = req.getVerification();
          if (v && typeof v.emoji === 'function') {
            this._vsas = v;
            this._registerSasCallback();
          }
        }
      }
      const sas = this._vsas;
      if (sas && !sas.isDone() && !sas.isCancelled()) {
        // Von der Gegenseite gestartete SAS annehmen.
        if (!sas.weStarted() && !sas.hasBeenAccepted()) {
          const out = sas.accept();
          if (out) await this._dispatchVerification(out);
        }
      }
    } catch (err) {
      console.warn('[crypto] Verifizierung konnte nicht fortgesetzt werden:', err);
    } finally {
      this._vAdvancing = false;
    }
    this._emitVerificationChange();
    // Während des Laufs eingegangene Änderungen nachziehen.
    if (this._vAdvancePending) {
      this._vAdvancePending = false;
      await this._advanceVerification();
    }
  }

  /** Bestätigt, dass die Emoji auf beiden Geräten übereinstimmen. */
  async confirmVerification() {
    const sas = this._vsas;
    if (!sas) return;
    try {
      const reqs = await sas.confirm();
      for (const out of (reqs || [])) await this._dispatchVerification(out);
    } catch (err) {
      console.warn('[crypto] Bestätigung fehlgeschlagen:', err);
    }
    this._emitVerificationChange();
  }

  /** Bricht die laufende Verifizierung ab. */
  async cancelVerification() {
    try {
      if (this._vsas && !this._vsas.isDone()) {
        const out = this._vsas.cancel();
        if (out) await this._dispatchVerification(out);
      } else if (this._vreq && !this._vreqFinished()) {
        const out = this._vreq.cancel();
        if (out) await this._dispatchVerification(out);
      }
    } catch (e) { /* */ }
    this._vreq = null;
    this._vsas = null;
    this._emitVerificationChange();
  }

  /** UI-freundliche Momentaufnahme des Verifizierungs-Zustands. */
  getVerificationView() {
    const view = {
      active: false, done: false, cancelled: false,
      emoji: null, canConfirm: false, waiting: false, otherDevice: null,
    };
    try {
      const req = this._vreq;
      const sas = this._vsas;
      if (!req && !sas) return view;
      view.active = true;
      if (req) {
        try { view.otherDevice = req.otherDeviceId ? String(req.otherDeviceId.toString()) : null; } catch (e) { /* */ }
        if (req.isCancelled()) view.cancelled = true;
        if (req.isDone()) view.done = true;
      }
      if (sas) {
        if (sas.isCancelled()) view.cancelled = true;
        if (sas.isDone()) view.done = true;
        const emoji = (typeof sas.emoji === 'function') ? sas.emoji() : null;
        if (emoji && emoji.length) {
          view.emoji = emoji.map((e) => ({ symbol: e.symbol, description: e.description }));
          view.canConfirm = !sas.haveWeConfirmed();
        } else if (!view.done && !view.cancelled) {
          view.waiting = true;
        }
      } else if (!view.done && !view.cancelled) {
        view.waiting = true;
      }
    } catch (e) { /* */ }
    return view;
  }
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Dekodiert einen Base58-String (Bitcoin-Alphabet) zu Bytes.
 * Gibt null zurueck, wenn der String kein gueltiges Base58 ist.
 * @param {string} input
 * @returns {Uint8Array | null}
 */
function decodeBase58(input) {
  if (!input) return null;
  const bytes = [0];
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) return null;
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Fuehrende '1'-Zeichen stehen fuer fuehrende Null-Bytes.
  for (let i = 0; i < input.length && input[i] === '1'; i++) {
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} Base64
 */
function bytesToBase64(bytes) {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

export default CryptoEngine;
