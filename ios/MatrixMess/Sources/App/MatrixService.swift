import Foundation
import MatrixRustSDK

private let encryptedMessagePlaceholderBody = "Verschluesselte Nachricht"

struct MatrixSession: Codable, Hashable {
    let userID: String
    let homeserver: String
    let accessToken: String
    let deviceID: String
    let signedInAt: Date
    let syncToken: String?
    let refreshToken: String?
    let oidcData: String?
    let sdkStoreID: String?
}

enum MatrixServiceError: LocalizedError {
    case invalidHomeserver
    case missingCredentials
    case invalidStoredSession
    case invalidResponse
    case serverError(String)
    case unsupportedEncryptedRoom

    var errorDescription: String? {
        switch self {
        case .invalidHomeserver:
            return "Bitte gib eine gueltige Homeserver-URL an."
        case .missingCredentials:
            return "Benutzername und Passwort duerfen nicht leer sein."
        case .invalidStoredSession:
            return "Die gespeicherte Session ist unvollstaendig und muss neu aufgebaut werden."
        case .invalidResponse:
            return "Der Homeserver hat keine gueltige Antwort geliefert."
        case .serverError(let message):
            return message
        case .unsupportedEncryptedRoom:
            return "Verschluesselte Raeume brauchen die SDK-Crypto-Schicht."
        }
    }
}

final class MatrixService {
    private let session: URLSession
    private let jsonDecoder = JSONDecoder()
    private let jsonEncoder = JSONEncoder()
    private let sdkContext: MatrixSDKContext

    init(session: URLSession = .shared, sdkContext: MatrixSDKContext = MatrixSDKContext()) {
        self.session = session
        self.sdkContext = sdkContext
    }

    func signIn(
        homeserver: String,
        username: String,
        password: String
    ) async throws -> MatrixSession {
        let normalizedHomeserver = try normalizedHomeserver(from: homeserver)
        let sanitizedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !sanitizedUsername.isEmpty, !password.isEmpty else {
            throw MatrixServiceError.missingCredentials
        }

        do {
            return try await sdkContext.signIn(
                homeserver: normalizedHomeserver.absoluteString,
                username: sanitizedUsername,
                password: password
            )
        } catch {
            // Fallback for deployments that expose the Matrix API behind a custom
            // base path and advertise it via .well-known (for example /matrix).
            if let discovered = try? await discoverHomeserverBaseURL(from: normalizedHomeserver),
               discovered.absoluteString != normalizedHomeserver.absoluteString {
                AppLogger.info("Homeserver per .well-known entdeckt: \(discovered.absoluteString)")
                return try await sdkContext.signIn(
                    homeserver: discovered.absoluteString,
                    username: sanitizedUsername,
                    password: password
                )
            }
            throw error
        }
    }

    func restoreSession(_ storedSession: MatrixSession) async throws -> MatrixSession {
        guard !storedSession.userID.isEmpty, !storedSession.accessToken.isEmpty else {
            throw MatrixServiceError.invalidStoredSession
        }
        let restored = try await sdkContext.restoreSession(storedSession)
        return MatrixSession(
            userID: restored.userID,
            homeserver: restored.homeserver,
            accessToken: restored.accessToken,
            deviceID: restored.deviceID,
            signedInAt: storedSession.signedInAt,
            syncToken: storedSession.syncToken,
            refreshToken: restored.refreshToken,
            oidcData: restored.oidcData,
            sdkStoreID: restored.sdkStoreID
        )
    }

    func currentCryptoStatus(session: MatrixSession?) async -> MatrixCryptoStatus {
        await sdkContext.currentCryptoStatus(session: session)
    }

    func prepareEncryptedSession(for session: MatrixSession) async throws {
        try await sdkContext.prepareEncryptedSession(for: session)
    }

    func recoverEncryption(
        using recoveryKey: String,
        session: MatrixSession
    ) async throws -> MatrixCryptoStatus {
        try await sdkContext.recover(session: session, recoveryKey: recoveryKey)
    }

    func currentVerificationFlowState() async -> MatrixVerificationFlowState {
        await sdkContext.currentVerificationFlowState()
    }

    func startSasVerification(session: MatrixSession) async throws {
        try await sdkContext.startSasVerification(session: session)
    }

    func approveVerification(session: MatrixSession) async throws {
        try await sdkContext.approveVerification(session: session)
    }

    func declineVerification(session: MatrixSession) async throws {
        try await sdkContext.declineVerification(session: session)
    }

    func cancelVerification(session: MatrixSession) async throws {
        try await sdkContext.cancelVerification(session: session)
    }

    func requestOwnDeviceVerification(session: MatrixSession) async throws {
        try await sdkContext.requestDeviceVerification(session: session)
    }

    func sendEncryptedMedia(
        data: Data,
        mimeType: String,
        fileName: String,
        kind: ChatMessageKind,
        roomID: String,
        session storedSession: MatrixSession,
        durationSeconds: TimeInterval? = nil
    ) async throws -> MatrixSDKMediaSendResult {
        try await sdkContext.sendMedia(
            data: data,
            mimeType: mimeType,
            fileName: fileName,
            kind: kind,
            roomID: roomID,
            session: storedSession,
            durationSeconds: durationSeconds
        )
    }

    func mediaDownloadURL(
        for contentURI: String,
        session storedSession: MatrixSession
    ) -> URL? {
        sdkContext.mediaDownloadURL(contentURI: contentURI, session: storedSession)
    }

    func downloadMedia(
        contentURI: String,
        fileNameHint: String?,
        mimeTypeHint: String?,
        session storedSession: MatrixSession
    ) async throws -> URL {
        try await sdkContext.downloadMedia(
            contentURI: contentURI,
            session: storedSession,
            fileNameHint: fileNameHint,
            mimeTypeHint: mimeTypeHint
        )
    }

    func loadTimelineMessages(
        roomID: String,
        session storedSession: MatrixSession,
        minimumMessageCount: Int = 0,
        backPaginationBatchSize: UInt16 = 40
    ) async throws -> MatrixSDKTimelineFetchResult {
        try await sdkContext.timelineMessages(
            roomID: roomID,
            session: storedSession,
            minimumMessageCount: minimumMessageCount,
            backPaginationBatchSize: backPaginationBatchSize
        )
    }

    func loadWorkspace(
        session storedSession: MatrixSession,
        existingMainPins: [String],
        existingSpaces: [ChatSpace] = [],
        existingThreadsByID: [String: ChatThread] = [:],
        existingMessagesByThreadID: [String: [ChatMessage]] = [:]
    ) async throws -> MatrixWorkspace {
        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let syncResponse = try await sync(homeserver: homeserver, session: storedSession, fullState: storedSession.syncToken == nil)
        return try await makeWorkspace(
            from: syncResponse,
            homeserver: homeserver,
            session: storedSession,
            existingMainPins: existingMainPins,
            existingSpaces: existingSpaces,
            existingThreadsByID: existingThreadsByID,
            existingMessagesByThreadID: existingMessagesByThreadID
        )
    }

    func sendMessage(_ text: String, roomID: String, session storedSession: MatrixSession, isEncrypted: Bool) async throws -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw MatrixServiceError.serverError("Nachrichteninhalt ist leer.")
        }

        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        // Element X and matrix-rust-sdk primarily send through the timeline/SDK queue.
        // We do the same for all room types and only fall back to REST for plain rooms.
        do {
            return try await sdkContext.sendMessage(trimmed, roomID: roomID, session: storedSession)
        } catch {
            if isEncrypted {
                throw error
            }
            let sdkError = error
            AppLogger.error("SDK-Senden fehlgeschlagen, REST-Fallback wird versucht: \(sdkError.localizedDescription)")
            do {
                return try await sendMessageREST(
                    trimmed,
                    roomID: roomID,
                    homeserver: homeserver,
                    session: storedSession
                )
            } catch {
                throw combinedSendError(primary: sdkError, fallback: error)
            }
        }
    }

    func sendTypingNotification(isTyping: Bool, roomID: String, session storedSession: MatrixSession) async throws {
        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let encodedRoomID = encodedPathSegment(roomID)
        let encodedUserID = encodedPathSegment(storedSession.userID)

        let _: EmptyMatrixResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/typing/\(encodedUserID)",
            method: "PUT",
            body: MatrixTypingRequest(typing: isTyping, timeout: isTyping ? 30_000 : 0),
            accessToken: storedSession.accessToken
        )
    }

    func sendReaction(
        _ emoji: String,
        roomID: String,
        targetEventID: String,
        session storedSession: MatrixSession,
        isEncrypted: Bool
    ) async throws -> String {
        if isEncrypted {
            _ = try await sdkContext.toggleReaction(
                emoji,
                roomID: roomID,
                targetEventID: targetEventID,
                session: storedSession
            )
            return targetEventID
        }

        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let txnID = UUID().uuidString.lowercased()
        let encodedRoomID = encodedPathSegment(roomID)

        let response: MatrixSendEventResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/send/m.reaction/\(txnID)",
            method: "PUT",
            body: MatrixReactionRequest(mRelatesTo: .init(eventID: targetEventID, key: emoji)),
            accessToken: storedSession.accessToken
        )
        return response.eventID
    }

    func editMessage(
        _ text: String,
        roomID: String,
        targetEventID: String,
        session storedSession: MatrixSession,
        isEncrypted: Bool
    ) async throws -> String {
        if isEncrypted {
            try await sdkContext.editMessage(
                text,
                roomID: roomID,
                targetEventID: targetEventID,
                session: storedSession
            )
            return targetEventID
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw MatrixServiceError.serverError("Eine bearbeitete Nachricht darf nicht leer sein.")
        }

        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let txnID = UUID().uuidString.lowercased()
        let encodedRoomID = encodedPathSegment(roomID)

        let response: MatrixSendEventResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/send/m.room.message/\(txnID)",
            method: "PUT",
            body: MatrixEditMessageRequest(
                body: "* \(trimmed)",
                mNewContent: .init(body: trimmed),
                mRelatesTo: .init(eventID: targetEventID)
            ),
            accessToken: storedSession.accessToken
        )
        return response.eventID
    }

    func redactMessage(
        roomID: String,
        targetEventID: String,
        reason: String?,
        session storedSession: MatrixSession,
        isEncrypted: Bool
    ) async throws -> String {
        if isEncrypted {
            try await sdkContext.redactMessage(
                roomID: roomID,
                targetEventID: targetEventID,
                reason: reason,
                session: storedSession
            )
            return targetEventID
        }

        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let txnID = UUID().uuidString.lowercased()
        let encodedRoomID = encodedPathSegment(roomID)
        let encodedEventID = encodedPathSegment(targetEventID)

        let response: MatrixSendEventResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/redact/\(encodedEventID)/\(txnID)",
            method: "PUT",
            body: MatrixRedactionRequest(reason: reason),
            accessToken: storedSession.accessToken
        )
        return response.eventID
    }

    func markRead(
        roomID: String,
        eventID: String,
        session storedSession: MatrixSession
    ) async throws {
        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let encodedRoomID = encodedPathSegment(roomID)

        let _: EmptyMatrixResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/read_markers",
            method: "POST",
            body: MatrixReadMarkersRequest(fullyRead: eventID, read: eventID),
            accessToken: storedSession.accessToken
        )
    }

    func sendMediaMessage(
        roomID: String,
        fileName: String,
        contentURI: String,
        mimeType: String,
        size: Int,
        kind: ChatMessageKind,
        session storedSession: MatrixSession,
        isEncrypted: Bool,
        durationMilliseconds: Int? = nil
    ) async throws -> String {
        guard !isEncrypted else {
            throw MatrixServiceError.unsupportedEncryptedRoom
        }

        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let msgtype: String

        switch kind {
        case .image:
            msgtype = "m.image"
        case .video:
            msgtype = "m.video"
        case .file:
            msgtype = "m.file"
        case .voice:
            msgtype = "m.audio"
        case .text, .event:
            msgtype = "m.file"
        }

        let body = MatrixSendMediaMessageRequest(
            msgtype: msgtype,
            body: fileName,
            filename: fileName,
            url: contentURI,
            info: .init(mimetype: mimeType, size: size, duration: durationMilliseconds)
        )

        let response = try await sendWithVersionFallback(
            homeserver: homeserver,
            roomID: roomID,
            session: storedSession,
            eventTypePathComponent: "m.room.message",
            body: body
        )
        return response.eventID
    }

    func logout(session storedSession: MatrixSession) async {
        await sdkContext.stop()
        guard let homeserver = try? normalizedHomeserver(from: storedSession.homeserver) else {
            return
        }

        do {
            let _: EmptyMatrixResponse = try await performRequest(
                homeserver: homeserver,
                path: "/_matrix/client/v3/logout",
                method: "POST",
                body: Optional<String>.none,
                accessToken: storedSession.accessToken
            )
        } catch {
            AppLogger.error("Matrix-Logout fehlgeschlagen: \(error.localizedDescription)")
        }
    }

    private func sync(
        homeserver: URL,
        session storedSession: MatrixSession,
        fullState: Bool
    ) async throws -> MatrixSyncResponse {
        var queryItems = [
            URLQueryItem(name: "timeout", value: fullState ? "0" : "30000"),
            URLQueryItem(name: "set_presence", value: "online")
        ]

        if fullState {
            queryItems.append(URLQueryItem(name: "full_state", value: "true"))
        }

        if let syncToken = storedSession.syncToken, !syncToken.isEmpty {
            queryItems.append(URLQueryItem(name: "since", value: syncToken))
        }

        return try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/sync",
            method: "GET",
            body: Optional<String>.none,
            accessToken: storedSession.accessToken,
            queryItems: queryItems
        )
    }

    private func joinedRoomIDs(
        homeserver: URL,
        session storedSession: MatrixSession
    ) async throws -> [String] {
        let response: MatrixJoinedRoomsResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/joined_rooms",
            method: "GET",
            body: Optional<String>.none,
            accessToken: storedSession.accessToken
        )
        return response.joinedRooms
    }

    private func roomStateEvents(
        roomID: String,
        homeserver: URL,
        session storedSession: MatrixSession
    ) async throws -> [MatrixTimelineEvent] {
        let encodedRoomID = encodedPathSegment(roomID)
        return try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/state",
            method: "GET",
            body: Optional<String>.none,
            accessToken: storedSession.accessToken
        )
    }

    private func loadRoomSnapshotsForMissingJoinedRooms(
        roomIDs: [String],
        homeserver: URL,
        session storedSession: MatrixSession
    ) async -> [ParsedRoomSnapshot] {
        var snapshots: [ParsedRoomSnapshot] = []
        snapshots.reserveCapacity(roomIDs.count)
        for roomID in roomIDs {
            do {
                let stateEvents = try await roomStateEvents(
                    roomID: roomID,
                    homeserver: homeserver,
                    session: storedSession
                )
                snapshots.append(
                    ParsedRoomSnapshot(
                        roomID: roomID,
                        unreadCount: 0,
                        timelineEvents: [],
                        stateEvents: stateEvents
                    )
                )
            } catch {
                AppLogger.error("State fuer fehlenden Raum \(roomID) konnte nicht geladen werden: \(error.localizedDescription)")
            }
        }
        return snapshots
    }

    private func makeWorkspace(
        from response: MatrixSyncResponse,
        homeserver: URL,
        session storedSession: MatrixSession,
        existingMainPins: [String],
        existingSpaces: [ChatSpace],
        existingThreadsByID: [String: ChatThread],
        existingMessagesByThreadID: [String: [ChatMessage]]
    ) async throws -> MatrixWorkspace {
        let isIncrementalSync = storedSession.syncToken != nil
        let matrixDescriptor = descriptor(for: .matrix)
        let matrixSyntheticSpaceID = "space.synthetic.matrix"
        let joinedRooms = response.rooms?.join ?? [:]
        let invitedRooms = response.rooms?.invite ?? [:]
        let leftRoomIDs = Set(
            response.rooms?.leave?.keys
            ?? Dictionary<String, MatrixSyncResponse.LeftRoom>().keys
        )
        let joinedSnapshots = joinedRooms.map { roomID, room in
            ParsedRoomSnapshot(
                roomID: roomID,
                unreadCount: room.unreadNotifications?.notificationCount ?? 0,
                timelineEvents: room.timeline?.events ?? [],
                stateEvents: room.state?.events ?? []
            )
        }
        let invitedSnapshots = invitedRooms.map { roomID, room in
            ParsedRoomSnapshot(
                roomID: roomID,
                unreadCount: 0,
                timelineEvents: [],
                stateEvents: room.inviteState?.events ?? []
            )
        }
        var parsedRooms = joinedSnapshots + invitedSnapshots
        if !isIncrementalSync {
            let knownRoomIDs = Set(parsedRooms.map(\.roomID))
            let serverJoinedRoomIDs = (try? await joinedRoomIDs(homeserver: homeserver, session: storedSession)) ?? []
            let missingJoinedRoomIDs = serverJoinedRoomIDs.filter {
                !knownRoomIDs.contains($0) && !leftRoomIDs.contains($0)
            }
            if !missingJoinedRoomIDs.isEmpty {
                let recoveredSnapshots = await loadRoomSnapshotsForMissingJoinedRooms(
                    roomIDs: missingJoinedRoomIDs,
                    homeserver: homeserver,
                    session: storedSession
                )
                parsedRooms.append(contentsOf: recoveredSnapshots)
            }
        }

        // Parse m.typing ephemeral events for each room.
        var typingUsersByThreadID: [String: [String]] = [:]
        for (roomID, room) in joinedRooms {
            guard let ephemeralEvents = room.ephemeral?.events else { continue }
            for event in ephemeralEvents where event.type == "m.typing" {
                let names = event.content?["user_ids"]?.arrayValue?.compactMap { item -> String? in
                    guard let userID = item.stringValue,
                          userID.compare(storedSession.userID, options: .caseInsensitive) != .orderedSame else {
                        return nil
                    }
                    return MatrixDisplayNameResolver.sanitizedDisplayName(nil, fallbackUserID: userID)
                } ?? []
                if !names.isEmpty {
                    typingUsersByThreadID[roomID] = Array(Set(names)).sorted()
                }
            }
        }

        let existingSyntheticSpacesByID = Dictionary(
            uniqueKeysWithValues: existingSpaces
                .filter { $0.id.hasPrefix("space.synthetic.") }
                .map { ($0.id, $0) }
        )

        let threadedRooms = parsedRooms.filter { !$0.isSpace }

        var syntheticSpacesByID = isIncrementalSync ? existingSyntheticSpacesByID : [:]
        var threadsByID = isIncrementalSync ? existingThreadsByID : [:]
        var messagesByThreadID = isIncrementalSync ? existingMessagesByThreadID : [:]
        var timelineStartReachedThreadIDs: Set<String> = []
        let matrixSpace = syntheticSpacesByID[matrixSyntheticSpaceID] ?? ChatSpace(
            id: matrixSyntheticSpaceID,
            kind: matrixDescriptor.kind,
            title: matrixDescriptor.title,
            subtitle: matrixDescriptor.subtitle,
            icon: matrixDescriptor.icon,
            accent: matrixDescriptor.accent
        )
        syntheticSpacesByID[matrixSyntheticSpaceID] = matrixSpace

        for leftRoomID in leftRoomIDs {
            threadsByID.removeValue(forKey: leftRoomID)
            messagesByThreadID.removeValue(forKey: leftRoomID)
        }

        for snapshot in threadedRooms {
            let classification = snapshot.classification
            let assignedSpaceID: String
            let assignedSpace: ChatSpace
            if classification == .matrix {
                assignedSpace = matrixSpace
                assignedSpaceID = matrixSyntheticSpaceID
            } else {
                let descriptor = descriptor(for: classification)
                let syntheticID = "space.synthetic.\(descriptor.key)"
                if let existing = syntheticSpacesByID[syntheticID] {
                    assignedSpace = existing
                } else {
                    let space = ChatSpace(
                        id: syntheticID,
                        kind: descriptor.kind,
                        title: descriptor.title,
                        subtitle: descriptor.subtitle,
                        icon: descriptor.icon,
                        accent: descriptor.accent
                    )
                    syntheticSpacesByID[syntheticID] = space
                    assignedSpace = space
                }
                assignedSpaceID = assignedSpace.id
            }

            let existingMessages = messagesByThreadID[snapshot.roomID, default: []]
            let restMessages = snapshot.mergedTimelineMessages(
                existingMessages: existingMessages,
                currentUserID: storedSession.userID
            )
            let sdkResult = try? await sdkContext.timelineMessages(
                roomID: snapshot.roomID,
                session: storedSession,
                minimumMessageCount: min(max(40, existingMessages.count + 30), 300),
                backPaginationBatchSize: 30
            )
            if sdkResult?.hitTimelineStart == true {
                timelineStartReachedThreadIDs.insert(snapshot.roomID)
            }
            let messages = mergeWorkspaceMessages(
                sdkMessages: sdkResult?.messages,
                restMessages: restMessages,
                existingMessages: existingMessages
            )
            let lastMessage = messages.last
            let previousThread = threadsByID[snapshot.roomID]
            let lastActivity = lastMessage?.timestamp ?? previousThread?.lastActivity ?? .now
            let preview = lastMessage.map(previewText(for:))
                ?? previousThread?.lastMessagePreview
                ?? (snapshot.isEncrypted ? "Verschluesselter Chat" : "Noch keine Nachrichten")

            let resolvedName = snapshot.resolvedDisplayName(excluding: storedSession.userID)

            threadsByID[snapshot.roomID] = ChatThread(
                id: snapshot.roomID,
                homeSpaceID: assignedSpaceID,
                title: resolvedName,
                subtitle: snapshot.subtitle(for: descriptor(for: classification)),
                avatarSymbol: descriptor(for: classification).avatarSymbol,
                accent: assignedSpace.accent,
                lastMessagePreview: preview,
                lastActivity: lastActivity,
                unreadCount: snapshot.unreadCount,
                isMuted: previousThread?.isMuted ?? false,
                isEncrypted: snapshot.isEncrypted,
                avatarContentURI: snapshot.avatarContentURI(excluding: storedSession.userID),
                officialTitle: resolvedName,
                bridgeLabel: descriptor(for: classification).title,
                memberCount: snapshot.memberCount,
                topic: snapshot.topic.isEmpty ? nil : snapshot.topic,
                isDirect: snapshot.isDirect
            )
            messagesByThreadID[snapshot.roomID] = messages
        }

        let usedSpaceIDs = Set(threadsByID.values.map(\.homeSpaceID))
        syntheticSpacesByID = syntheticSpacesByID.filter {
            usedSpaceIDs.contains($0.key) || $0.key == matrixSyntheticSpaceID
        }
        let matrixSpaceForList = syntheticSpacesByID[matrixSyntheticSpaceID]
        let otherSyntheticSpaces = syntheticSpacesByID
            .filter { $0.key != matrixSyntheticSpaceID }
            .map(\.value)
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }

        let orderedSpaces = [ChatSpace(
            id: ChatSpace.mainID,
            kind: .main,
            title: "Main",
            subtitle: "Wichtige Chats aus allen Spaces",
            icon: "star.circle.fill",
            accent: .sunset
        )]
        + (matrixSpaceForList.map { [$0] } ?? [])
        + otherSyntheticSpaces

        let availableThreadIDs = Set(threadsByID.keys)
        let filteredPins = existingMainPins.filter { availableThreadIDs.contains($0) }
        // Migration: older builds auto-filled Main with all chats. If we detect
        // that exact legacy state, reset Main to curated-empty behavior.
        let wasLegacyAutoPinState = !availableThreadIDs.isEmpty && Set(filteredPins) == availableThreadIDs
        let mainPins = wasLegacyAutoPinState ? [] : filteredPins

        return MatrixWorkspace(
            session: MatrixSession(
                userID: storedSession.userID,
                homeserver: storedSession.homeserver,
                accessToken: storedSession.accessToken,
                deviceID: storedSession.deviceID,
                signedInAt: storedSession.signedInAt,
                syncToken: response.nextBatch,
                refreshToken: storedSession.refreshToken,
                oidcData: storedSession.oidcData,
                sdkStoreID: storedSession.sdkStoreID
            ),
            spaces: orderedSpaces,
            threadsByID: threadsByID,
            messagesByThreadID: messagesByThreadID,
            mainPinnedThreadIDs: Array(mainPins),
            typingUsersByThreadID: typingUsersByThreadID,
            timelineStartReachedThreadIDs: timelineStartReachedThreadIDs
        )
    }

    private func mergeWorkspaceMessages(
        sdkMessages: [ChatMessage]?,
        restMessages: [ChatMessage],
        existingMessages: [ChatMessage]
    ) -> [ChatMessage] {
        guard var merged = sdkMessages, !merged.isEmpty else {
            return restMessages
        }

        var existingByEventID: [String: ChatMessage] = [:]
        for message in restMessages + existingMessages {
            guard let eventID = message.matrixEventID else { continue }
            existingByEventID[eventID] = message
        }

        for index in merged.indices {
            guard let eventID = merged[index].matrixEventID,
                  let existing = existingByEventID[eventID] else {
                continue
            }

            if merged[index].attachment == nil {
                merged[index].attachment = existing.attachment
            } else if var incomingAttachment = merged[index].attachment,
                      incomingAttachment.localCachePath == nil,
                      let existingAttachment = existing.attachment {
                incomingAttachment.localCachePath = existingAttachment.localCachePath
                merged[index].attachment = incomingAttachment
            }
        }

        let pendingMessages = (restMessages + existingMessages).filter {
            $0.matrixEventID == nil && ($0.isPending || $0.sendStatus == .failed)
        }
        for pending in pendingMessages {
            if merged.contains(where: { message in
                guard message.matrixEventID == nil else { return false }
                guard message.isOutgoing == pending.isOutgoing else { return false }
                guard message.kind == pending.kind else { return false }
                if !pending.body.isEmpty && message.body != pending.body {
                    return false
                }
                return abs(message.timestamp.timeIntervalSince(pending.timestamp)) < 180
            }) {
                continue
            }
            merged.append(pending)
        }

        return merged.sorted { $0.timestamp < $1.timestamp }
    }

    private func previewText(for message: ChatMessage) -> String {
        switch message.kind {
        case .text:
            return message.body
        case .voice:
            return "Sprachnachricht"
        case .image:
            return "Bild"
        case .video:
            return "Video"
        case .file:
            return "Datei"
        case .event:
            return "Termin"
        }
    }

    private func normalizedHomeserver(from value: String) throws -> URL {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw MatrixServiceError.invalidHomeserver }

        let withScheme: String
        if trimmed.contains("://") {
            withScheme = trimmed
        } else {
            withScheme = "https://\(trimmed)"
        }

        guard let source = URLComponents(string: withScheme),
              let scheme = source.scheme?.lowercased(),
              ["https", "http"].contains(scheme),
              let host = source.host,
              !host.isEmpty else {
            throw MatrixServiceError.invalidHomeserver
        }

        let normalizedPath: String
        let sourcePath = source.path.trimmingCharacters(in: .whitespacesAndNewlines)
        if sourcePath.isEmpty || sourcePath == "/" {
            normalizedPath = ""
        } else {
            normalizedPath = "/" + sourcePath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }

        var normalized = URLComponents()
        normalized.scheme = scheme
        normalized.host = host
        normalized.port = source.port
        normalized.path = normalizedPath

        guard let url = normalized.url else {
            throw MatrixServiceError.invalidHomeserver
        }
        return url
    }

    private func discoverHomeserverBaseURL(from homeserver: URL) async throws -> URL? {
        var components = URLComponents()
        components.scheme = homeserver.scheme
        components.host = homeserver.host
        components.port = homeserver.port
        components.path = "/.well-known/matrix/client"

        guard let discoveryURL = components.url else {
            return nil
        }

        var request = URLRequest(url: discoveryURL)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            return nil
        }

        guard let discovered = try? jsonDecoder.decode(MatrixWellKnownClientResponse.self, from: data),
              let baseURL = discovered.homeserver?.baseURL else {
            return nil
        }

        return try? normalizedHomeserver(from: baseURL)
    }

    private func sendMessageREST(
        _ text: String,
        roomID: String,
        homeserver: URL,
        session storedSession: MatrixSession
    ) async throws -> String {
        let response = try await sendWithVersionFallback(
            homeserver: homeserver,
            roomID: roomID,
            session: storedSession,
            eventTypePathComponent: "m.room.message",
            body: MatrixSendMessageRequest(body: text)
        )
        return response.eventID
    }

    private func sendWithVersionFallback<Body: Encodable>(
        homeserver: URL,
        roomID: String,
        session storedSession: MatrixSession,
        eventTypePathComponent: String,
        body: Body
    ) async throws -> MatrixSendEventResponse {
        let encodedRoomID = encodedPathSegment(roomID)
        let apiVersions = ["v3", "r0"]
        var lastError: Error?

        for version in apiVersions {
            do {
                let txnID = UUID().uuidString.lowercased()
                return try await performRequest(
                    homeserver: homeserver,
                    path: "/_matrix/client/\(version)/rooms/\(encodedRoomID)/send/\(eventTypePathComponent)/\(txnID)",
                    method: "PUT",
                    body: body,
                    accessToken: storedSession.accessToken
                )
            } catch {
                lastError = error
                if await tryJoinRoom(homeserver: homeserver, roomID: roomID, session: storedSession, apiVersion: version) {
                    do {
                        let txnID = UUID().uuidString.lowercased()
                        return try await performRequest(
                            homeserver: homeserver,
                            path: "/_matrix/client/\(version)/rooms/\(encodedRoomID)/send/\(eventTypePathComponent)/\(txnID)",
                            method: "PUT",
                            body: body,
                            accessToken: storedSession.accessToken
                        )
                    } catch {
                        lastError = error
                    }
                }
            }
        }

        throw lastError ?? MatrixServiceError.serverError("Senden fehlgeschlagen.")
    }

    private func tryJoinRoom(
        homeserver: URL,
        roomID: String,
        session storedSession: MatrixSession,
        apiVersion: String
    ) async -> Bool {
        do {
            let encodedRoomID = encodedPathSegment(roomID)
            let _: MatrixJoinRoomResponse = try await performRequest(
                homeserver: homeserver,
                path: "/_matrix/client/\(apiVersion)/rooms/\(encodedRoomID)/join",
                method: "POST",
                body: Optional<String>.none,
                accessToken: storedSession.accessToken
            )
            return true
        } catch {
            return false
        }
    }

    private func combinedSendError(primary: Error?, fallback: Error) -> MatrixServiceError {
        if let primary {
            return MatrixServiceError.serverError(
                "Senden fehlgeschlagen. Primaer: \(primary.localizedDescription) | Fallback: \(fallback.localizedDescription)"
            )
        }
        return MatrixServiceError.serverError("Senden fehlgeschlagen: \(fallback.localizedDescription)")
    }

    private func encodedPathSegment(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#[]@")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private func performRequest<Response: Decodable, Body: Encodable>(
        homeserver: URL,
        path: String,
        method: String,
        body: Body?,
        accessToken: String?,
        queryItems: [URLQueryItem] = []
    ) async throws -> Response {
        var components = URLComponents(url: homeserver, resolvingAgainstBaseURL: false)
        components?.path = combinedPath(basePath: homeserver.path, endpointPath: path)
        if !queryItems.isEmpty {
            components?.queryItems = queryItems
        }

        guard let url = components?.url else {
            throw MatrixServiceError.invalidHomeserver
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try jsonEncoder.encode(body)
        }

        let maxAttempts = 3
        var lastNetworkError: Error?

        for attempt in 1...maxAttempts {
            do {
                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw MatrixServiceError.invalidResponse
                }

                guard (200..<300).contains(httpResponse.statusCode) else {
                    if attempt < maxAttempts, shouldRetry(statusCode: httpResponse.statusCode) {
                        try? await Task.sleep(nanoseconds: retryDelayNs(forAttempt: attempt))
                        continue
                    }

                    if let matrixError = try? jsonDecoder.decode(MatrixErrorResponse.self, from: data),
                       let message = matrixError.error {
                        if let errcode = matrixError.errcode, !errcode.isEmpty {
                            throw MatrixServiceError.serverError("\(errcode): \(message)")
                        }
                        throw MatrixServiceError.serverError(message)
                    }

                    throw MatrixServiceError.serverError("Homeserver-Fehler \(httpResponse.statusCode).")
                }

                if Response.self == EmptyMatrixResponse.self {
                    return EmptyMatrixResponse() as! Response
                }

                do {
                    return try jsonDecoder.decode(Response.self, from: data)
                } catch {
                    AppLogger.error("Matrix-Antwort konnte nicht decodiert werden: \(error.localizedDescription)")
                    throw MatrixServiceError.invalidResponse
                }
            } catch {
                lastNetworkError = error
                let urlError = error as? URLError
                if attempt < maxAttempts, shouldRetry(urlError: urlError) {
                    try? await Task.sleep(nanoseconds: retryDelayNs(forAttempt: attempt))
                    continue
                }
                throw error
            }
        }

        throw lastNetworkError ?? MatrixServiceError.invalidResponse
    }

    private func retryDelayNs(forAttempt attempt: Int) -> UInt64 {
        // 250ms, 500ms, 1000ms ...
        let baseMs = 250
        let value = baseMs * (1 << max(0, attempt - 1))
        return UInt64(value) * 1_000_000
    }

    private func shouldRetry(statusCode: Int) -> Bool {
        statusCode == 429 || (500...599).contains(statusCode)
    }

    private func shouldRetry(urlError: URLError?) -> Bool {
        guard let urlError else { return false }
        switch urlError.code {
        case .timedOut,
             .cannotFindHost,
             .cannotConnectToHost,
             .networkConnectionLost,
             .dnsLookupFailed,
             .notConnectedToInternet,
             .internationalRoamingOff,
             .callIsActive,
             .dataNotAllowed:
            return true
        default:
            return false
        }
    }

    private func combinedPath(basePath: String, endpointPath: String) -> String {
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
}

private struct EmptyMatrixResponse: Decodable {}

private struct MatrixWellKnownClientResponse: Decodable {
    struct Homeserver: Decodable {
        let baseURL: String

        enum CodingKeys: String, CodingKey {
            case baseURL = "base_url"
        }
    }

    let homeserver: Homeserver?

    enum CodingKeys: String, CodingKey {
        case homeserver = "m.homeserver"
    }
}

private struct SpaceDescriptor {
    let key: String
    let title: String
    let subtitle: String
    let icon: String
    let accent: SpaceAccent
    let kind: ChatSpace.Kind
    let avatarSymbol: String
}

private struct ParsedRoomSnapshot {
    struct MemberProfile {
        let userID: String
        let displayName: String
        let avatarContentURI: String?
    }

    let roomID: String
    let unreadCount: Int
    let timelineEvents: [MatrixTimelineEvent]
    let stateEvents: [MatrixTimelineEvent]

    var combinedStateEvents: [MatrixTimelineEvent] { stateEvents + timelineEvents.filter { $0.stateKey != nil } }

    var createContent: [String: MatrixJSONValue] {
        combinedStateEvents.last(where: { $0.type == "m.room.create" })?.content ?? [:]
    }

    var roomType: String? {
        createContent["type"]?.stringValue
    }

    var isSpace: Bool { roomType == "m.space" }
    var isEncrypted: Bool { combinedStateEvents.contains(where: { $0.type == "m.room.encryption" }) }

    var displayName: String {
        combinedStateEvents.last(where: { $0.type == "m.room.name" })?.content?["name"]?.stringValue
            ?? combinedStateEvents.last(where: { $0.type == "m.room.canonical_alias" })?.content?["alias"]?.stringValue
            ?? roomID
    }

    /// Resolves a human-friendly display name for the room, using member
    /// profiles and the room topic as fallbacks before resorting to the raw
    /// room ID. This is especially important for bridged DM rooms (Signal,
    /// WhatsApp, Instagram, etc.) where the Matrix room often has no explicit
    /// ``m.room.name`` state event.
    func resolvedDisplayName(excluding currentUserID: String) -> String {
        // 1. Explicit room name
        if let name = combinedStateEvents.last(where: { $0.type == "m.room.name" })?.content?["name"]?.stringValue,
           !name.isEmpty {
            return MatrixDisplayNameResolver.sanitizedDisplayName(name)
        }

        // 2. Canonical alias
        if let alias = combinedStateEvents.last(where: { $0.type == "m.room.canonical_alias" })?.content?["alias"]?.stringValue,
           !alias.isEmpty {
            return MatrixDisplayNameResolver.sanitizedDisplayName(alias)
        }

        // 3. For DM rooms, try the other member's display name
        if isDirect {
            let otherMembers = memberProfiles.filter { $0.userID != currentUserID }
            // Prefer a member whose display name differs from their user ID (i.e. has a real name set)
            if let named = otherMembers.first(where: { $0.displayName != $0.userID && !$0.displayName.isEmpty }) {
                return MatrixDisplayNameResolver.sanitizedDisplayName(named.displayName, fallbackUserID: named.userID)
            }
            // Fall back to any other member – try to extract a readable name from the user ID
            if let member = otherMembers.first {
                return MatrixDisplayNameResolver.sanitizedDisplayName(member.displayName, fallbackUserID: member.userID)
            }
        }

        // 4. For group rooms without a name, build from member names
        if !isSpace {
            let others = memberProfiles.filter { $0.userID != currentUserID }
            let names: [String] = others.prefix(3).map { profile in
                MatrixDisplayNameResolver.sanitizedDisplayName(profile.displayName, fallbackUserID: profile.userID)
            }
            if !names.isEmpty {
                let joined = names.joined(separator: ", ")
                if others.count > 3 {
                    return "\(joined) +\(others.count - 3)"
                }
                return joined
            }
        }

        // 5. Try to extract a name from the room topic
        if let extracted = MatrixDisplayNameResolver.extractNameFromTopic(topic) {
            return extracted
        }

        // 6. Last resort
        return MatrixDisplayNameResolver.sanitizedDisplayName(nil, fallbackUserID: roomID)
    }

    var topic: String {
        combinedStateEvents.last(where: { $0.type == "m.room.topic" })?.content?["topic"]?.stringValue ?? ""
    }

    func avatarContentURI(excluding currentUserID: String) -> String? {
        combinedStateEvents.last(where: { $0.type == "m.room.avatar" })?.content?["url"]?.stringValue
            ?? memberProfiles.first(where: { $0.userID != currentUserID })?.avatarContentURI
            ?? memberProfiles.first?.avatarContentURI
    }

    var memberProfiles: [MemberProfile] {
        combinedStateEvents
            .filter { $0.type == "m.room.member" }
            .compactMap { event in
                guard let userID = event.stateKey else { return nil }
                let displayName = MatrixDisplayNameResolver.sanitizedDisplayName(
                    event.content?["displayname"]?.stringValue,
                    fallbackUserID: userID
                )
                let avatarContentURI = event.content?["avatar_url"]?.stringValue
                return MemberProfile(userID: userID, displayName: displayName, avatarContentURI: avatarContentURI)
            }
    }

    var memberCount: Int { memberProfiles.count }
    var isDirect: Bool { !isSpace && memberProfiles.count <= 2 }

    var parentSpaceIDs: [String] {
        combinedStateEvents
            .filter { $0.type == "m.space.parent" }
            .compactMap(\.stateKey)
    }

    private var bridgeHints: String {
        let bridgeEvents = combinedStateEvents.filter { event in
            let type = event.type.lowercased()
            return type.contains("bridge")
                || type.contains("appservice")
                || type.contains("mautrix")
        }

        guard !bridgeEvents.isEmpty else { return "" }
        let fragments = bridgeEvents.flatMap { event -> [String] in
            let values = event.content?.values.map(flattenJSONValue(_:)) ?? []
            return [event.type, event.stateKey ?? ""] + values
        }
        return fragments.joined(separator: " ")
    }

    var classification: MatrixRoomClassification {
        let memberIDs = memberProfiles.map(\.userID).joined(separator: " ")
        let memberNames = memberProfiles.map(\.displayName).joined(separator: " ")
        let canonicalAlias = combinedStateEvents
            .last(where: { $0.type == "m.room.canonical_alias" })?
            .content?["alias"]?.stringValue ?? ""
        let haystack = [displayName, canonicalAlias, topic, roomID, memberIDs, memberNames, bridgeHints]
            .joined(separator: " ")
            .lowercased()
        return MatrixRoomClassification.classify(haystack: haystack, isSpace: isSpace)
    }

    func subtitle(for descriptor: SpaceDescriptor) -> String {
        if !topic.isEmpty {
            return topic
        }
        if descriptor.kind == .matrix {
            return isEncrypted ? "Verschluesselter Matrix-Raum" : (isDirect ? "Direktnachricht" : "Matrix Raum")
        }
        return descriptor.subtitle
    }

    func mergedTimelineMessages(existingMessages: [ChatMessage], currentUserID: String) -> [ChatMessage] {
        let members = combinedStateEvents
            .filter { $0.type == "m.room.member" }
            .reduce(into: [String: String]()) { partialResult, event in
                guard let stateKey = event.stateKey else { return }
                partialResult[stateKey] = MatrixDisplayNameResolver.sanitizedDisplayName(
                    event.content?["displayname"]?.stringValue,
                    fallbackUserID: stateKey
                )
            }

        var messages = existingMessages.sorted { $0.timestamp < $1.timestamp }
        var messageIndexByEventID: [String: Int] = [:]
        for (index, message) in messages.enumerated() {
            if let matrixEventID = message.matrixEventID {
                messageIndexByEventID[matrixEventID] = index
            }
        }

        for event in timelineEvents {
            let relatesTo = event.content?["m.relates_to"]?.objectValue
            let relationType = relatesTo?["rel_type"]?.stringValue

            if event.type == "m.reaction",
               let targetEventID = relatesTo?["event_id"]?.stringValue,
               let emoji = relatesTo?["key"]?.stringValue,
               let targetIndex = messageIndexByEventID[targetEventID] {
                toggleReaction(emoji, sender: event.sender, currentUserID: currentUserID, in: &messages[targetIndex])
                continue
            }

            if event.type == "m.room.message", relationType == "m.replace",
               let targetEventID = relatesTo?["event_id"]?.stringValue,
               let targetIndex = messageIndexByEventID[targetEventID],
               let newContent = event.content?["m.new_content"]?.objectValue {
                applyEdit(
                    newContent,
                    fallbackBody: event.content?["body"]?.stringValue ?? "",
                    to: &messages[targetIndex]
                )
                continue
            }

            if event.type == "m.room.redaction",
               let targetEventID = event.redacts,
               let targetIndex = messageIndexByEventID[targetEventID] {
                messages[targetIndex].body = "Nachricht entfernt."
                messages[targetIndex].attachment = nil
                messages[targetIndex].kind = .text
                continue
            }

            guard let message = makeChatMessage(from: event, members: members, currentUserID: currentUserID) else {
                continue
            }

            if let eventID = event.eventID {
                if let existingIndex = messageIndexByEventID[eventID] {
                    messages[existingIndex] = mergeMessage(messages[existingIndex], with: message)
                } else if let localEchoIndex = findMatchingLocalEcho(for: message, in: messages) {
                    messages[localEchoIndex] = mergeMessage(messages[localEchoIndex], with: message)
                    messageIndexByEventID[eventID] = localEchoIndex
                } else {
                    messages.append(message)
                    messageIndexByEventID[eventID] = messages.count - 1
                }
            } else {
                messages.append(message)
            }
        }

        return messages.sorted { $0.timestamp < $1.timestamp }
    }

    private func makeChatMessage(
        from event: MatrixTimelineEvent,
        members: [String: String],
        currentUserID: String
    ) -> ChatMessage? {
        let senderID = event.sender ?? "unknown"
        let senderDisplayName = MatrixDisplayNameResolver.sanitizedDisplayName(
            members[senderID],
            fallbackUserID: senderID
        )
        let timestamp = Date(timeIntervalSince1970: TimeInterval((event.originServerTS ?? 0)) / 1000)
        let isOutgoing = isCurrentUser(senderID, currentUserID: currentUserID)

        if event.type == "m.room.encrypted" {
            return ChatMessage(
                matrixEventID: event.eventID,
                senderDisplayName: senderDisplayName,
                body: encryptedMessagePlaceholderBody,
                timestamp: timestamp,
                isOutgoing: isOutgoing
            )
        }

        guard event.type == "m.room.message" else {
            return nil
        }

        let content = event.content ?? [:]
        let msgtype = content["msgtype"]?.stringValue ?? "m.text"
        let body = content["body"]?.stringValue ?? ""

        switch msgtype {
        case "m.image":
            let contentURI = content["url"]?.stringValue
            let mimeType = content["info"]?.objectValue?["mimetype"]?.stringValue
            let fileSize = content["info"]?.objectValue?["size"]?.intValue
            return ChatMessage(
                matrixEventID: event.eventID,
                senderDisplayName: senderDisplayName,
                body: body,
                timestamp: timestamp,
                isOutgoing: isOutgoing,
                kind: .image,
                attachment: .init(
                    icon: "photo",
                    title: content["filename"]?.stringValue ?? body,
                    subtitle: attachmentSubtitle(from: content, fallback: "Bild"),
                    contentURI: contentURI,
                    mimeType: mimeType,
                    fileSize: fileSize
                )
            )
        case "m.video":
            let contentURI = content["url"]?.stringValue
            let mimeType = content["info"]?.objectValue?["mimetype"]?.stringValue
            let fileSize = content["info"]?.objectValue?["size"]?.intValue
            return ChatMessage(
                matrixEventID: event.eventID,
                senderDisplayName: senderDisplayName,
                body: body,
                timestamp: timestamp,
                isOutgoing: isOutgoing,
                kind: .video,
                attachment: .init(
                    icon: "video.fill",
                    title: content["filename"]?.stringValue ?? body,
                    subtitle: attachmentSubtitle(from: content, fallback: "Video"),
                    contentURI: contentURI,
                    mimeType: mimeType,
                    fileSize: fileSize
                )
            )
        case "m.file":
            let contentURI = content["url"]?.stringValue
            let mimeType = content["info"]?.objectValue?["mimetype"]?.stringValue
            let fileSize = content["info"]?.objectValue?["size"]?.intValue
            return ChatMessage(
                matrixEventID: event.eventID,
                senderDisplayName: senderDisplayName,
                body: body,
                timestamp: timestamp,
                isOutgoing: isOutgoing,
                kind: .file,
                attachment: .init(
                    icon: "doc.fill",
                    title: content["filename"]?.stringValue ?? body,
                    subtitle: attachmentSubtitle(from: content, fallback: "Datei"),
                    contentURI: contentURI,
                    mimeType: mimeType,
                    fileSize: fileSize
                )
            )
        case "m.audio":
            let contentURI = content["url"]?.stringValue
            let mimeType = content["info"]?.objectValue?["mimetype"]?.stringValue
            let fileSize = content["info"]?.objectValue?["size"]?.intValue
            return ChatMessage(
                matrixEventID: event.eventID,
                senderDisplayName: senderDisplayName,
                body: body,
                timestamp: timestamp,
                isOutgoing: isOutgoing,
                kind: .voice,
                attachment: .init(
                    icon: "waveform",
                    title: "Sprachnachricht",
                    subtitle: voiceAttachmentSubtitle(from: content, fallback: "Audio"),
                    contentURI: contentURI,
                    mimeType: mimeType,
                    fileSize: fileSize
                )
            )
        default:
            return ChatMessage(
                matrixEventID: event.eventID,
                senderDisplayName: senderDisplayName,
                body: body,
                timestamp: timestamp,
                isOutgoing: isOutgoing
            )
        }
    }

    private func attachmentSubtitle(from content: [String: MatrixJSONValue], fallback: String) -> String {
        if let info = content["info"]?.objectValue {
            if let mimetype = info["mimetype"]?.stringValue {
                return mimetype
            }
            if let size = info["size"]?.stringValue {
                return size
            }
        }
        return fallback
    }

    private func voiceAttachmentSubtitle(from content: [String: MatrixJSONValue], fallback: String) -> String {
        guard let info = content["info"]?.objectValue else {
            return fallback
        }

        if let durationMs = info["duration"]?.intValue, durationMs > 0 {
            let totalSeconds = durationMs / 1000
            let minutes = totalSeconds / 60
            let seconds = totalSeconds % 60
            let durationText = String(format: "%02d:%02d", minutes, seconds)
            if let mimetype = info["mimetype"]?.stringValue, !mimetype.isEmpty {
                return "\(durationText) / \(mimetype)"
            }
            return durationText
        }

        return attachmentSubtitle(from: content, fallback: fallback)
    }

    private func isCurrentUser(_ senderID: String, currentUserID: String) -> Bool {
        senderID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            == currentUserID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func toggleReaction(_ emoji: String, sender: String?, currentUserID: String, in message: inout ChatMessage) {
        if let index = message.reactions.firstIndex(where: { $0.emoji == emoji }) {
            var reaction = message.reactions[index]
            reaction.count += 1
            if sender == currentUserID {
                reaction.isOwnReaction = true
            }
            message.reactions[index] = reaction
        } else {
            message.reactions.append(.init(emoji: emoji, count: 1, isOwnReaction: sender == currentUserID))
        }
    }

    private func applyEdit(_ newContent: [String: MatrixJSONValue], fallbackBody: String, to message: inout ChatMessage) {
        let replacementBody = newContent["body"]?.stringValue ?? fallbackBody
        message.body = replacementBody
        message.kind = .text
        message.attachment = nil
        message.isEdited = true
    }

    private func mergeMessage(_ existing: ChatMessage, with incoming: ChatMessage) -> ChatMessage {
        var merged = existing
        let keepExistingContent = incoming.body == encryptedMessagePlaceholderBody
            && existing.isOutgoing
            && existing.matrixEventID == nil

        merged.senderDisplayName = keepExistingContent ? existing.senderDisplayName : incoming.senderDisplayName
        merged.body = keepExistingContent ? existing.body : incoming.body
        merged.timestamp = incoming.timestamp
        merged.isOutgoing = keepExistingContent ? existing.isOutgoing : incoming.isOutgoing
        merged.kind = keepExistingContent ? existing.kind : incoming.kind
        if keepExistingContent {
            merged.attachment = existing.attachment
        } else if var incomingAttachment = incoming.attachment {
            if let existingAttachment = existing.attachment,
               incomingAttachment.localCachePath == nil,
               incomingAttachment.contentURI != nil,
               incomingAttachment.contentURI == existingAttachment.contentURI {
                incomingAttachment.localCachePath = existingAttachment.localCachePath
            }
            merged.attachment = incomingAttachment
        } else {
            merged.attachment = nil
        }
        merged.forwardedFrom = incoming.forwardedFrom
        merged.linkedEventID = incoming.linkedEventID
        merged.matrixEventID = incoming.matrixEventID ?? existing.matrixEventID
        // Once a server event is received for this message, it is no longer pending.
        merged.isPending = false
        merged.sendStatus = .sent
        return merged
    }

    private func findMatchingLocalEcho(for incoming: ChatMessage, in messages: [ChatMessage]) -> Int? {
        messages.firstIndex { message in
            guard message.matrixEventID == nil else { return false }
            guard message.isOutgoing == incoming.isOutgoing else { return false }
            guard message.kind == incoming.kind else { return false }
            // For encrypted messages the server-side body is a placeholder.
            // In that case skip the body comparison and rely on sender + timestamp proximity.
            if incoming.body != encryptedMessagePlaceholderBody {
                guard message.body == incoming.body else { return false }
            }
            let delta = abs(message.timestamp.timeIntervalSince(incoming.timestamp))
            return delta < 180
        }
    }
}

private func flattenJSONValue(_ value: MatrixJSONValue) -> String {
    switch value {
    case .string(let text):
        return text
    case .int(let number):
        return String(number)
    case .double(let number):
        return String(number)
    case .bool(let bool):
        return bool ? "true" : "false"
    case .object(let object):
        return object.values.map(flattenJSONValue(_:)).joined(separator: " ")
    case .array(let array):
        return array.map(flattenJSONValue(_:)).joined(separator: " ")
    case .null:
        return ""
    }
}

private enum MatrixRoomClassification {
    case matrix
    case signal
    case instagram
    case whatsapp
    case telegram
    case slack
    case discord
    case sms
    case messenger
    case genericBridge

    static func classify(haystack: String, isSpace: Bool) -> MatrixRoomClassification {
        if haystack.contains("signal") || haystack.contains("mautrix-signal") || haystack.contains("signal_") {
            return .signal
        }
        if haystack.contains("instagram") || haystack.contains("insta") || haystack.contains("mautrix-instagram") || haystack.contains("instagram_") {
            return .instagram
        }
        if haystack.contains("whatsapp") || haystack.contains("mautrix-whatsapp") || haystack.contains("whatsappbridge") || haystack.contains("whatsapp_") {
            return .whatsapp
        }
        if haystack.contains("telegram") || haystack.contains("mautrix-telegram") || haystack.contains("telegram_") {
            return .telegram
        }
        if haystack.contains("slack") {
            return .slack
        }
        if haystack.contains("discord") {
            return .discord
        }
        if haystack.contains("sms") || haystack.contains("imessage") {
            return .sms
        }
        if haystack.contains("messenger") || haystack.contains("facebook") || haystack.contains("mautrix-meta") || haystack.contains("messenger_") || haystack.contains("meta_") {
            return .messenger
        }
        if haystack.contains("mautrix")
            || haystack.contains("appservice")
            || haystack.contains("double puppeting")
            || haystack.contains("bridge bot")
            || haystack.contains("bridge status")
            || haystack.contains("portal room")
            || haystack.contains("relay bot")
            || haystack.contains("puppeting")
            || (isSpace && haystack.contains("bridges")) {
            return .genericBridge
        }
        return .matrix
    }
}

private func descriptor(for classification: MatrixRoomClassification) -> SpaceDescriptor {
    switch classification {
    case .matrix:
        return .init(key: "matrix", title: "Matrix", subtitle: "Native Matrix-Raeume", icon: "bubble.left.and.bubble.right.fill", accent: .ocean, kind: .matrix, avatarSymbol: "bubble.left.and.bubble.right.fill")
    case .signal:
        return .init(key: "signal", title: "Signal", subtitle: "Signal Bridge", icon: "message.fill", accent: .emerald, kind: .signal, avatarSymbol: "message.fill")
    case .instagram:
        return .init(key: "instagram", title: "Instagram", subtitle: "Instagram DMs", icon: "camera.fill", accent: .orchid, kind: .instagram, avatarSymbol: "camera.fill")
    case .whatsapp:
        return .init(key: "whatsapp", title: "WhatsApp", subtitle: "WhatsApp Bridge", icon: "phone.bubble.left.fill", accent: .teal, kind: .whatsapp, avatarSymbol: "phone.fill")
    case .telegram:
        return .init(key: "telegram", title: "Telegram", subtitle: "Telegram Bridge", icon: "paperplane.fill", accent: .violet, kind: .telegram, avatarSymbol: "paperplane.fill")
    case .slack:
        return .init(key: "slack", title: "Slack", subtitle: "Slack Bridge", icon: "number.square.fill", accent: .indigo, kind: .bridge, avatarSymbol: "number.square.fill")
    case .discord:
        return .init(key: "discord", title: "Discord", subtitle: "Discord Bridge", icon: "gamecontroller.fill", accent: .violet, kind: .bridge, avatarSymbol: "gamecontroller.fill")
    case .sms:
        return .init(key: "sms", title: "SMS", subtitle: "SMS Bridge", icon: "text.bubble.fill", accent: .slate, kind: .bridge, avatarSymbol: "text.bubble.fill")
    case .messenger:
        return .init(key: "messenger", title: "Messenger", subtitle: "Facebook Messenger Bridge", icon: "bubble.left.fill", accent: .indigo, kind: .bridge, avatarSymbol: "bubble.left.fill")
    case .genericBridge:
        return .init(key: "bridge", title: "Bridge", subtitle: "Externe Chats", icon: "square.3.layers.3d.top.filled", accent: .slate, kind: .bridge, avatarSymbol: "person.2.fill")
    }
}
