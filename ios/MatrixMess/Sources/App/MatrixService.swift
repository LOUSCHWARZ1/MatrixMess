import Foundation
import MatrixRustSDK

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
        return try await sdkContext.signIn(
            homeserver: normalizedHomeserver.absoluteString,
            username: sanitizedUsername,
            password: password
        )
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

    func requestOwnDeviceVerification(session: MatrixSession) async throws {
        try await sdkContext.requestDeviceVerification(session: session)
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

    func sendEncryptedMedia(
        data: Data,
        mimeType: String,
        fileName: String,
        kind: ChatMessageKind,
        roomID: String,
        session storedSession: MatrixSession
    ) async throws -> MatrixSDKMediaSendResult {
        try await sdkContext.sendMedia(
            data: data,
            mimeType: mimeType,
            fileName: fileName,
            kind: kind,
            roomID: roomID,
            session: storedSession
        )
    }

    func mediaDownloadURL(
        for contentURI: String,
        session storedSession: MatrixSession
    ) -> URL? {
        sdkContext.mediaDownloadURL(contentURI: contentURI, session: storedSession)
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
        return makeWorkspace(
            from: syncResponse,
            session: storedSession,
            existingMainPins: existingMainPins,
            existingSpaces: existingSpaces,
            existingThreadsByID: existingThreadsByID,
            existingMessagesByThreadID: existingMessagesByThreadID
        )
    }

    func sendMessage(_ text: String, roomID: String, session storedSession: MatrixSession, isEncrypted: Bool) async throws -> String? {
        if isEncrypted {
            return try await sdkContext.sendMessage(text, roomID: roomID, session: storedSession)
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw MatrixServiceError.serverError("Leere Nachrichten werden nicht gesendet.")
        }

        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let txnID = UUID().uuidString.lowercased()
        let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roomID

        let response: MatrixSendEventResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/send/m.room.message/\(txnID)",
            method: "PUT",
            body: MatrixSendMessageRequest(body: trimmed),
            accessToken: storedSession.accessToken
        )
        return response.eventID
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
        let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roomID

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
        let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roomID

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
        let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roomID
        let encodedEventID = targetEventID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? targetEventID

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
        let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roomID

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
        isEncrypted: Bool
    ) async throws -> String {
        guard !isEncrypted else {
            throw MatrixServiceError.unsupportedEncryptedRoom
        }

        let homeserver = try normalizedHomeserver(from: storedSession.homeserver)
        let txnID = UUID().uuidString.lowercased()
        let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roomID
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

        let response: MatrixSendEventResponse = try await performRequest(
            homeserver: homeserver,
            path: "/_matrix/client/v3/rooms/\(encodedRoomID)/send/m.room.message/\(txnID)",
            method: "PUT",
            body: MatrixSendMediaMessageRequest(
                msgtype: msgtype,
                body: fileName,
                filename: fileName,
                url: contentURI,
                info: .init(mimetype: mimeType, size: size)
            ),
            accessToken: storedSession.accessToken
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
            URLQueryItem(name: "set_presence", value: "offline")
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

    private func makeWorkspace(
        from response: MatrixSyncResponse,
        session storedSession: MatrixSession,
        existingMainPins: [String],
        existingSpaces: [ChatSpace],
        existingThreadsByID: [String: ChatThread],
        existingMessagesByThreadID: [String: [ChatMessage]]
    ) -> MatrixWorkspace {
        let isIncrementalSync = storedSession.syncToken != nil
        let joinedRooms = response.rooms?.join ?? [:]
        let leftRoomIDs = Set(
            response.rooms?.leave?.keys
            ?? Dictionary<String, MatrixSyncResponse.LeftRoom>().keys
        )
        let parsedRooms = joinedRooms.map { roomID, room in
            ParsedRoomSnapshot(
                roomID: roomID,
                unreadCount: room.unreadNotifications?.notificationCount ?? 0,
                timelineEvents: room.timeline?.events ?? [],
                stateEvents: room.state?.events ?? []
            )
        }

        let existingActualSpacesByID = Dictionary(
            uniqueKeysWithValues: existingSpaces
                .filter { !$0.isMain && !$0.id.hasPrefix("space.synthetic.") }
                .map { ($0.id, $0) }
        )
        let existingSyntheticSpacesByID = Dictionary(
            uniqueKeysWithValues: existingSpaces
                .filter { $0.id.hasPrefix("space.synthetic.") }
                .map { ($0.id, $0) }
        )

        let actualSpaceRooms = parsedRooms
            .filter(\.isSpace)
            .map { snapshot -> ChatSpace in
                let descriptor = descriptor(for: snapshot.classification)
                return ChatSpace(
                    id: snapshot.roomID,
                    kind: descriptor.kind,
                    title: snapshot.displayName,
                    subtitle: snapshot.topic.isEmpty ? "Matrix Space" : snapshot.topic,
                    icon: descriptor.icon,
                    accent: descriptor.accent
                )
            }

        var actualSpacesByID = isIncrementalSync ? existingActualSpacesByID : [:]
        for space in actualSpaceRooms {
            actualSpacesByID[space.id] = space
        }

        let threadedRooms = parsedRooms.filter { !$0.isSpace }

        var syntheticSpacesByID = isIncrementalSync ? existingSyntheticSpacesByID : [:]
        var threadsByID = isIncrementalSync ? existingThreadsByID : [:]
        var messagesByThreadID = isIncrementalSync ? existingMessagesByThreadID : [:]

        for leftRoomID in leftRoomIDs {
            threadsByID.removeValue(forKey: leftRoomID)
            messagesByThreadID.removeValue(forKey: leftRoomID)
        }

        for snapshot in threadedRooms {
            let assignedSpaceID: String
            let assignedSpace: ChatSpace

            if let parentID = snapshot.parentSpaceIDs.first(where: { actualSpacesByID[$0] != nil }),
               let parentSpace = actualSpacesByID[parentID] {
                assignedSpaceID = parentID
                assignedSpace = parentSpace
            } else {
                let descriptor = descriptor(for: snapshot.classification)
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
            let messages = snapshot.mergedTimelineMessages(
                existingMessages: existingMessages,
                currentUserID: storedSession.userID
            )
            let lastMessage = messages.last
            let previousThread = threadsByID[snapshot.roomID]
            let lastActivity = lastMessage?.timestamp ?? previousThread?.lastActivity ?? .now
            let preview = lastMessage.map(previewText(for:))
                ?? previousThread?.lastMessagePreview
                ?? (snapshot.isEncrypted ? "Verschluesselter Chat" : "Noch keine Nachrichten")

            threadsByID[snapshot.roomID] = ChatThread(
                id: snapshot.roomID,
                homeSpaceID: assignedSpaceID,
                title: snapshot.displayName,
                subtitle: snapshot.subtitle(for: descriptor(for: snapshot.classification)),
                avatarSymbol: descriptor(for: snapshot.classification).avatarSymbol,
                accent: assignedSpace.accent,
                lastMessagePreview: preview,
                lastActivity: lastActivity,
                unreadCount: snapshot.unreadCount,
                isMuted: previousThread?.isMuted ?? false,
                isEncrypted: snapshot.isEncrypted,
                avatarContentURI: snapshot.avatarContentURI(excluding: storedSession.userID),
                officialTitle: snapshot.displayName,
                bridgeLabel: descriptor(for: snapshot.classification).title,
                memberCount: snapshot.memberCount,
                topic: snapshot.topic.isEmpty ? nil : snapshot.topic,
                isDirect: snapshot.isDirect
            )
            messagesByThreadID[snapshot.roomID] = messages
        }

        let usedSpaceIDs = Set(threadsByID.values.map(\.homeSpaceID))
        let actualSpaceRoomIDs = Set(actualSpaceRooms.map(\.id))
        syntheticSpacesByID = syntheticSpacesByID.filter { usedSpaceIDs.contains($0.key) }
        actualSpacesByID = actualSpacesByID.filter { usedSpaceIDs.contains($0.key) || actualSpaceRoomIDs.contains($0.key) }

        let orderedSpaces = [ChatSpace(
            id: ChatSpace.mainID,
            kind: .main,
            title: "Main",
            subtitle: "Wichtige Chats aus allen Spaces",
            icon: "star.circle.fill",
            accent: .sunset
        )]
        + actualSpacesByID.values.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        + syntheticSpacesByID.values.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }

        let availableThreadIDs = Set(threadsByID.keys)
        let filteredPins = existingMainPins.filter { availableThreadIDs.contains($0) }
        let defaultPins = threadsByID.values
            .sorted { $0.lastActivity > $1.lastActivity }
            .prefix(4)
            .map(\.id)
        let mainPins = filteredPins.isEmpty ? defaultPins : filteredPins

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
            mainPinnedThreadIDs: Array(mainPins)
        )
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
        guard let url = URL(string: trimmed), url.scheme != nil, url.host != nil else {
            throw MatrixServiceError.invalidHomeserver
        }
        return url
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
        components?.path = path
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

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MatrixServiceError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let matrixError = try? jsonDecoder.decode(MatrixErrorResponse.self, from: data),
               let message = matrixError.error {
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
    }
}

private struct EmptyMatrixResponse: Decodable {}

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
                let displayName = event.content?["displayname"]?.stringValue ?? userID
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

    var classification: MatrixRoomClassification {
        let memberIDs = memberProfiles.map(\.userID).joined(separator: " ")
        let memberNames = memberProfiles.map(\.displayName).joined(separator: " ")
        let haystack = [displayName, topic, roomID, memberIDs, memberNames]
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
                partialResult[stateKey] = event.content?["displayname"]?.stringValue ?? stateKey
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
        let senderDisplayName = members[senderID] ?? senderID
        let timestamp = Date(timeIntervalSince1970: TimeInterval((event.originServerTS ?? 0)) / 1000)
        let isOutgoing = senderID == currentUserID

        if event.type == "m.room.encrypted" {
            return ChatMessage(
                matrixEventID: event.eventID,
                senderDisplayName: senderDisplayName,
                body: "Verschluesselte Nachricht",
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
            let fileSize = Int(content["info"]?.objectValue?["size"]?.stringValue ?? "")
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
            let fileSize = Int(content["info"]?.objectValue?["size"]?.stringValue ?? "")
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
            let fileSize = Int(content["info"]?.objectValue?["size"]?.stringValue ?? "")
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
            let fileSize = Int(content["info"]?.objectValue?["size"]?.stringValue ?? "")
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
                    subtitle: attachmentSubtitle(from: content, fallback: "Audio"),
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
        merged.senderDisplayName = incoming.senderDisplayName
        merged.body = incoming.body
        merged.timestamp = incoming.timestamp
        merged.isOutgoing = incoming.isOutgoing
        merged.kind = incoming.kind
        merged.attachment = incoming.attachment
        merged.forwardedFrom = incoming.forwardedFrom
        merged.linkedEventID = incoming.linkedEventID
        merged.matrixEventID = incoming.matrixEventID ?? existing.matrixEventID
        return merged
    }

    private func findMatchingLocalEcho(for incoming: ChatMessage, in messages: [ChatMessage]) -> Int? {
        messages.firstIndex { message in
            guard message.matrixEventID == nil else { return false }
            guard message.isOutgoing == incoming.isOutgoing else { return false }
            guard message.kind == incoming.kind else { return false }
            guard message.body == incoming.body else { return false }

            let delta = abs(message.timestamp.timeIntervalSince(incoming.timestamp))
            return delta < 180
        }
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
        if haystack.contains("signal") || haystack.contains("mautrix-signal") {
            return .signal
        }
        if haystack.contains("instagram") || haystack.contains("insta") || haystack.contains("mautrix-instagram") {
            return .instagram
        }
        if haystack.contains("whatsapp") || haystack.contains("mautrix-whatsapp") || haystack.contains("whatsappbridge") {
            return .whatsapp
        }
        if haystack.contains("telegram") || haystack.contains("mautrix-telegram") {
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
        if haystack.contains("messenger") || haystack.contains("facebook") || haystack.contains("mautrix-meta") {
            return .messenger
        }
        return isSpace ? .matrix : .genericBridge
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
