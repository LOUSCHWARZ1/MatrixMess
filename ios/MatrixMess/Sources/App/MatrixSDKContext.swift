import Foundation
import MatrixRustSDK

struct MatrixSDKMediaSendResult {
    let matrixEventID: String?
    let attachment: MessageAttachment
}

actor MatrixSDKContext {
    private let fileManager: FileManager
    private var client: Client?
    private var syncService: SyncService?
    private var activeSessionKey: String?
    private var timelinesByRoomID: [String: Timeline] = [:]
    private var verificationController: SessionVerificationController?
    private var verificationDelegate: MatrixSDKVerificationDelegate?

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
    }

    func signIn(
        homeserver: String,
        username: String,
        password: String
    ) async throws -> MatrixSession {
        let storeID = UUID().uuidString.lowercased()
        let client = try await buildClient(homeserver: homeserver, storeID: storeID)
        try await client.login(
            username: username,
            password: password,
            initialDeviceName: "MatrixMess iPhone",
            deviceId: nil
        )
        try await attach(client: client, sessionKey: storeID)
        await client.encryption().waitForE2eeInitializationTasks()
        return matrixSession(from: try client.session(), storeID: storeID)
    }

    func restoreSession(_ session: MatrixSession) async throws -> MatrixSession {
        let sdkSession = sdkSession(from: session)
        let storeID = session.sdkStoreID ?? stableStoreID(for: session)
        let client = try await buildClient(homeserver: session.homeserver, storeID: storeID)
        try await client.restoreSession(session: sdkSession)
        try await attach(client: client, sessionKey: sessionKey(for: session, storeID: storeID))
        await client.encryption().waitForE2eeInitializationTasks()
        return matrixSession(from: try client.session(), storeID: storeID)
    }

    func currentCryptoStatus(session: MatrixSession?) async -> MatrixCryptoStatus {
        guard let session else {
            return MatrixCryptoStatus(
                encryptionAvailable: false,
                keyBackupConfigured: false,
                deviceVerificationAvailable: false,
                recoveryStateLabel: "Keine Session",
                backupStateLabel: "Keine Session",
                verificationStateLabel: "Keine Session"
            )
        }

        do {
            let client = try await ensureClient(for: session)
            let encryption = client.encryption()
            await encryption.waitForE2eeInitializationTasks()

            let backupState = encryption.backupState()
            let recoveryState = encryption.recoveryState()
            let verificationState = encryption.verificationState()
            let hasDevices = (try? await encryption.hasDevicesToVerifyAgainst()) ?? false

            return MatrixCryptoStatus(
                encryptionAvailable: true,
                keyBackupConfigured: backupState == .enabled || recoveryState == .enabled,
                deviceVerificationAvailable: hasDevices || verificationState != .unknown,
                recoveryStateLabel: label(for: recoveryState),
                backupStateLabel: label(for: backupState),
                verificationStateLabel: label(for: verificationState)
            )
        } catch {
            AppLogger.error("SDK-Crypto-Status konnte nicht geladen werden: \(error.localizedDescription)")
            return MatrixCryptoStatus(
                encryptionAvailable: false,
                keyBackupConfigured: false,
                deviceVerificationAvailable: false,
                recoveryStateLabel: "Fehler",
                backupStateLabel: "Fehler",
                verificationStateLabel: "Fehler"
            )
        }
    }

    func prepareEncryptedSession(for session: MatrixSession) async throws {
        let client = try await ensureClient(for: session)
        let encryption = client.encryption()
        await encryption.waitForE2eeInitializationTasks()

        if encryption.backupState() == .unknown, !(try await encryption.backupExistsOnServer()) {
            try await encryption.enableBackups()
        }
    }

    func recover(session: MatrixSession, recoveryKey: String) async throws -> MatrixCryptoStatus {
        let client = try await ensureClient(for: session)
        let encryption = client.encryption()
        try await encryption.recover(recoveryKey: recoveryKey)
        await encryption.waitForE2eeInitializationTasks()
        return await currentCryptoStatus(session: session)
    }

    func requestDeviceVerification(session: MatrixSession) async throws {
        let client = try await ensureClient(for: session)
        let controller = try await client.getSessionVerificationController()
        let delegate = MatrixSDKVerificationDelegate()
        controller.setDelegate(delegate: delegate)
        verificationDelegate = delegate
        verificationController = controller
        try await controller.requestDeviceVerification()
    }

    func sendMessage(
        _ text: String,
        roomID: String,
        session: MatrixSession
    ) async throws -> String? {
        let timeline = try await ensureTimeline(roomID: roomID, session: session)
        let message = messageEventContentFromMarkdown(md: text)
        _ = try await timeline.send(msg: message)
        return nil
    }

    func toggleReaction(
        _ emoji: String,
        roomID: String,
        targetEventID: String,
        session: MatrixSession
    ) async throws -> Bool {
        let timeline = try await ensureTimeline(roomID: roomID, session: session)
        return try await timeline.toggleReaction(
            itemId: .eventId(eventId: targetEventID),
            key: emoji
        )
    }

    func editMessage(
        _ text: String,
        roomID: String,
        targetEventID: String,
        session: MatrixSession
    ) async throws {
        let room = try await ensureRoom(roomID: roomID, session: session)
        try await room.edit(
            eventId: targetEventID,
            newContent: messageEventContentFromMarkdown(md: text)
        )
    }

    func redactMessage(
        roomID: String,
        targetEventID: String,
        reason: String?,
        session: MatrixSession
    ) async throws {
        let room = try await ensureRoom(roomID: roomID, session: session)
        try await room.redact(eventId: targetEventID, reason: reason)
    }

    func sendMedia(
        data: Data,
        mimeType: String,
        fileName: String,
        kind: ChatMessageKind,
        roomID: String,
        session: MatrixSession
    ) async throws -> MatrixSDKMediaSendResult {
        let timeline = try await ensureTimeline(roomID: roomID, session: session)
        let uploadSource = UploadSource.data(bytes: data, filename: fileName)
        let uploadParameters = UploadParameters(
            source: uploadSource,
            caption: nil,
            formattedCaption: nil,
            mentions: nil,
            inReplyTo: nil
        )

        switch kind {
        case .image:
            let info = ImageInfo(
                height: nil,
                width: nil,
                mimetype: mimeType,
                size: UInt64(data.count),
                thumbnailInfo: nil,
                thumbnailSource: nil,
                blurhash: nil,
                isAnimated: nil
            )
            let joinHandle = try timeline.sendImage(params: uploadParameters, thumbnailSource: nil, imageInfo: info)
            try await joinHandle.join()
        case .video:
            let info = VideoInfo(
                duration: nil,
                height: nil,
                width: nil,
                mimetype: mimeType,
                size: UInt64(data.count),
                thumbnailInfo: nil,
                thumbnailSource: nil,
                blurhash: nil
            )
            let joinHandle = try timeline.sendVideo(params: uploadParameters, thumbnailSource: nil, videoInfo: info)
            try await joinHandle.join()
        case .voice:
            let info = AudioInfo(duration: nil, size: UInt64(data.count), mimetype: mimeType)
            let joinHandle = try timeline.sendVoiceMessage(params: uploadParameters, audioInfo: info, waveform: [])
            try await joinHandle.join()
        case .file:
            let info = FileInfo(
                mimetype: mimeType,
                size: UInt64(data.count),
                thumbnailInfo: nil,
                thumbnailSource: nil
            )
            let joinHandle = try timeline.sendFile(params: uploadParameters, fileInfo: info)
            try await joinHandle.join()
        case .text, .event:
            let message = messageEventContentFromMarkdown(md: fileName)
            _ = try await timeline.send(msg: message)
        }

        let localCachePath = try persistOutgoingMedia(data: data, fileName: fileName)
        let attachment = MessageAttachment(
            icon: icon(for: kind),
            title: fileName,
            subtitle: "\(mimeType) / \(ByteCountFormatter.string(fromByteCount: Int64(data.count), countStyle: .file))",
            contentURI: nil,
            mimeType: mimeType,
            localCachePath: localCachePath.path,
            fileSize: data.count
        )

        return MatrixSDKMediaSendResult(matrixEventID: nil, attachment: attachment)
    }

    nonisolated func mediaDownloadURL(contentURI: String, session: MatrixSession) -> URL? {
        guard contentURI.hasPrefix("mxc://"),
              let homeserver = URL(string: session.homeserver) else {
            return nil
        }

        let raw = String(contentURI.dropFirst("mxc://".count))
        let parts = raw.split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }

        var components = URLComponents(url: homeserver, resolvingAgainstBaseURL: false)
        components?.path = "/_matrix/media/v3/download/\(parts[0])/\(parts[1])"
        return components?.url
    }

    func currentVerificationFlowState() -> MatrixVerificationFlowState {
        verificationDelegate?.currentState ?? MatrixVerificationFlowState()
    }

    func startSasVerification(session: MatrixSession) async throws {
        guard let controller = verificationController else {
            throw MatrixServiceError.serverError("Kein aktiver Verifizierungsvorgang vorhanden.")
        }
        try await controller.startSasVerification()
    }

    func approveVerification(session: MatrixSession) async throws {
        guard let controller = verificationController else {
            throw MatrixServiceError.serverError("Kein aktiver Verifizierungsvorgang vorhanden.")
        }
        try await controller.approveVerification()
    }

    func declineVerification(session: MatrixSession) async throws {
        guard let controller = verificationController else {
            throw MatrixServiceError.serverError("Kein aktiver Verifizierungsvorgang vorhanden.")
        }
        try await controller.declineVerification()
    }

    func cancelVerification(session: MatrixSession) async throws {
        guard let controller = verificationController else {
            throw MatrixServiceError.serverError("Kein aktiver Verifizierungsvorgang vorhanden.")
        }
        try await controller.cancelVerification()
    }

    func stop() async {
        await syncService?.stop()
        syncService = nil
        client = nil
        activeSessionKey = nil
        timelinesByRoomID = [:]
        verificationController = nil
        verificationDelegate = nil
    }

    private func ensureClient(for session: MatrixSession) async throws -> Client {
        let sessionKey = self.sessionKey(for: session, storeID: session.sdkStoreID)
        if let client, activeSessionKey == sessionKey {
            return client
        }
        _ = try await restoreSession(session)
        guard let client else {
            throw MatrixServiceError.invalidStoredSession
        }
        return client
    }

    private func ensureRoom(roomID: String, session: MatrixSession) async throws -> Room {
        let client = try await ensureClient(for: session)
        guard let room = try client.getRoom(roomId: roomID) else {
            throw MatrixServiceError.serverError("Der Raum \(roomID) konnte in der SDK-Session nicht geladen werden.")
        }
        return room
    }

    private func ensureTimeline(roomID: String, session: MatrixSession) async throws -> Timeline {
        if let timeline = timelinesByRoomID[roomID] {
            return timeline
        }

        let room = try await ensureRoom(roomID: roomID, session: session)
        let timeline = try await room.timeline()
        timelinesByRoomID[roomID] = timeline
        return timeline
    }

    private func buildClient(homeserver: String, storeID: String) async throws -> Client {
        let sessionPaths = try makeSessionPaths(storeID: storeID)
        return try await ClientBuilder()
            .homeserverUrl(url: homeserver)
            .sessionPaths(
                dataPath: sessionPaths.data.path,
                cachePath: sessionPaths.cache.path
            )
            .autoEnableCrossSigning(autoEnableCrossSigning: true)
            .autoEnableBackups(autoEnableBackups: true)
            .threadsEnabled(enabled: true, threadSubscriptions: true)
            .slidingSyncVersionBuilder(versionBuilder: .discoverNative)
            .build()
    }

    private func attach(client: Client, sessionKey: String) async throws {
        if let syncService, activeSessionKey != sessionKey {
            await syncService.stop()
        }

        self.client = client
        self.activeSessionKey = sessionKey
        self.timelinesByRoomID = [:]
        let syncService = try await client.syncService().finish()
        self.syncService = syncService
        await syncService.start()
    }

    private func makeSessionPaths(storeID: String) throws -> (data: URL, cache: URL) {
        let appSupport = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let caches = try fileManager.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        let data = appSupport
            .appendingPathComponent("MatrixMessSDK", isDirectory: true)
            .appendingPathComponent(storeID, isDirectory: true)
            .appendingPathComponent("data", isDirectory: true)
        let cache = caches
            .appendingPathComponent("MatrixMessSDK", isDirectory: true)
            .appendingPathComponent(storeID, isDirectory: true)
            .appendingPathComponent("cache", isDirectory: true)

        try fileManager.createDirectory(at: data, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: cache, withIntermediateDirectories: true)
        return (data, cache)
    }

    private func persistOutgoingMedia(data: Data, fileName: String) throws -> URL {
        let caches = try fileManager.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let mediaFolder = caches.appendingPathComponent("MatrixMessMedia/Outgoing", isDirectory: true)
        try fileManager.createDirectory(at: mediaFolder, withIntermediateDirectories: true)
        let safeName = fileName.isEmpty ? UUID().uuidString : fileName
        let destination = mediaFolder.appendingPathComponent(safeName, isDirectory: false)
        try data.write(to: destination, options: .atomic)
        return destination
    }

    private func sdkSession(from session: MatrixSession) -> Session {
        Session(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            userId: session.userID,
            deviceId: session.deviceID,
            homeserverUrl: session.homeserver,
            oidcData: session.oidcData,
            slidingSyncVersion: .native
        )
    }

    private func matrixSession(from session: Session, storeID: String) -> MatrixSession {
        MatrixSession(
            userID: session.userId,
            homeserver: session.homeserverUrl,
            accessToken: session.accessToken,
            deviceID: session.deviceId,
            signedInAt: .now,
            syncToken: nil,
            refreshToken: session.refreshToken,
            oidcData: session.oidcData,
            sdkStoreID: storeID
        )
    }

    private func sessionKey(for session: MatrixSession, storeID: String?) -> String {
        "\(storeID ?? stableStoreID(for: session))::\(session.userID)::\(session.deviceID)"
    }

    private func stableStoreID(for session: MatrixSession) -> String {
        let source = "\(session.userID)|\(session.deviceID)|\(session.homeserver)"
        return source.unicodeScalars.map { String(format: "%02X", $0.value) }.joined()
    }

    private func icon(for kind: ChatMessageKind) -> String {
        switch kind {
        case .image: return "photo"
        case .video: return "video.fill"
        case .file: return "doc.fill"
        case .voice: return "waveform"
        case .text, .event: return "paperclip"
        }
    }

    private func label(for state: BackupState) -> String {
        switch state {
        case .unknown: return "Unbekannt"
        case .creating: return "Wird erstellt"
        case .enabling: return "Wird aktiviert"
        case .resuming: return "Wird fortgesetzt"
        case .enabled: return "Aktiv"
        case .downloading: return "Laedt herunter"
        case .disabling: return "Wird deaktiviert"
        }
    }

    private func label(for state: RecoveryState) -> String {
        switch state {
        case .unknown: return "Unbekannt"
        case .enabled: return "Aktiv"
        case .disabled: return "Deaktiviert"
        case .incomplete: return "Unvollstaendig"
        }
    }

    private func label(for state: VerificationState) -> String {
        switch state {
        case .unknown: return "Offen"
        case .verified: return "Verifiziert"
        case .unverified: return "Nicht verifiziert"
        }
    }
}

private final class MatrixSDKVerificationDelegate: SessionVerificationControllerDelegate, @unchecked Sendable {
    private let lock = NSLock()
    private var _state = MatrixVerificationFlowState()

    var currentState: MatrixVerificationFlowState {
        lock.lock()
        defer { lock.unlock() }
        return _state
    }

    private func updateState(_ update: (inout MatrixVerificationFlowState) -> Void) {
        lock.lock()
        update(&_state)
        lock.unlock()
    }

    func didReceiveVerificationRequest(details: SessionVerificationRequestDetails) {
        updateState { state in
            state.senderUserID = details.senderProfile.userId
            state.deviceID = details.deviceId
            state.flowID = details.flowId
            state.statusLabel = "Verifizierungsanfrage erhalten"
            state.canStartSas = true
            state.canDecline = true
            state.canCancel = true
        }
        AppLogger.info("Verifizierungsanfrage von \(details.senderProfile.userId) fuer Device \(details.deviceId) erhalten.")
    }

    func didAcceptVerificationRequest() {
        updateState { state in
            state.statusLabel = "Verifizierung akzeptiert"
            state.canStartSas = true
        }
        AppLogger.info("Verifizierungsanfrage akzeptiert.")
    }

    func didStartSasVerification() {
        updateState { state in
            state.statusLabel = "SAS-Verifizierung laeuft"
            state.canStartSas = false
        }
        AppLogger.info("SAS-Verifizierung gestartet.")
    }

    func didReceiveVerificationData(data: SessionVerificationData) {
        updateState { state in
            switch data {
            case .emojis(let emojis):
                state.emojis = emojis.map { MatrixVerificationEmoji(symbol: $0.symbol, description: $0.description) }
            case .decimals(let values):
                state.decimals = values
            }
            state.statusLabel = "Bitte vergleiche die Daten"
            state.canApprove = true
            state.canDecline = true
            state.canCancel = true
        }
        AppLogger.info("Verifizierungsdaten empfangen: \(String(describing: data))")
    }

    func didFail() {
        updateState { state in
            state.statusLabel = "Verifizierung fehlgeschlagen"
            state.canApprove = false
            state.canDecline = false
            state.canStartSas = false
            state.canCancel = false
        }
        AppLogger.error("Geraeteverifizierung fehlgeschlagen.")
    }

    func didCancel() {
        updateState { state in
            state.statusLabel = "Verifizierung abgebrochen"
            state.canApprove = false
            state.canDecline = false
            state.canStartSas = false
            state.canCancel = false
        }
        AppLogger.info("Geraeteverifizierung abgebrochen.")
    }

    func didFinish() {
        updateState { state in
            state.statusLabel = "Verifizierung abgeschlossen"
            state.isVerified = true
            state.canApprove = false
            state.canDecline = false
            state.canStartSas = false
            state.canCancel = false
        }
        AppLogger.info("Geraeteverifizierung abgeschlossen.")
    }
}
