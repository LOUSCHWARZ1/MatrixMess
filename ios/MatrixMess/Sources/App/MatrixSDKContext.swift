import Foundation
import MatrixRustSDK
import UniformTypeIdentifiers

private let sdkEncryptedMessagePlaceholder = "Verschluesselte Nachricht"

struct MatrixSDKMediaSendResult {
    let matrixEventID: String?
    let attachment: MessageAttachment
}

struct MatrixSDKTimelineFetchResult {
    let messages: [ChatMessage]
    let hitTimelineStart: Bool
}

actor MatrixSDKContext {
    private struct TimelineState {
        let timeline: Timeline
        let listener: MatrixSDKTimelineListener
        let listenerHandle: TaskHandle
        let paginationListener: MatrixSDKPaginationStatusListener?
        let paginationHandle: TaskHandle?
        var items: [TimelineItem]
        var hasLoadedInitialItems: Bool
        var isPaginatingBackwards: Bool
        var hitTimelineStart: Bool
    }

    private let fileManager: FileManager
    private let keychain: KeychainStore
    private var client: Client?
    private var syncService: SyncService?
    private var activeSessionKey: String?
    private var timelineStatesByRoomID: [String: TimelineState] = [:]
    private var verificationController: SessionVerificationController?
    private var verificationDelegate: MatrixSDKVerificationDelegate?
    private var verificationFlowState = MatrixVerificationFlowState()

    init(fileManager: FileManager = .default, keychain: KeychainStore = KeychainStore()) {
        self.fileManager = fileManager
        self.keychain = keychain
    }

    func signIn(
        homeserver: String,
        username: String,
        password: String
    ) async throws -> MatrixSession {
        let storeID = stableStoreID(homeserver: homeserver, username: username)
        let preferredDeviceID = stableDeviceID()
        let client = try await buildClient(homeserver: homeserver, storeID: storeID)
        try await client.login(
            username: username,
            password: password,
            initialDeviceName: "MatrixMess iPhone",
            deviceId: preferredDeviceID
        )
        try await attach(client: client, sessionKey: storeID)
        await client.encryption().waitForE2eeInitializationTasks()
        let session = try client.session()
        persistStableDeviceID(session.deviceId)
        return matrixSession(from: session, storeID: storeID)
    }

    func restoreSession(_ session: MatrixSession) async throws -> MatrixSession {
        let sdkSession = sdkSession(from: session)
        let storeID = session.sdkStoreID ?? stableStoreID(for: session)
        let client = try await buildClient(homeserver: session.homeserver, storeID: storeID)
        try await client.restoreSession(session: sdkSession)
        try await attach(client: client, sessionKey: sessionKey(for: session, storeID: storeID))
        await client.encryption().waitForE2eeInitializationTasks()
        let restoredSession = try client.session()
        persistStableDeviceID(restoredSession.deviceId)
        return matrixSession(from: restoredSession, storeID: storeID)
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

    func currentVerificationFlowState() -> MatrixVerificationFlowState {
        verificationFlowState
    }

    func updateVerificationFlowState(_ state: MatrixVerificationFlowState) {
        verificationFlowState = state
    }

    func requestDeviceVerification(session: MatrixSession) async throws {
        let client = try await ensureClient(for: session)
        let controller = try await client.getSessionVerificationController()
        let delegate = MatrixSDKVerificationDelegate { [weak self] newState in
            Task {
                await self?.updateVerificationFlowState(newState)
            }
        }
        controller.setDelegate(delegate: delegate)
        verificationDelegate = delegate
        verificationController = controller
        var state = MatrixVerificationFlowState()
        state.statusLabel = "Verifizierungsanfrage wird gesendet ..."
        state.canCancel = true
        verificationFlowState = state
        try await controller.requestDeviceVerification()
    }

    func startSasVerification(session: MatrixSession) async throws {
        guard let controller = verificationController else {
            throw MatrixServiceError.serverError("Kein aktiver Verifizierungsvorgang.")
        }
        try await controller.startSasVerification()
    }

    func approveVerification(session: MatrixSession) async throws {
        guard let controller = verificationController else {
            throw MatrixServiceError.serverError("Kein aktiver Verifizierungsvorgang.")
        }
        try await controller.approveVerification()
    }

    func declineVerification(session: MatrixSession) async throws {
        guard let controller = verificationController else {
            throw MatrixServiceError.serverError("Kein aktiver Verifizierungsvorgang.")
        }
        try await controller.declineVerification()
    }

    func cancelVerification(session: MatrixSession) async throws {
        if let controller = verificationController {
            try await controller.cancelVerification()
        }
        // The delegate's didCancel() callback will update the state with isCancelled = true.
        // If no controller exists, reset the state directly.
        if verificationController == nil {
            verificationFlowState = MatrixVerificationFlowState()
        }
    }

    func timelineMessages(
        roomID: String,
        session: MatrixSession,
        minimumMessageCount: Int = 0,
        backPaginationBatchSize: UInt16 = 40
    ) async throws -> MatrixSDKTimelineFetchResult {
        let timeline = try await ensureTimeline(roomID: roomID, session: session)
        await waitForInitialTimelineLoad(roomID: roomID)

        if minimumMessageCount > 0 {
            try await paginateBackwardsIfNeeded(
                timeline: timeline,
                roomID: roomID,
                minimumMessageCount: minimumMessageCount,
                batchSize: backPaginationBatchSize
            )
        }

        let messages = timelineMessagesFromState(roomID: roomID, currentUserID: session.userID)
        let hitTimelineStart = timelineStatesByRoomID[roomID]?.hitTimelineStart ?? false
        return MatrixSDKTimelineFetchResult(messages: messages, hitTimelineStart: hitTimelineStart)
    }

    func sendMessage(
        _ text: String,
        roomID: String,
        session: MatrixSession
    ) async throws -> String? {
        let message = messageEventContentFromMarkdown(md: text)
        do {
            let timeline = try await ensureTimeline(roomID: roomID, session: session)
            _ = try await timeline.send(msg: message)
        } catch {
            // Timeline handles can become stale after reconnects or backgrounding.
            // Drop cached timeline once and retry with a fresh handle.
            removeTimelineState(for: roomID)
            let retryTimeline = try await ensureTimeline(roomID: roomID, session: session)
            _ = try await retryTimeline.send(msg: message)
        }
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
        session: MatrixSession,
        durationSeconds: TimeInterval? = nil
    ) async throws -> MatrixSDKMediaSendResult {
        let timeline: Timeline
        do {
            timeline = try await ensureTimeline(roomID: roomID, session: session)
        } catch {
            removeTimelineState(for: roomID)
            timeline = try await ensureTimeline(roomID: roomID, session: session)
        }
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
            let duration = durationSeconds.flatMap { $0 > 0 ? $0 : nil }
            let info = AudioInfo(duration: duration, size: UInt64(data.count), mimetype: mimeType)
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
        let subtitle = attachmentSubtitle(
            mimeType: mimeType,
            byteCount: data.count,
            kind: kind,
            durationSeconds: durationSeconds
        )
        let attachment = MessageAttachment(
            icon: icon(for: kind),
            title: fileName,
            subtitle: subtitle,
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
        components?.path = combinedPath(
            basePath: homeserver.path,
            endpointPath: "/_matrix/media/v3/download/\(encodedPathSegment(parts[0]))/\(encodedPathSegment(parts[1]))"
        )
        components?.queryItems = [URLQueryItem(name: "access_token", value: session.accessToken)]
        return components?.url
    }

    func downloadMedia(
        contentURI: String,
        mediaSourceJSON: String?,
        session: MatrixSession,
        fileNameHint: String?,
        mimeTypeHint: String?
    ) async throws -> URL {
        let client = try await ensureClient(for: session)
        let mediaSource = try resolvedMediaSource(contentURI: contentURI, mediaSourceJSON: mediaSourceJSON)
        let data = try await client.getMediaContent(mediaSource: mediaSource)
        return try persistDownloadedMedia(
            data: data,
            contentURI: contentURI,
            fileNameHint: fileNameHint,
            mimeTypeHint: mimeTypeHint
        )
    }

    func stop() async {
        cancelAllTimelineStates()
        await syncService?.stop()
        syncService = nil
        client = nil
        activeSessionKey = nil
        verificationController = nil
        verificationDelegate = nil
        verificationFlowState = MatrixVerificationFlowState()
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
        if let state = timelineStatesByRoomID[roomID] {
            return state.timeline
        }

        let room = try await ensureRoom(roomID: roomID, session: session)
        let timeline = try await room.timeline()
        let listener = MatrixSDKTimelineListener { [weak self] diffs in
            guard let self else { return }
            Task {
                await self.applyTimelineDiffs(diffs, roomID: roomID)
            }
        }
        let listenerHandle = await timeline.addListener(listener: listener)
        let paginationListener = MatrixSDKPaginationStatusListener { [weak self] status in
            guard let self else { return }
            Task {
                await self.updatePaginationStatus(status, roomID: roomID)
            }
        }
        let paginationHandle = try? await timeline.subscribeToBackPaginationStatus(listener: paginationListener)

        timelineStatesByRoomID[roomID] = TimelineState(
            timeline: timeline,
            listener: listener,
            listenerHandle: listenerHandle,
            paginationListener: paginationHandle == nil ? nil : paginationListener,
            paginationHandle: paginationHandle,
            items: [],
            hasLoadedInitialItems: false,
            isPaginatingBackwards: false,
            hitTimelineStart: false
        )
        return timeline
    }

    private func waitForInitialTimelineLoad(roomID: String) async {
        let maxAttempts = 24
        for _ in 0..<maxAttempts {
            if timelineStatesByRoomID[roomID]?.hasLoadedInitialItems == true {
                return
            }
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    private func paginateBackwardsIfNeeded(
        timeline: Timeline,
        roomID: String,
        minimumMessageCount: Int,
        batchSize: UInt16
    ) async throws {
        guard minimumMessageCount > 0 else { return }
        var attempts = 0
        var previousCount = timelineEventCount(roomID: roomID)

        while previousCount < minimumMessageCount {
            if timelineStatesByRoomID[roomID]?.hitTimelineStart == true {
                break
            }
            attempts += 1
            if attempts > 30 {
                break
            }

            let reachedTimelineStart = try await timeline.paginateBackwards(numEvents: batchSize)
            if reachedTimelineStart, var state = timelineStatesByRoomID[roomID] {
                state.hitTimelineStart = true
                timelineStatesByRoomID[roomID] = state
            }

            // Give the timeline listener a short moment to apply incoming diffs.
            try? await Task.sleep(nanoseconds: 120_000_000)

            let currentCount = timelineEventCount(roomID: roomID)
            if currentCount <= previousCount && !reachedTimelineStart {
                break
            }
            previousCount = currentCount
        }
    }

    private func timelineEventCount(roomID: String) -> Int {
        guard let state = timelineStatesByRoomID[roomID] else { return 0 }
        return state.items.reduce(0) { partialResult, item in
            partialResult + (item.asEvent() == nil ? 0 : 1)
        }
    }

    private func applyTimelineDiffs(_ diffs: [TimelineDiff], roomID: String) {
        guard var state = timelineStatesByRoomID[roomID] else { return }

        for diff in diffs {
            switch diff {
            case .append(let values):
                state.items.append(contentsOf: values)
            case .clear:
                state.items.removeAll(keepingCapacity: true)
            case .pushFront(let value):
                state.items.insert(value, at: 0)
            case .pushBack(let value):
                state.items.append(value)
            case .popFront:
                if !state.items.isEmpty {
                    state.items.removeFirst()
                }
            case .popBack:
                if !state.items.isEmpty {
                    state.items.removeLast()
                }
            case .insert(let index, let value):
                let insertIndex = min(Int(index), state.items.count)
                state.items.insert(value, at: insertIndex)
            case .set(let index, let value):
                let setIndex = Int(index)
                guard setIndex >= 0 else { continue }
                if setIndex < state.items.count {
                    state.items[setIndex] = value
                } else if setIndex == state.items.count {
                    state.items.append(value)
                }
            case .remove(let index):
                let removeIndex = Int(index)
                if removeIndex >= 0, removeIndex < state.items.count {
                    state.items.remove(at: removeIndex)
                }
            case .truncate(let length):
                let targetLength = Int(length)
                if targetLength >= 0, targetLength < state.items.count {
                    state.items.removeSubrange(targetLength..<state.items.count)
                }
            case .reset(let values):
                state.items = values
            }
        }

        state.hasLoadedInitialItems = true
        timelineStatesByRoomID[roomID] = state
    }

    private func updatePaginationStatus(_ status: RoomPaginationStatus, roomID: String) {
        guard var state = timelineStatesByRoomID[roomID] else { return }
        switch status {
        case .idle(let hitTimelineStart):
            state.isPaginatingBackwards = false
            state.hitTimelineStart = hitTimelineStart
        case .paginating:
            state.isPaginatingBackwards = true
        }
        timelineStatesByRoomID[roomID] = state
    }

    private func removeTimelineState(for roomID: String) {
        guard let state = timelineStatesByRoomID.removeValue(forKey: roomID) else { return }
        state.listenerHandle.cancel()
        state.paginationHandle?.cancel()
    }

    private func cancelAllTimelineStates() {
        for state in timelineStatesByRoomID.values {
            state.listenerHandle.cancel()
            state.paginationHandle?.cancel()
        }
        timelineStatesByRoomID = [:]
    }

    private func timelineMessagesFromState(roomID: String, currentUserID: String) -> [ChatMessage] {
        guard let state = timelineStatesByRoomID[roomID] else { return [] }

        var messages: [ChatMessage] = state.items.compactMap { item in
            guard let event = item.asEvent() else { return nil }
            return chatMessage(from: event, currentUserID: currentUserID)
        }

        // Keep only one entry per event ID; keep latest version.
        var latestIndexByEventID: [String: Int] = [:]
        for (index, message) in messages.enumerated() {
            if let eventID = message.matrixEventID {
                latestIndexByEventID[eventID] = index
            }
        }
        if !latestIndexByEventID.isEmpty {
            messages = messages.enumerated().filter { index, message in
                guard let eventID = message.matrixEventID else { return true }
                return latestIndexByEventID[eventID] == index
            }.map(\.element)
        }

        return messages.sorted { $0.timestamp < $1.timestamp }
    }

    private func chatMessage(from item: EventTimelineItem, currentUserID: String) -> ChatMessage? {
        let senderDisplayName = MatrixDisplayNameResolver.sanitizedDisplayName(
            profileDisplayName(item.senderProfile),
            fallbackUserID: item.sender
        )
        // Use the sender MXID as the primary source of truth for direction.
        // Relying on item.isOwn can misclassify messages in some edge cases.
        let isOutgoing = isCurrentUserID(item.sender, currentUserID: currentUserID)
        let timestamp = Date(timeIntervalSince1970: TimeInterval(item.timestamp) / 1000)

        var matrixEventID: String?
        switch item.eventOrTransactionId {
        case .eventId(eventId: let eventId):
            matrixEventID = eventId
        case .transactionId(transactionId: _):
            matrixEventID = nil
        }

        var message = ChatMessage(
            matrixEventID: matrixEventID,
            senderDisplayName: senderDisplayName,
            body: "",
            timestamp: timestamp,
            isOutgoing: isOutgoing,
            kind: .text
        )

        if let localSendState = item.localSendState {
            message.isOutgoing = true
            switch localSendState {
            case .notSentYet(progress: _):
                message.sendStatus = .sending
                message.isPending = true
            case .sendingFailed(error: _, isRecoverable: _):
                message.sendStatus = .failed
                message.isPending = false
            case .sent(eventId: let eventId):
                message.matrixEventID = eventId
                message.sendStatus = .sent
                message.isPending = false
            }
        } else if isOutgoing {
            message.sendStatus = .sent
            message.isPending = false
        }

        switch item.content {
        case .msgLike(content: let msgLike):
            applyMessageLikeContent(msgLike, to: &message, currentUserID: currentUserID)
        case .roomMembership(userId: _, userDisplayName: let userDisplayName, change: let change, reason: _):
            let actor = MatrixDisplayNameResolver.sanitizedDisplayName(userDisplayName, fallbackUserID: item.sender)
            message.body = membershipEventText(actor: actor, change: change)
            message.kind = .text
        case .profileChange(displayName: let displayName, prevDisplayName: _, avatarUrl: _, prevAvatarUrl: _):
            if let displayName, !displayName.isEmpty {
                let sanitized = MatrixDisplayNameResolver.sanitizedDisplayName(displayName, fallbackUserID: item.sender)
                message.body = "\(senderDisplayName) nutzt jetzt den Namen \(sanitized)."
            } else {
                message.body = "\(senderDisplayName) hat das Profil aktualisiert."
            }
            message.kind = .text
        case .state(stateKey: let stateKey, content: _):
            message.body = "Status-Update: \(stateKey)"
            message.kind = .text
        case .failedToParseMessageLike(eventType: let eventType, error: _):
            message.body = "Nicht unterstuetztes Event: \(eventType)"
            message.kind = .text
        case .failedToParseState(eventType: let eventType, stateKey: _, error: _):
            message.body = "Nicht unterstuetztes State-Event: \(eventType)"
            message.kind = .text
        case .callInvite, .rtcNotification:
            return nil
        }

        if message.body.isEmpty {
            message.body = message.attachment?.title ?? ""
        }
        return message
    }

    private func applyMessageLikeContent(
        _ content: MsgLikeContent,
        to message: inout ChatMessage,
        currentUserID: String
    ) {
        message.reactions = content.reactions.map { reaction in
            MessageReaction(
                emoji: reaction.key,
                count: max(1, reaction.senders.count),
                isOwnReaction: reaction.senders.contains {
                    isCurrentUserID($0.senderId, currentUserID: currentUserID)
                }
            )
        }

        switch content.kind {
        case .message(content: let messageContent):
            message.body = messageContent.body
            message.isEdited = messageContent.isEdited

            switch messageContent.msgType {
            case .text(content: let text):
                message.kind = .text
                message.body = text.body
            case .notice(content: let notice):
                message.kind = .text
                message.body = notice.body
            case .emote(content: let emote):
                message.kind = .text
                message.body = emote.body
            case .image(content: let image):
                message.kind = .image
                message.body = image.caption ?? message.body
                message.attachment = attachment(
                    icon: "photo",
                    title: image.filename,
                    mimeType: image.info?.mimetype,
                    size: image.info?.size,
                    mediaSource: image.source,
                    fallbackSubtitle: "Bild"
                )
            case .video(content: let video):
                message.kind = .video
                message.body = video.caption ?? message.body
                message.attachment = attachment(
                    icon: "video.fill",
                    title: video.filename,
                    mimeType: video.info?.mimetype,
                    size: video.info?.size,
                    mediaSource: video.source,
                    fallbackSubtitle: "Video"
                )
            case .audio(content: let audio):
                message.kind = .voice
                message.body = audio.caption ?? message.body
                message.attachment = attachment(
                    icon: "waveform",
                    title: audio.filename.isEmpty ? "Sprachnachricht" : audio.filename,
                    mimeType: audio.info?.mimetype,
                    size: audio.info?.size,
                    mediaSource: audio.source,
                    durationSeconds: audio.info?.duration,
                    fallbackSubtitle: "Audio"
                )
            case .file(content: let file):
                message.kind = .file
                message.body = file.caption ?? message.body
                message.attachment = attachment(
                    icon: "doc.fill",
                    title: file.filename,
                    mimeType: file.info?.mimetype,
                    size: file.info?.size,
                    mediaSource: file.source,
                    fallbackSubtitle: "Datei"
                )
            case .other(msgtype: _, body: let body):
                message.kind = .text
                message.body = body
            case .gallery(content: _), .location(content: _):
                message.kind = .text
            }
        case .sticker(body: let body, info: let info, source: let source):
            message.kind = .image
            message.body = body
            message.attachment = attachment(
                icon: "photo",
                title: body.isEmpty ? "Sticker" : body,
                mimeType: info.mimetype,
                size: info.size,
                mediaSource: source,
                fallbackSubtitle: "Sticker"
            )
        case .poll(question: let question, kind: _, maxSelections: _, answers: _, votes: _, endTime: _, hasBeenEdited: _):
            message.kind = .text
            message.body = "Umfrage: \(question)"
        case .redacted:
            message.kind = .text
            message.body = "Nachricht entfernt."
            message.attachment = nil
        case .unableToDecrypt(msg: _):
            message.kind = .text
            message.body = sdkEncryptedMessagePlaceholder
            message.attachment = nil
        case .other(eventType: let eventType):
            message.kind = .text
            message.body = "Event: \(eventType)"
        }
    }

    private func attachment(
        icon: String,
        title: String,
        mimeType: String?,
        size: UInt64?,
        mediaSource: MediaSource?,
        durationSeconds: TimeInterval? = nil,
        fallbackSubtitle: String
    ) -> MessageAttachment {
        let contentURI = mediaSource.flatMap(mediaSourceURL(_:))
        let sourceJSON = mediaSource.flatMap(mediaSourceJSON(_:))
        let subtitle: String
        if let durationSeconds, durationSeconds > 0 {
            let durationText = formattedDuration(seconds: durationSeconds)
            if let mimeType {
                subtitle = "\(durationText) / \(mimeType)"
            } else {
                subtitle = durationText
            }
        } else if let mimeType {
            if let size, let intSize = safeInt(size) {
                subtitle = "\(mimeType) / \(ByteCountFormatter.string(fromByteCount: Int64(intSize), countStyle: .file))"
            } else {
                subtitle = mimeType
            }
        } else {
            subtitle = fallbackSubtitle
        }

        return MessageAttachment(
            icon: icon,
            title: title,
            subtitle: subtitle,
            contentURI: contentURI,
            mediaSourceJSON: sourceJSON,
            mimeType: mimeType,
            localCachePath: nil,
            fileSize: size.flatMap(safeInt)
        )
    }

    private func safeInt(_ value: UInt64) -> Int? {
        value > UInt64(Int.max) ? nil : Int(value)
    }

    private func attachmentSubtitle(
        mimeType: String,
        byteCount: Int,
        kind: ChatMessageKind,
        durationSeconds: TimeInterval?
    ) -> String {
        if kind == .voice, let durationSeconds, durationSeconds > 0 {
            return "\(formattedDuration(seconds: durationSeconds)) / \(ByteCountFormatter.string(fromByteCount: Int64(byteCount), countStyle: .file))"
        }
        return "\(mimeType) / \(ByteCountFormatter.string(fromByteCount: Int64(byteCount), countStyle: .file))"
    }

    private func formattedDuration(seconds value: TimeInterval) -> String {
        let totalSeconds = max(0, Int(value.rounded()))
        let minutes = totalSeconds / 60
        let secondPart = totalSeconds % 60
        return String(format: "%02d:%02d", minutes, secondPart)
    }

    private func mediaSourceURL(_ source: MediaSource) -> String? {
        let raw = source.url().trimmingCharacters(in: .whitespacesAndNewlines)
        return raw.isEmpty ? nil : raw
    }

    private func mediaSourceJSON(_ source: MediaSource) -> String? {
        let raw = source.toJson().trimmingCharacters(in: .whitespacesAndNewlines)
        return raw.isEmpty ? nil : raw
    }

    private func profileDisplayName(_ details: ProfileDetails) -> String? {
        switch details {
        case .ready(displayName: let displayName, displayNameAmbiguous: _, avatarUrl: _):
            return MatrixDisplayNameResolver.sanitizedDisplayName(displayName)
        default:
            return nil
        }
    }

    private func isCurrentUserID(_ senderID: String, currentUserID: String) -> Bool {
        senderID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            == currentUserID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    nonisolated private func encodedPathSegment(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#[]@")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    nonisolated private func combinedPath(basePath: String, endpointPath: String) -> String {
        let cleanBase = basePath == "/" ? "" : basePath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let cleanEndpoint = endpointPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        if cleanBase.isEmpty {
            return "/" + cleanEndpoint
        }
        if cleanEndpoint.isEmpty {
            return "/" + cleanBase
        }
        return "/" + cleanBase + "/" + cleanEndpoint
    }

    private func membershipEventText(actor: String, change: MembershipChange?) -> String {
        guard let change else {
            return "\(actor) hat den Raum aktualisiert."
        }

        switch change {
        case .joined:
            return "\(actor) ist beigetreten."
        case .left:
            return "\(actor) hat den Raum verlassen."
        case .invited:
            return "\(actor) wurde eingeladen."
        case .invitationAccepted:
            return "\(actor) hat die Einladung angenommen."
        case .invitationRejected:
            return "\(actor) hat die Einladung abgelehnt."
        case .invitationRevoked:
            return "Einladung fuer \(actor) wurde widerrufen."
        case .kicked:
            return "\(actor) wurde entfernt."
        case .banned:
            return "\(actor) wurde gebannt."
        case .unbanned:
            return "\(actor) wurde entbannt."
        case .kickedAndBanned:
            return "\(actor) wurde entfernt und gebannt."
        case .knocked:
            return "\(actor) moechte beitreten."
        case .knockAccepted:
            return "Beitrittsanfrage von \(actor) wurde akzeptiert."
        case .knockRetracted:
            return "\(actor) hat die Beitrittsanfrage zurueckgezogen."
        case .knockDenied:
            return "Beitrittsanfrage von \(actor) wurde abgelehnt."
        case .none, .error, .notImplemented:
            return "\(actor) hat den Raum aktualisiert."
        }
    }

    private func buildClient(homeserver: String, storeID: String) async throws -> Client {
        let sessionPaths = try makeSessionPaths(storeID: storeID)
        let builders: [SlidingSyncVersionBuilder] = [.discoverNative, .native, .none]
        var lastError: Error?

        for builder in builders {
            do {
                return try await buildClient(
                    homeserver: homeserver,
                    sessionPaths: sessionPaths,
                    versionBuilder: builder
                )
            } catch {
                lastError = error
                AppLogger.error(
                    "ClientBuilder mit SlidingSync \(String(describing: builder)) fehlgeschlagen: \(error.localizedDescription)"
                )
            }
        }

        throw lastError ?? MatrixServiceError.serverError("Der Matrix-Client konnte nicht initialisiert werden.")
    }

    private func buildClient(
        homeserver: String,
        sessionPaths: (data: URL, cache: URL),
        versionBuilder: SlidingSyncVersionBuilder
    ) async throws -> Client {
        try await ClientBuilder()
            .homeserverUrl(url: homeserver)
            .sessionPaths(
                dataPath: sessionPaths.data.path,
                cachePath: sessionPaths.cache.path
            )
            .requestConfig(config: .init(
                retryLimit: 3,
                timeout: 30_000,
                maxConcurrentRequests: nil,
                maxRetryTime: 60_000
            ))
            .autoEnableCrossSigning(autoEnableCrossSigning: true)
            .autoEnableBackups(autoEnableBackups: true)
            .threadsEnabled(enabled: true, threadSubscriptions: true)
            .slidingSyncVersionBuilder(versionBuilder: versionBuilder)
            .build()
    }

    private func attach(client: Client, sessionKey: String) async throws {
        if activeSessionKey != sessionKey {
            cancelAllTimelineStates()
        }
        if let syncService, activeSessionKey != sessionKey {
            await syncService.stop()
        }

        self.client = client
        self.activeSessionKey = sessionKey
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

    private func persistDownloadedMedia(
        data: Data,
        contentURI: String,
        fileNameHint: String?,
        mimeTypeHint: String?
    ) throws -> URL {
        let caches = try fileManager.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let mediaFolder = caches.appendingPathComponent("MatrixMessMedia/IncomingSDK", isDirectory: true)
        try fileManager.createDirectory(at: mediaFolder, withIntermediateDirectories: true)

        let parsed = try parseMXC(contentURI)
        let roomFolder = mediaFolder.appendingPathComponent(parsed.serverName, isDirectory: true)
        try fileManager.createDirectory(at: roomFolder, withIntermediateDirectories: true)

        let ext = preferredFileExtension(fileNameHint: fileNameHint, mimeTypeHint: mimeTypeHint)
        let safeMediaID = parsed.mediaID.replacingOccurrences(of: "/", with: "_")
        let fileName = ext.isEmpty ? safeMediaID : "\(safeMediaID).\(ext)"
        let destination = roomFolder.appendingPathComponent(fileName, isDirectory: false)
        if fileManager.fileExists(atPath: destination.path) {
            return destination
        }

        try data.write(to: destination, options: .atomic)
        return destination
    }

    private func parseMXC(_ contentURI: String) throws -> (serverName: String, mediaID: String) {
        guard contentURI.hasPrefix("mxc://") else {
            throw MatrixMediaServiceError.invalidMXCURL
        }

        let raw = String(contentURI.dropFirst("mxc://".count))
        let parts = raw.split(separator: "/", maxSplits: 1).map(String.init)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else {
            throw MatrixMediaServiceError.invalidMXCURL
        }
        return (parts[0], parts[1])
    }

    private func preferredFileExtension(fileNameHint: String?, mimeTypeHint: String?) -> String {
        if let fileNameHint {
            let ext = URL(fileURLWithPath: fileNameHint).pathExtension
            if !ext.isEmpty {
                return ext
            }
        }

        if let mimeTypeHint,
           let utType = UTType(mimeType: mimeTypeHint),
           let preferred = utType.preferredFilenameExtension,
           !preferred.isEmpty {
            return preferred
        }

        return ""
    }

    private func resolvedMediaSource(contentURI: String, mediaSourceJSON: String?) throws -> MediaSource {
        let trimmedJSON = mediaSourceJSON?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmedJSON.isEmpty {
            do {
                return try MediaSource.fromJson(json: trimmedJSON)
            } catch {
                AppLogger.error("MediaSource JSON konnte nicht gelesen werden, URL-Fallback wird genutzt: \(error.localizedDescription)")
            }
        }
        return try MediaSource.fromUrl(url: contentURI)
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

    private func stableStoreID(homeserver: String, username: String) -> String {
        let normalizedHomeserver = homeserver.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let source = "\(normalizedHomeserver)|\(normalizedUsername)"
        return source.unicodeScalars.map { String(format: "%02X", $0.value) }.joined()
    }

    private func stableStoreID(for session: MatrixSession) -> String {
        let source = "\(session.userID)|\(session.deviceID)|\(session.homeserver)"
        return source.unicodeScalars.map { String(format: "%02X", $0.value) }.joined()
    }

    private func stableDeviceID() -> String? {
        let service = "dev.matrixmess.app.device-id"
        let account = "stable"

        if let data = try? keychain.read(service: service, account: account),
           let stored = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !stored.isEmpty {
            return stored
        }

        let generated = "MM" + String(
            UUID().uuidString
                .replacingOccurrences(of: "-", with: "")
                .prefix(10)
                .uppercased()
        )
        persistStableDeviceID(generated)
        return generated
    }

    private func persistStableDeviceID(_ deviceID: String) {
        let trimmed = deviceID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else { return }
        let service = "dev.matrixmess.app.device-id"
        let account = "stable"
        do {
            try keychain.write(data, service: service, account: account)
        } catch {
            AppLogger.error("Device-ID konnte nicht in der Keychain gespeichert werden: \(error.localizedDescription)")
        }
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
    private let onStateChange: @Sendable (MatrixVerificationFlowState) -> Void

    init(onStateChange: @escaping @Sendable (MatrixVerificationFlowState) -> Void) {
        self.onStateChange = onStateChange
    }

    private func updateState(_ update: (inout MatrixVerificationFlowState) -> Void) {
        lock.lock()
        update(&_state)
        let snapshot = _state
        lock.unlock()
        onStateChange(snapshot)
    }

    func didReceiveVerificationRequest(details: SessionVerificationRequestDetails) {
        updateState { state in
            state.senderUserID = details.senderProfile.userId
            state.deviceID = details.deviceId
            state.flowID = details.flowId
            state.statusLabel = "Verifizierungsanfrage erhalten"
            state.canStartSas = true
            state.canApprove = false
            state.canDecline = true
            state.canCancel = true
            state.isFailed = false
            state.isCancelled = false
            state.isVerified = false
        }
        AppLogger.info("Verifizierungsanfrage von \(details.senderProfile.userId) fuer Device \(details.deviceId) erhalten.")
    }

    func didAcceptVerificationRequest() {
        updateState { state in
            state.statusLabel = "Verifizierung akzeptiert"
            state.canStartSas = true
            state.canCancel = true
        }
        AppLogger.info("Verifizierungsanfrage akzeptiert.")
    }

    func didStartSasVerification() {
        updateState { state in
            state.statusLabel = "SAS-Verifizierung laeuft"
            state.canStartSas = false
            state.canCancel = true
        }
        AppLogger.info("SAS-Verifizierung gestartet.")
    }

    func didReceiveVerificationData(data: SessionVerificationData) {
        updateState { state in
            switch data {
            case .emojis(emojis: let emojis, indices: _):
                state.emojis = emojis.map { MatrixVerificationEmoji(symbol: $0.symbol(), description: $0.description()) }
                state.decimals = []
            case .decimals(values: let values):
                state.decimals = values
                state.emojis = []
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
            state.isFailed = true
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
            state.isCancelled = true
            state.canApprove = false
            state.canDecline = false
            state.canStartSas = false
            state.canCancel = false
        }
        AppLogger.info("Geraeteverifizierung abgebrochen.")
    }

    func didFinish() {
        updateState { state in
            state.statusLabel = "Geraet erfolgreich verifiziert"
            state.isVerified = true
            state.canApprove = false
            state.canDecline = false
            state.canStartSas = false
            state.canCancel = false
        }
        AppLogger.info("Geraeteverifizierung abgeschlossen.")
    }
}

private final class MatrixSDKTimelineListener: TimelineListener, @unchecked Sendable {
    private let onDiff: @Sendable ([TimelineDiff]) -> Void

    init(onDiff: @escaping @Sendable ([TimelineDiff]) -> Void) {
        self.onDiff = onDiff
    }

    func onUpdate(diff: [TimelineDiff]) {
        onDiff(diff)
    }
}

private final class MatrixSDKPaginationStatusListener: PaginationStatusListener, @unchecked Sendable {
    private let onStatus: @Sendable (RoomPaginationStatus) -> Void

    init(onStatus: @escaping @Sendable (RoomPaginationStatus) -> Void) {
        self.onStatus = onStatus
    }

    func onUpdate(status: RoomPaginationStatus) {
        onStatus(status)
    }
}
