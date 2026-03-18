import Foundation
import SwiftUI

enum AppTab: String, CaseIterable, Hashable, Codable {
    case chats
    case calls
    case calendar
    case settings

    var title: String {
        switch self {
        case .chats: return "Chats"
        case .calls: return "Calls"
        case .calendar: return "Calendar"
        case .settings: return "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .chats: return "message.fill"
        case .calls: return "phone.fill"
        case .calendar: return "calendar"
        case .settings: return "gearshape.fill"
        }
    }
}

enum ThemeMode: String, CaseIterable, Hashable, Codable {
    case system
    case light
    case dark

    var title: String { rawValue.capitalized }

    var preferredColorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

enum SpaceAccent: String, CaseIterable, Hashable, Codable {
    case ocean
    case emerald
    case sunset
    case orchid
    case teal
    case violet
    case indigo
    case slate

    var tint: Color {
        switch self {
        case .ocean: return .blue
        case .emerald: return .green
        case .sunset: return .orange
        case .orchid: return .pink
        case .teal: return .teal
        case .violet: return .purple
        case .indigo: return .indigo
        case .slate: return Color(uiColor: .systemGray)
        }
    }

    var softTint: Color { tint.opacity(0.14) }

    var gradient: LinearGradient {
        LinearGradient(
            colors: [tint.opacity(0.96), tint.opacity(0.66)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

struct ChatSpace: Identifiable, Hashable, Codable {
    enum Kind: String, Hashable, Codable {
        case main
        case matrix
        case signal
        case instagram
        case whatsapp
        case telegram
        case bridge
    }

    static let mainID = "space.main"

    let id: String
    let kind: Kind
    let title: String
    let subtitle: String
    let icon: String
    let accent: SpaceAccent

    var isMain: Bool { id == Self.mainID }
}

struct ChatThread: Identifiable, Hashable, Codable {
    let id: String
    let homeSpaceID: String
    var title: String
    var subtitle: String
    var avatarSymbol: String
    var accent: SpaceAccent
    var lastMessagePreview: String
    var lastActivity: Date
    var unreadCount: Int
    var isMuted: Bool
    var isEncrypted: Bool = false
    var avatarContentURI: String? = nil
    var officialTitle: String? = nil
    var bridgeLabel: String? = nil
    var memberCount: Int? = nil
    var topic: String? = nil
    var isDirect: Bool = false
}

enum ChatMessageKind: String, Hashable, Codable {
    case text
    case voice
    case image
    case video
    case file
    case event
}

struct MessageReaction: Identifiable, Hashable, Codable {
    var id: String { emoji }
    let emoji: String
    var count: Int
    var isOwnReaction: Bool
}

struct MessageAttachment: Hashable, Codable {
    let icon: String
    let title: String
    let subtitle: String
    var contentURI: String?
    var mimeType: String?
    var localCachePath: String?
    var fileSize: Int?

    init(
        icon: String,
        title: String,
        subtitle: String,
        contentURI: String? = nil,
        mimeType: String? = nil,
        localCachePath: String? = nil,
        fileSize: Int? = nil
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.contentURI = contentURI
        self.mimeType = mimeType
        self.localCachePath = localCachePath
        self.fileSize = fileSize
    }
}

struct ChatMessage: Identifiable, Hashable, Codable {
    let id: UUID
    var matrixEventID: String?
    var senderDisplayName: String
    var body: String
    var timestamp: Date
    var isOutgoing: Bool
    var kind: ChatMessageKind
    var attachment: MessageAttachment?
    var forwardedFrom: String?
    var linkedEventID: UUID?
    var reactions: [MessageReaction]
    var isEdited: Bool
    var isPending: Bool

    /// True when the server has not yet confirmed this outgoing message.
    var isDelivered: Bool { !isPending }

    init(
        id: UUID = UUID(),
        matrixEventID: String? = nil,
        senderDisplayName: String,
        body: String,
        timestamp: Date,
        isOutgoing: Bool,
        kind: ChatMessageKind = .text,
        attachment: MessageAttachment? = nil,
        forwardedFrom: String? = nil,
        linkedEventID: UUID? = nil,
        reactions: [MessageReaction] = [],
        isEdited: Bool = false,
        isPending: Bool = false
    ) {
        self.id = id
        self.matrixEventID = matrixEventID
        self.senderDisplayName = senderDisplayName
        self.body = body
        self.timestamp = timestamp
        self.isOutgoing = isOutgoing
        self.kind = kind
        self.attachment = attachment
        self.forwardedFrom = forwardedFrom
        self.linkedEventID = linkedEventID
        self.reactions = reactions
        self.isEdited = isEdited
        self.isPending = isPending
    }
}

struct CallRecord: Identifiable, Hashable, Codable {
    let id: UUID
    let threadID: String
    let kindLabel: String
    let statusLabel: String
    let startedAt: Date
    let note: String

    init(
        id: UUID = UUID(),
        threadID: String,
        kindLabel: String,
        statusLabel: String,
        startedAt: Date,
        note: String
    ) {
        self.id = id
        self.threadID = threadID
        self.kindLabel = kindLabel
        self.statusLabel = statusLabel
        self.startedAt = startedAt
        self.note = note
    }
}

enum CalendarProviderKind: String, CaseIterable, Hashable, Codable {
    case apple
    case google
    case outlook

    var title: String {
        switch self {
        case .apple: return "Apple Calendar"
        case .google: return "Google Calendar"
        case .outlook: return "Outlook"
        }
    }

    var systemImage: String {
        switch self {
        case .apple: return "applelogo"
        case .google: return "globe"
        case .outlook: return "envelope.badge"
        }
    }

    var accent: SpaceAccent {
        switch self {
        case .apple: return .ocean
        case .google: return .emerald
        case .outlook: return .indigo
        }
    }

    var apiLabel: String {
        switch self {
        case .apple: return "EventKit"
        case .google: return "Google Calendar API"
        case .outlook: return "Microsoft Graph"
        }
    }
}

struct CalendarProviderConnection: Identifiable, Hashable, Codable {
    var id: String { kind.rawValue }
    let kind: CalendarProviderKind
    var isConnected: Bool
    var accountLabel: String
    var statusNote: String
}

struct ScheduledChatEvent: Identifiable, Hashable, Codable {
    let id: UUID
    let threadID: String
    let title: String
    let note: String
    let startDate: Date
    let endDate: Date
    let createdBy: String
    let providerIDs: [String]
    var providerEventIDs: [String: String]

    init(
        id: UUID = UUID(),
        threadID: String,
        title: String,
        note: String,
        startDate: Date,
        endDate: Date,
        createdBy: String,
        providerIDs: [String],
        providerEventIDs: [String: String] = [:]
    ) {
        self.id = id
        self.threadID = threadID
        self.title = title
        self.note = note
        self.startDate = startDate
        self.endDate = endDate
        self.createdBy = createdBy
        self.providerIDs = providerIDs
        self.providerEventIDs = providerEventIDs
    }
}

struct AppDiagnostics: Hashable {
    var statusNote = "Noch kein Restore ausgefuehrt."
    var bootstrappedAt: Date?
    var lastSnapshotLoadAt: Date?
    var lastSnapshotSaveAt: Date?
    var lastSessionRestoreAt: Date?
    var lastSessionSaveAt: Date?
    var lastSuccessfulSyncAt: Date?
    var syncFailureCount = 0
    var isSyncLoopRunning = false
    var cachedThreadCount = 0
    var cachedMessageCount = 0
    var lastErrorDescription: String?
}

@MainActor
final class AppState: ObservableObject {
    @Published var homeserver = "https://matrix.org" {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var username = "" {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var password = ""
    @Published var pushGatewayURL = "" {
        didSet { persistSnapshotIfPossible() }
    }
    @Published var googleCalendarClientID = "" {
        didSet { persistSnapshotIfPossible() }
    }
    @Published var outlookCalendarClientID = "" {
        didSet { persistSnapshotIfPossible() }
    }
    @Published private(set) var currentUserID: String?
    @Published private(set) var currentSession: MatrixSession?
    @Published private(set) var isBootstrapping = true
    @Published private(set) var isSyncing = false
    @Published private(set) var cryptoStatus = MatrixCryptoStatus(
        encryptionAvailable: false,
        keyBackupConfigured: false,
        deviceVerificationAvailable: false
    )
    @Published private(set) var verificationFlowState = MatrixVerificationFlowState()
    @Published private(set) var pushNotificationsAuthorized = false
    @Published private(set) var remoteNotificationTokenAvailable = false
    @Published private(set) var activeCallRoomID: String?
    @Published private(set) var syncEngineState = MatrixSyncEngine.State()
    @Published private(set) var diagnostics = AppDiagnostics()
    @Published var errorMessage: String?
    @Published var isSigningIn = false
    @Published var needsPostLoginSetup = false

    @Published var selectedTab: AppTab = .chats {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var selectedSpaceID = ChatSpace.mainID {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var searchText = "" {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var selectedThreadID: String? {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var themeMode: ThemeMode = .system {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var notificationsEnabled = true {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var appLockEnabled = true {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var readReceiptsEnabled = true {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var typingIndicatorsEnabled = true {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var inlineMediaEnabled = true {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var saveMediaToPhotos = false {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var autoDownloadOnWiFi = true {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var calendarAutoSyncEnabled = true {
        didSet { persistSnapshotIfPossible() }
    }

    @Published var defaultMeetingDurationMinutes = 45 {
        didSet { persistSnapshotIfPossible() }
    }

    @Published private(set) var spaces: [ChatSpace] = []
    @Published private(set) var threadsByID: [String: ChatThread] = [:]
    @Published private(set) var messagesByThreadID: [String: [ChatMessage]] = [:]
    @Published private(set) var mainPinnedThreadIDs: [String] = []
    @Published private(set) var calls: [CallRecord] = []
    @Published private(set) var calendarProviders: [CalendarProviderConnection] = []
    @Published private(set) var scheduledEvents: [ScheduledChatEvent] = []
    @Published private(set) var draftsByThreadID: [String: String] = [:]
    /// Maps room IDs to the list of user IDs currently typing in that room.
    @Published private(set) var typingUsersByThreadID: [String: [String]] = [:]

    private let matrixService: MatrixService
    private let mediaService: MatrixMediaService
    private let notificationService: MatrixNotificationService
    private let callService: MatrixCallService
    private let cryptoService: MatrixCryptoService
    private let oauthService: CalendarOAuthService
    private let syncEngine: MatrixSyncEngine
    private let sessionStore: MatrixSessionStore
    private let snapshotStore: AppSnapshotStore
    private let appleCalendarProvider = AppleCalendarProvider()
    private let googleCalendarProvider = GoogleCalendarProvider()
    private let outlookCalendarProvider = OutlookCalendarProvider()
    private let calendarTokenStore = CalendarProviderTokenStore()

    private var hasBootstrapped = false
    private var isHydratingState = false
    private var verificationPollingTask: Task<Void, Never>?
    private var typingDebounceTask: Task<Void, Never>?

    init(
        matrixService: MatrixService = MatrixService(),
        mediaService: MatrixMediaService = MatrixMediaService(),
        notificationService: MatrixNotificationService = MatrixNotificationService(),
        callService: MatrixCallService? = nil,
        cryptoService: MatrixCryptoService? = nil,
        oauthService: CalendarOAuthService? = nil,
        syncEngine: MatrixSyncEngine = MatrixSyncEngine(),
        sessionStore: MatrixSessionStore = MatrixSessionStore(),
        snapshotStore: AppSnapshotStore = AppSnapshotStore()
    ) {
        let resolvedMatrixService = matrixService
        self.matrixService = resolvedMatrixService
        self.mediaService = mediaService
        self.notificationService = notificationService
        self.callService = callService ?? MatrixCallService()
        self.cryptoService = cryptoService ?? MatrixCryptoService(matrixService: resolvedMatrixService)
        self.oauthService = oauthService ?? CalendarOAuthService()
        self.syncEngine = syncEngine
        self.sessionStore = sessionStore
        self.snapshotStore = snapshotStore
    }

    var isLoggedIn: Bool { currentUserID != nil }
    var preferredColorScheme: ColorScheme? { themeMode.preferredColorScheme }
    var selectedSpace: ChatSpace? { spaces.first(where: { $0.id == selectedSpaceID }) ?? spaces.first }

    func bootstrap() async {
        guard !hasBootstrapped else { return }

        hasBootstrapped = true
        isBootstrapping = true
        errorMessage = nil
        AppLogger.info("Bootstrap gestartet.")

        let snapshot = loadPersistedSnapshot()
        if let snapshot {
            applySnapshot(snapshot, includeWorkspace: false)
        }

        await restoreSession(using: snapshot)

        var updatedDiagnostics = diagnostics
        updatedDiagnostics.bootstrappedAt = .now
        diagnostics = updatedDiagnostics

        await refreshCryptoStatus()
        isBootstrapping = false
        AppLogger.info("Bootstrap abgeschlossen.")
    }

    func signIn() async {
        guard !isSigningIn else { return }

        isSigningIn = true
        errorMessage = nil

        do {
            let session = try await matrixService.signIn(
                homeserver: homeserver,
                username: username,
                password: password
            )

            currentSession = session
            currentUserID = session.userID
            let normalizedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
            performHydratingChanges {
                homeserver = session.homeserver
                username = normalizedUsername
            }

            try sessionStore.save(session)
            ensureLocalUtilityDefaults()
            await refreshMatrixData(using: session, forceFullSync: true)
            await startSyncLoopIfPossible()
            await refreshCryptoStatus()

            // Prompt the user to verify their device or enter a recovery key if encryption
            // is active but the device is not yet verified and no recovery is set up.
            if cryptoStatus.encryptionAvailable &&
                cryptoStatus.verificationStateLabel != "Verifiziert" {
                needsPostLoginSetup = true
            }

            AppLogger.info("Login erfolgreich fuer \(session.userID).")
        } catch {
            errorMessage = error.localizedDescription

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastErrorDescription = error.localizedDescription
            updatedDiagnostics.statusNote = "Login fehlgeschlagen."
            diagnostics = updatedDiagnostics

            AppLogger.error("Login fehlgeschlagen: \(error.localizedDescription)")
        }

        isSigningIn = false
    }

    func signOut() {
        AppLogger.info("Lokale Session wird abgemeldet.")

        let sessionToLogout = currentSession
        currentSession = nil
        currentUserID = nil
        password = ""
        errorMessage = nil
        isSyncing = false
        syncEngineState = .init()
        verificationFlowState = MatrixVerificationFlowState()
        needsPostLoginSetup = false
        stopVerificationPolling()
        typingDebounceTask?.cancel()
        typingDebounceTask = nil
        clearWorkspaceData()

        do {
            try sessionStore.clear()
        } catch {
            AppLogger.error("Session-Store konnte nicht geloescht werden: \(error.localizedDescription)")
        }

        persistSnapshotIfPossible(force: true)

        var updatedDiagnostics = diagnostics
        updatedDiagnostics.statusNote = "Session entfernt, Einstellungen bleiben lokal erhalten."
        updatedDiagnostics.lastErrorDescription = nil
        diagnostics = updatedDiagnostics

        if let sessionToLogout {
            Task {
                await syncEngine.stop()
                await matrixService.logout(session: sessionToLogout)
                await refreshSyncDiagnostics()
            }
        } else {
            Task {
                await syncEngine.stop()
                await refreshSyncDiagnostics()
            }
        }
    }

    func rebuildLocalWorkspace() {
        guard isLoggedIn else {
            clearWorkspaceData()
            persistSnapshotIfPossible(force: true)

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.statusNote = "Lokaler Snapshot ohne aktive Session bereinigt."
            diagnostics = updatedDiagnostics
            return
        }

        Task {
            await refreshMatrixData(forceFullSync: true)
        }
    }

    func refreshMatrixData(forceFullSync: Bool = false) async {
        guard let currentSession else { return }
        await refreshMatrixData(using: currentSession, forceFullSync: forceFullSync)
    }

    func syncReadMarker(for threadID: String) async {
        await markThreadReadRemotely(threadID)
    }

    func refreshCryptoStatus() async {
        cryptoStatus = await cryptoService.currentStatus(session: currentSession)
    }

    func prepareCryptoStack() async {
        guard let currentSession else { return }

        do {
            try await cryptoService.prepareEncryptedSession(for: currentSession)
            cryptoStatus = await cryptoService.currentStatus(session: currentSession)
        } catch {
            errorMessage = error.localizedDescription
            AppLogger.error("Crypto-Schicht konnte nicht vorbereitet werden: \(error.localizedDescription)")
        }
    }

    func recoverEncryption(with recoveryKey: String) async {
        guard let currentSession else { return }
        let trimmed = recoveryKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Bitte gib zuerst einen Wiederherstellungsschluessel ein."
            return
        }

        do {
            cryptoStatus = try await cryptoService.recover(using: trimmed, session: currentSession)
            await refreshMatrixData(forceFullSync: true)
        } catch {
            errorMessage = error.localizedDescription
            AppLogger.error("Recovery Key konnte nicht verarbeitet werden: \(error.localizedDescription)")
        }
    }

    func requestCurrentDeviceVerification() async {
        guard let currentSession else { return }

        do {
            try await cryptoService.requestDeviceVerification(session: currentSession)
            cryptoStatus = await cryptoService.currentStatus(session: currentSession)
            await refreshVerificationState()
            startVerificationPolling()
        } catch {
            errorMessage = error.localizedDescription
            AppLogger.error("Geraeteverifizierung konnte nicht gestartet werden: \(error.localizedDescription)")
        }
    }

    func startSasVerification() async {
        guard let currentSession else { return }
        do {
            try await cryptoService.startSasVerification(session: currentSession)
            await refreshVerificationState()
        } catch {
            errorMessage = error.localizedDescription
            AppLogger.error("SAS-Verifizierung konnte nicht gestartet werden: \(error.localizedDescription)")
        }
    }

    func approveVerification() async {
        guard let currentSession else { return }
        do {
            try await cryptoService.approveVerification(session: currentSession)
            await refreshVerificationState()
        } catch {
            errorMessage = error.localizedDescription
            AppLogger.error("Verifizierung konnte nicht bestaetigt werden: \(error.localizedDescription)")
        }
    }

    func declineVerification() async {
        guard let currentSession else { return }
        do {
            try await cryptoService.declineVerification(session: currentSession)
            await refreshVerificationState()
            stopVerificationPolling()
        } catch {
            errorMessage = error.localizedDescription
            AppLogger.error("Verifizierung konnte nicht abgelehnt werden: \(error.localizedDescription)")
        }
    }

    func cancelVerification() async {
        guard let currentSession else { return }
        do {
            try await cryptoService.cancelVerification(session: currentSession)
            await refreshVerificationState()
            stopVerificationPolling()
        } catch {
            errorMessage = error.localizedDescription
            AppLogger.error("Verifizierung konnte nicht abgebrochen werden: \(error.localizedDescription)")
        }
    }

    func refreshVerificationState() async {
        verificationFlowState = await cryptoService.currentVerificationState()
    }

    private static let verificationPollingIntervalNs: UInt64 = 1_500_000_000

    private func startVerificationPolling() {
        verificationPollingTask?.cancel()
        verificationPollingTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { break }
                await self.refreshVerificationState()
                let state = self.verificationFlowState
                if state.isVerified || state.isFailed || state.isCancelled || !state.isActive {
                    break
                }
                try? await Task.sleep(nanoseconds: Self.verificationPollingIntervalNs)
            }
        }
    }

    private func stopVerificationPolling() {
        verificationPollingTask?.cancel()
        verificationPollingTask = nil
    }

    func requestPushNotifications() async {
        do {
            let granted = try await notificationService.requestAuthorization()
            pushNotificationsAuthorized = granted
            if granted {
                await notificationService.registerForRemoteNotifications()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func handleRemoteNotificationToken(_ tokenData: Data) async {
        await notificationService.updateDeviceToken(tokenData)
        remoteNotificationTokenAvailable = true
        await registerMatrixPusherIfPossible()
    }

    func registerMatrixPusher() async {
        guard let currentSession else { return }
        let trimmedGatewayURL = pushGatewayURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedGatewayURL.isEmpty else {
            errorMessage = "Bitte trage zuerst eine Push-Gateway-URL ein."
            return
        }

        do {
            try await notificationService.registerPusher(
                session: currentSession,
                config: .init(
                    appID: "dev.matrixmess.app",
                    pushGatewayURL: trimmedGatewayURL
                )
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func registerMatrixPusherIfPossible() async {
        guard notificationsEnabled, remoteNotificationTokenAvailable, currentSession != nil else { return }
        await registerMatrixPusher()
    }

    func noteRemoteNotificationRegistrationFailure(_ error: Error) {
        remoteNotificationTokenAvailable = false
        errorMessage = error.localizedDescription

        var updatedDiagnostics = diagnostics
        updatedDiagnostics.lastErrorDescription = error.localizedDescription
        updatedDiagnostics.statusNote = "APNs-Registrierung ist fehlgeschlagen."
        diagnostics = updatedDiagnostics
    }

    func startCall(for threadID: String) async {
        guard let thread = thread(withID: threadID) else { return }
        await callService.startCall(roomID: threadID, displayName: thread.title)
        activeCallRoomID = callService.activeCallRoomID
        if let lastCallError = callService.lastCallError {
            errorMessage = lastCallError
        }
        if activeCallRoomID != nil {
            calls.insert(
                .init(
                    threadID: threadID,
                    kindLabel: "Video",
                    statusLabel: "Outgoing",
                    startedAt: .now,
                    note: "CallKit/WebRTC-Start fuer \(thread.title)."
                ),
                at: 0
            )
            persistSnapshotIfPossible()
        }
    }

    func endActiveCall() async {
        await callService.endCall()
        activeCallRoomID = nil
        if let lastCallError = callService.lastCallError {
            errorMessage = lastCallError
        }
    }

    func uploadMedia(
        data: Data,
        mimeType: String,
        fileName: String,
        kind: ChatMessageKind,
        to threadID: String
    ) async {
        guard let currentSession, let thread = thread(withID: threadID) else { return }

        do {
            if thread.isEncrypted {
                let sent = try await matrixService.sendEncryptedMedia(
                    data: data,
                    mimeType: mimeType,
                    fileName: fileName,
                    kind: kind,
                    roomID: threadID,
                    session: currentSession
                )

                let body = attachmentBody(for: kind, fallback: fileName)
                appendMessage(
                    ChatMessage(
                        matrixEventID: sent.matrixEventID,
                        senderDisplayName: "Du",
                        body: body,
                        timestamp: .now,
                        isOutgoing: true,
                        kind: kind,
                        attachment: sent.attachment
                    ),
                    to: threadID,
                    preview: sent.attachment.title
                )
                persistSnapshotIfPossible()
                scheduleDeferredMatrixRefresh()
                return
            }

            let upload = try await mediaService.uploadMedia(
                data: data,
                mimeType: mimeType,
                fileName: fileName,
                messageKind: kind,
                session: currentSession,
                roomIsEncrypted: thread.isEncrypted
            )

            let eventID = try await matrixService.sendMediaMessage(
                roomID: threadID,
                fileName: fileName,
                contentURI: upload.contentURI,
                mimeType: mimeType,
                size: data.count,
                kind: kind,
                session: currentSession,
                isEncrypted: thread.isEncrypted
            )

            appendMessage(
                ChatMessage(
                    matrixEventID: eventID,
                    senderDisplayName: "Du",
                    body: attachmentBody(for: kind, fallback: fileName),
                    timestamp: .now,
                    isOutgoing: true,
                    kind: kind,
                    attachment: upload.attachment
                ),
                to: threadID,
                preview: upload.attachment.title
            )
            persistSnapshotIfPossible()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func downloadAttachment(messageID: UUID, in threadID: String) async {
        guard let currentSession,
              var messages = messagesByThreadID[threadID],
              let index = messages.firstIndex(where: { $0.id == messageID }),
              let attachment = messages[index].attachment,
              let contentURI = attachment.contentURI else {
            return
        }

        do {
            let fileURL = try await mediaService.downloadMedia(contentURI: contentURI, session: currentSession)
            var updatedAttachment = attachment
            updatedAttachment.localCachePath = fileURL.path
            messages[index].attachment = updatedAttachment
            messagesByThreadID[threadID] = messages
            persistSnapshotIfPossible()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func syncExternalCalendar(_ providerKind: CalendarProviderKind, from startDate: Date, to endDate: Date) async {
        do {
            let events: [ScheduledChatEvent]
            switch providerKind {
            case .apple:
                let granted = try await appleCalendarProvider.requestAccess()
                guard granted else {
                    throw MatrixServiceError.serverError("Apple Calendar wurde nicht freigegeben.")
                }
                updateCalendarProvider(
                    providerKind,
                    isConnected: true,
                    accountLabel: "iPhone lokal",
                    statusNote: "EventKit-Zugriff ist aktiv."
                )
                persistSnapshotIfPossible()
                return
            case .google:
                guard let token = try calendarTokenStore.load(providerID: providerKind.rawValue) else {
                    throw MatrixServiceError.serverError("Kein OAuth-Token fuer \(providerKind.title) vorhanden.")
                }
                events = try await googleCalendarProvider.fetchEvents(token: token, from: startDate, to: endDate)
            case .outlook:
                guard let token = try calendarTokenStore.load(providerID: providerKind.rawValue) else {
                    throw MatrixServiceError.serverError("Kein OAuth-Token fuer \(providerKind.title) vorhanden.")
                }
                events = try await outlookCalendarProvider.fetchEvents(token: token, from: startDate, to: endDate)
            }

            var mergedEvents = scheduledEvents
            for fetchedEvent in events {
                let providerEventID = fetchedEvent.providerEventIDs[providerKind.rawValue]
                if let providerEventID,
                   let existingIndex = mergedEvents.firstIndex(where: { $0.providerEventIDs[providerKind.rawValue] == providerEventID }) {
                    var updatedEvent = mergedEvents[existingIndex]
                    updatedEvent = ScheduledChatEvent(
                        id: updatedEvent.id,
                        threadID: updatedEvent.threadID,
                        title: fetchedEvent.title,
                        note: fetchedEvent.note,
                        startDate: fetchedEvent.startDate,
                        endDate: fetchedEvent.endDate,
                        createdBy: fetchedEvent.createdBy,
                        providerIDs: Array(Set(updatedEvent.providerIDs + fetchedEvent.providerIDs)).sorted(),
                        providerEventIDs: updatedEvent.providerEventIDs.merging(fetchedEvent.providerEventIDs) { _, new in new }
                    )
                    mergedEvents[existingIndex] = updatedEvent
                } else {
                    mergedEvents.append(fetchedEvent)
                }
            }

            scheduledEvents = mergedEvents.sorted { $0.startDate < $1.startDate }
            updateCalendarProvider(
                providerKind,
                isConnected: true,
                accountLabel: providerLabel(for: providerKind),
                statusNote: "Kalenderdaten wurden zuletzt am \(Date.now.formatted(date: .abbreviated, time: .shortened)) synchronisiert."
            )
            persistSnapshotIfPossible()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveCalendarToken(_ token: CalendarAccessToken, for providerKind: CalendarProviderKind) {
        do {
            try calendarTokenStore.save(token, providerID: providerKind.rawValue)
            updateCalendarProvider(
                providerKind,
                isConnected: true,
                accountLabel: providerLabel(for: providerKind),
                statusNote: "OAuth-Token gespeichert. Kalender kann jetzt synchronisiert werden."
            )
            persistSnapshotIfPossible()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clearStoredSnapshot() {
        do {
            try snapshotStore.clear()

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.statusNote = "Persistierter Snapshot wurde geloescht."
            updatedDiagnostics.lastSnapshotSaveAt = nil
            diagnostics = updatedDiagnostics

            AppLogger.info("Lokaler Snapshot geloescht.")
        } catch {
            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastErrorDescription = error.localizedDescription
            updatedDiagnostics.statusNote = "Snapshot konnte nicht geloescht werden."
            diagnostics = updatedDiagnostics

            AppLogger.error("Snapshot konnte nicht geloescht werden: \(error.localizedDescription)")
        }
    }

    func selectTab(_ tab: AppTab) {
        selectedTab = tab
    }

    func selectSpace(_ spaceID: String) {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.84)) {
            selectedTab = .chats
            selectedSpaceID = spaceID
            selectedThreadID = nil
        }
    }

    func openThread(_ threadID: String) {
        guard let thread = thread(withID: threadID) else { return }
        selectedTab = .chats
        selectedSpaceID = thread.homeSpaceID
        selectedThreadID = threadID
        markThreadRead(threadID)
        Task {
            await markThreadReadRemotely(threadID)
        }
    }

    func space(withID spaceID: String) -> ChatSpace? {
        spaces.first { $0.id == spaceID }
    }

    func thread(withID threadID: String) -> ChatThread? {
        threadsByID[threadID]
    }

    func sourceSpace(for thread: ChatThread) -> ChatSpace? {
        space(withID: thread.homeSpaceID)
    }

    func bridgeLabel(for thread: ChatThread) -> String {
        thread.bridgeLabel ?? sourceSpace(for: thread)?.title ?? "Matrix"
    }

    func renameThreadLocally(_ threadID: String, to newTitle: String) {
        let trimmed = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, var thread = threadsByID[threadID] else { return }
        thread.title = trimmed
        threadsByID[threadID] = thread
        persistSnapshotIfPossible()
    }

    func mediaDownloadURL(for contentURI: String?) -> URL? {
        guard let currentSession,
              let contentURI,
              !contentURI.isEmpty else {
            return nil
        }

        return matrixService.mediaDownloadURL(for: contentURI, session: currentSession)
    }

    func event(withID eventID: UUID) -> ScheduledChatEvent? {
        scheduledEvents.first { $0.id == eventID }
    }

    func provider(withID providerID: String) -> CalendarProviderConnection? {
        calendarProviders.first { $0.id == providerID }
    }

    func isPinnedInMain(_ threadID: String) -> Bool {
        mainPinnedThreadIDs.contains(threadID)
    }

    func threadCount(for spaceID: String) -> Int {
        if spaceID == ChatSpace.mainID {
            return mainPinnedThreadIDs.count
        }

        return threadsByID.values.filter { $0.homeSpaceID == spaceID }.count
    }

    func visibleThreads(in spaceID: String? = nil) -> [ChatThread] {
        let activeSpaceID = spaceID ?? selectedSpaceID
        let baseThreads: [ChatThread] = activeSpaceID == ChatSpace.mainID
            ? Array(threadsByID.values)
            : threadsByID.values.filter { $0.homeSpaceID == activeSpaceID }

        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = baseThreads.filter { thread in
            guard !query.isEmpty else { return true }

            let sourceTitle = sourceSpace(for: thread)?.title ?? ""
            let haystack = [thread.title, thread.subtitle, thread.lastMessagePreview, sourceTitle]
                .joined(separator: " ")
            return haystack.localizedCaseInsensitiveContains(query)
        }

        return filtered.sorted { lhs, rhs in
            if lhs.lastActivity != rhs.lastActivity {
                return lhs.lastActivity > rhs.lastActivity
            }

            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }
    }

    func messages(for threadID: String) -> [ChatMessage] {
        messagesByThreadID[threadID, default: []].sorted { $0.timestamp < $1.timestamp }
    }

    func sharedMedia(for threadID: String) -> [ChatMessage] {
        messages(for: threadID).filter { [.voice, .image, .video, .file].contains($0.kind) }
    }

    func events(for threadID: String) -> [ScheduledChatEvent] {
        scheduledEvents
            .filter { $0.threadID == threadID }
            .sorted { $0.startDate < $1.startDate }
    }

    func forwardTargets(excluding threadID: String) -> [ChatThread] {
        threadsByID.values
            .filter { $0.id != threadID }
            .sorted { lhs, rhs in
                if lhs.lastActivity != rhs.lastActivity {
                    return lhs.lastActivity > rhs.lastActivity
                }

                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
    }

    func providerNames(for event: ScheduledChatEvent) -> String {
        let names = event.providerIDs.compactMap { provider(withID: $0)?.kind.title }
        return names.isEmpty ? "Nur MatrixMess" : names.joined(separator: ", ")
    }

    func connectedProviderIDs() -> [String] {
        calendarProviders.filter(\.isConnected).map(\.id)
    }

    func upcomingEvents() -> [ScheduledChatEvent] {
        scheduledEvents
            .filter { $0.endDate >= .now.addingTimeInterval(-3600) }
            .sorted { $0.startDate < $1.startDate }
    }

    func draft(for threadID: String) -> String {
        draftsByThreadID[threadID, default: ""]
    }

    func hasDraft(for threadID: String) -> Bool {
        !draft(for: threadID).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func setDraft(_ value: String, for threadID: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            draftsByThreadID.removeValue(forKey: threadID)
        } else {
            draftsByThreadID[threadID] = value
        }
        persistSnapshotIfPossible()
        if typingIndicatorsEnabled {
            scheduleTypingNotification(isTyping: !trimmed.isEmpty, roomID: threadID)
        }
    }

    private func scheduleTypingNotification(isTyping: Bool, roomID: String) {
        typingDebounceTask?.cancel()
        // Capture the session synchronously on the main actor before dispatching.
        let session = currentSession
        typingDebounceTask = Task {
            // Debounce: wait 400 ms before actually sending so we don't spam on every keystroke.
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled, let session else { return }
            try? await matrixService.sendTypingNotification(
                isTyping: isTyping,
                roomID: roomID,
                session: session
            )
        }
    }

    func clearDraft(for threadID: String) {
        guard draftsByThreadID.removeValue(forKey: threadID) != nil else { return }
        persistSnapshotIfPossible()
    }

    func toggleMainPin(for threadID: String) {
        isPinnedInMain(threadID) ? removeFromMain(threadID) : addToMain(threadID)
    }

    func addToMain(_ threadID: String) {
        guard threadsByID[threadID] != nil, !mainPinnedThreadIDs.contains(threadID) else { return }

        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            mainPinnedThreadIDs.insert(threadID, at: 0)
        }

        persistSnapshotIfPossible()
    }

    func removeFromMain(_ threadID: String) {
        guard let index = mainPinnedThreadIDs.firstIndex(of: threadID) else { return }

        withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
            mainPinnedThreadIDs.remove(at: index)
        }

        persistSnapshotIfPossible()
    }

    func markThreadRead(_ threadID: String) {
        guard var thread = threadsByID[threadID], thread.unreadCount > 0 else { return }

        thread.unreadCount = 0
        threadsByID[threadID] = thread
        persistSnapshotIfPossible()
    }

    func toggleMute(for threadID: String) {
        guard var thread = threadsByID[threadID] else { return }

        thread.isMuted.toggle()
        threadsByID[threadID] = thread
        persistSnapshotIfPossible()
    }

    func sendMessage(_ text: String, to threadID: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard let currentSession, let thread = thread(withID: threadID) else { return }

        var sentEventID: String?
        var requiresFollowupRefresh = false
        do {
            sentEventID = try await matrixService.sendMessage(
                trimmed,
                roomID: threadID,
                session: currentSession,
                isEncrypted: thread.isEncrypted
            )
            requiresFollowupRefresh = thread.isEncrypted || sentEventID == nil
        } catch {
            errorMessage = error.localizedDescription

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastErrorDescription = error.localizedDescription
            updatedDiagnostics.statusNote = "Nachricht konnte nicht an den Homeserver gesendet werden."
            diagnostics = updatedDiagnostics
            return
        }

        appendMessage(
            ChatMessage(
                matrixEventID: sentEventID,
                senderDisplayName: "Du",
                body: trimmed,
                timestamp: .now,
                isOutgoing: true,
                isPending: false
            ),
            to: threadID,
            preview: trimmed
        )
        draftsByThreadID.removeValue(forKey: threadID)
        persistSnapshotIfPossible()

        if requiresFollowupRefresh {
            scheduleDeferredMatrixRefresh()
        }
    }

    func sendAttachment(_ kind: ChatMessageKind, to threadID: String) {
        let payload: (MessageAttachment, String, String)?

        switch kind {
        case .voice:
            payload = (
                .init(icon: "waveform", title: "Sprachnachricht", subtitle: "0:18"),
                "Sprachnachricht",
                "Neue Sprachnachricht gesendet."
            )
        case .image:
            payload = (
                .init(icon: "photo", title: "Preview Screen", subtitle: "PNG / 980 KB"),
                "Bild geteilt",
                "Geteiltes Bild aus dem aktuellen Chat."
            )
        case .video:
            payload = (
                .init(icon: "video.fill", title: "Walkthrough Clip", subtitle: "MP4 / 24 MB"),
                "Video geteilt",
                inlineMediaEnabled ? "Video mit Inline-Preview bereit." : "Video geteilt."
            )
        case .file:
            payload = (
                .init(icon: "doc.fill", title: "matrixmess-roadmap.pdf", subtitle: "PDF / 2.4 MB"),
                "Datei geteilt",
                "Roadmap-Datei geteilt."
            )
        case .text, .event:
            payload = nil
        }

        guard let payload else { return }

        let message = ChatMessage(
            senderDisplayName: "Du",
            body: payload.2,
            timestamp: .now,
            isOutgoing: true,
            kind: kind,
            attachment: payload.0
        )

        appendMessage(message, to: threadID, preview: payload.1)
        persistSnapshotIfPossible()
    }

    func toggleReaction(_ emoji: String, on messageID: UUID, in threadID: String) async {
        guard var messages = messagesByThreadID[threadID],
              let index = messages.firstIndex(where: { $0.id == messageID }) else {
            return
        }

        var message = messages[index]
        if let currentSession,
           let matrixEventID = message.matrixEventID,
           let thread = thread(withID: threadID) {
            do {
                _ = try await matrixService.sendReaction(
                    emoji,
                    roomID: threadID,
                    targetEventID: matrixEventID,
                    session: currentSession,
                    isEncrypted: thread.isEncrypted
                )
            } catch {
                errorMessage = error.localizedDescription

                var updatedDiagnostics = diagnostics
                updatedDiagnostics.lastErrorDescription = error.localizedDescription
                updatedDiagnostics.statusNote = "Reaktion konnte nicht an den Homeserver gesendet werden."
                diagnostics = updatedDiagnostics
                return
            }
        }

        applyLocalReaction(emoji, to: &message)
        messages[index] = message
        messagesByThreadID[threadID] = messages
        persistSnapshotIfPossible()
    }

    func editMessage(_ newText: String, messageID: UUID, in threadID: String) async {
        let trimmed = newText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              var messages = messagesByThreadID[threadID],
              let index = messages.firstIndex(where: { $0.id == messageID }) else {
            return
        }

        if let currentSession,
           let matrixEventID = messages[index].matrixEventID,
           let thread = thread(withID: threadID) {
            do {
                _ = try await matrixService.editMessage(
                    trimmed,
                    roomID: threadID,
                    targetEventID: matrixEventID,
                    session: currentSession,
                    isEncrypted: thread.isEncrypted
                )
            } catch {
                errorMessage = error.localizedDescription

                var updatedDiagnostics = diagnostics
                updatedDiagnostics.lastErrorDescription = error.localizedDescription
                updatedDiagnostics.statusNote = "Nachricht konnte nicht bearbeitet werden."
                diagnostics = updatedDiagnostics
                return
            }
        }

        messages[index].body = trimmed
        messages[index].kind = .text
        messages[index].attachment = nil
        messages[index].isEdited = true
        messagesByThreadID[threadID] = messages
        recalculateThreadPreview(for: threadID)
        persistSnapshotIfPossible()
    }

    func redactMessage(_ messageID: UUID, in threadID: String) async {
        guard var messages = messagesByThreadID[threadID],
              let index = messages.firstIndex(where: { $0.id == messageID }) else {
            return
        }

        if let currentSession,
           let matrixEventID = messages[index].matrixEventID,
           let thread = thread(withID: threadID) {
            do {
                _ = try await matrixService.redactMessage(
                    roomID: threadID,
                    targetEventID: matrixEventID,
                    reason: "Von Benutzer entfernt",
                    session: currentSession,
                    isEncrypted: thread.isEncrypted
                )
            } catch {
                errorMessage = error.localizedDescription

                var updatedDiagnostics = diagnostics
                updatedDiagnostics.lastErrorDescription = error.localizedDescription
                updatedDiagnostics.statusNote = "Nachricht konnte nicht geloescht werden."
                diagnostics = updatedDiagnostics
                return
            }
        }

        messages[index].body = "Nachricht entfernt."
        messages[index].kind = .text
        messages[index].attachment = nil
        messages[index].reactions = []
        messages[index].isEdited = false
        messagesByThreadID[threadID] = messages
        recalculateThreadPreview(for: threadID)
        persistSnapshotIfPossible()
    }

    private func applyLocalReaction(_ emoji: String, to message: inout ChatMessage) {
        if let reactionIndex = message.reactions.firstIndex(where: { $0.emoji == emoji }) {
            var reaction = message.reactions[reactionIndex]
            if reaction.isOwnReaction {
                reaction.count = max(0, reaction.count - 1)
                reaction.isOwnReaction = false
            } else {
                reaction.count += 1
                reaction.isOwnReaction = true
            }

            if reaction.count == 0 {
                message.reactions.remove(at: reactionIndex)
            } else {
                message.reactions[reactionIndex] = reaction
            }
        } else {
            message.reactions.append(.init(emoji: emoji, count: 1, isOwnReaction: true))
        }
    }

    private func markThreadReadRemotely(_ threadID: String) async {
        guard let currentSession,
              let latestEventID = messagesByThreadID[threadID]?
                .sorted(by: { $0.timestamp < $1.timestamp })
                .last?
                .matrixEventID else {
            return
        }

        do {
            try await matrixService.markRead(roomID: threadID, eventID: latestEventID, session: currentSession)
        } catch {
            AppLogger.error("Read marker konnte nicht gesetzt werden: \(error.localizedDescription)")
        }
    }

    private func attachmentBody(for kind: ChatMessageKind, fallback: String) -> String {
        switch kind {
        case .image:
            return "Bild geteilt"
        case .video:
            return "Video geteilt"
        case .file:
            return "Datei geteilt"
        case .voice:
            return "Sprachnachricht gesendet"
        case .text, .event:
            return fallback
        }
    }

    private func scheduleDeferredMatrixRefresh() {
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            await refreshMatrixData(forceFullSync: false)
        }
    }

    func forwardMessage(_ messageID: UUID, from sourceThreadID: String, to targetThreadID: String) {
        guard let sourceThread = thread(withID: sourceThreadID),
              var message = messagesByThreadID[sourceThreadID]?.first(where: { $0.id == messageID }) else {
            return
        }

        message.senderDisplayName = "Du"
        message.timestamp = .now
        message.isOutgoing = true
        message.forwardedFrom = sourceThread.title
        message.reactions = []

        appendMessage(
            message,
            to: targetThreadID,
            preview: "Weitergeleitet: \(previewLabel(for: message))"
        )
        persistSnapshotIfPossible()
    }

    func createScheduledEvent(
        title: String,
        note: String,
        startDate: Date,
        endDate: Date,
        in threadID: String,
        providerIDs: [String]
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        var event = ScheduledChatEvent(
            threadID: threadID,
            title: trimmedTitle,
            note: note.trimmingCharacters(in: .whitespacesAndNewlines),
            startDate: startDate,
            endDate: endDate,
            createdBy: "Du",
            providerIDs: calendarAutoSyncEnabled ? providerIDs : []
        )

        if calendarAutoSyncEnabled {
            event = await syncScheduledEventToProviders(event)
        }

        scheduledEvents.append(event)
        scheduledEvents.sort { $0.startDate < $1.startDate }

        let timeText = event.startDate.formatted(date: .abbreviated, time: .shortened)
        let attachment = MessageAttachment(
            icon: "calendar.badge.plus",
            title: event.title,
            subtitle: "\(timeText) / \(providerNames(for: event))"
        )
        let message = ChatMessage(
            senderDisplayName: "Du",
            body: event.note.isEmpty ? "Termin geplant." : event.note,
            timestamp: .now,
            isOutgoing: true,
            kind: .event,
            attachment: attachment,
            linkedEventID: event.id
        )

        appendMessage(message, to: threadID, preview: "Termin geplant: \(event.title)")
        persistSnapshotIfPossible()
    }

    func toggleCalendarConnection(_ providerID: String) async {
        guard let index = calendarProviders.firstIndex(where: { $0.id == providerID }) else { return }

        let providerKind = calendarProviders[index].kind
        if calendarProviders[index].isConnected {
            updateCalendarProvider(
                providerKind,
                isConnected: false,
                accountLabel: "Nicht verbunden",
                statusNote: "\(providerKind.title) ist getrennt."
            )
            persistSnapshotIfPossible()
            return
        }

        do {
            switch providerKind {
            case .apple:
                let granted = try await appleCalendarProvider.requestAccess()
                guard granted else {
                    throw MatrixServiceError.serverError("Apple Calendar wurde nicht freigegeben.")
                }
                updateCalendarProvider(
                    providerKind,
                    isConnected: true,
                    accountLabel: "iPhone lokal",
                    statusNote: "EventKit-Berechtigung ist aktiv."
                )
            case .google, .outlook:
                if try calendarTokenStore.load(providerID: providerKind.rawValue) == nil {
                    try await authorizeCalendarProvider(providerKind)
                }
                updateCalendarProvider(
                    providerKind,
                    isConnected: true,
                    accountLabel: providerLabel(for: providerKind),
                    statusNote: "Provider ist verbunden und bereit fuer API-Sync."
                )
                await syncExternalCalendar(
                    providerKind,
                    from: .now.addingTimeInterval(-60 * 60 * 24 * 30),
                    to: .now.addingTimeInterval(60 * 60 * 24 * 180)
                )
            }
            persistSnapshotIfPossible()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func syncScheduledEventToProviders(_ event: ScheduledChatEvent) async -> ScheduledChatEvent {
        var syncedEvent = event

        for providerID in event.providerIDs {
            guard let provider = provider(withID: providerID), provider.isConnected else { continue }

            do {
                switch provider.kind {
                case .apple:
                    let providerEventID = try await appleCalendarProvider.createEvent(syncedEvent)
                    syncedEvent.providerEventIDs[provider.kind.rawValue] = providerEventID
                case .google:
                    guard let token = try calendarTokenStore.load(providerID: provider.kind.rawValue) else {
                        continue
                    }
                    let providerEventID = try await googleCalendarProvider.createEvent(syncedEvent, token: token)
                    syncedEvent.providerEventIDs[provider.kind.rawValue] = providerEventID
                case .outlook:
                    guard let token = try calendarTokenStore.load(providerID: provider.kind.rawValue) else {
                        continue
                    }
                    let providerEventID = try await outlookCalendarProvider.createEvent(syncedEvent, token: token)
                    syncedEvent.providerEventIDs[provider.kind.rawValue] = providerEventID
                }
            } catch {
                AppLogger.error("Kalender-Sync fuer \(provider.kind.title) fehlgeschlagen: \(error.localizedDescription)")
                errorMessage = error.localizedDescription
            }
        }

        return syncedEvent
    }

    private func authorizeCalendarProvider(_ providerKind: CalendarProviderKind) async throws {
        guard providerKind == .google || providerKind == .outlook else { return }
        let configuration = try oauthConfiguration(for: providerKind)
        let token = try await oauthService.authorize(configuration: configuration)
        saveCalendarToken(token, for: providerKind)
    }

    private func oauthConfiguration(for providerKind: CalendarProviderKind) throws -> CalendarOAuthConfiguration {
        let clientID: String
        let redirectURI: String

        switch providerKind {
        case .google:
            clientID = googleCalendarClientID.trimmingCharacters(in: .whitespacesAndNewlines)
            redirectURI = "dev.matrixmess.app:/oauth/google"
        case .outlook:
            clientID = outlookCalendarClientID.trimmingCharacters(in: .whitespacesAndNewlines)
            redirectURI = "msauth.dev.matrixmess.app://auth"
        case .apple:
            throw MatrixServiceError.serverError("Apple Calendar nutzt EventKit statt OAuth.")
        }

        guard !clientID.isEmpty else {
            throw CalendarOAuthServiceError.missingClientID
        }

        return CalendarOAuthConfiguration(
            providerKind: providerKind,
            clientID: clientID,
            redirectURI: redirectURI
        )
    }

    private func updateCalendarProvider(
        _ providerKind: CalendarProviderKind,
        isConnected: Bool,
        accountLabel: String,
        statusNote: String
    ) {
        guard let index = calendarProviders.firstIndex(where: { $0.kind == providerKind }) else { return }
        calendarProviders[index].isConnected = isConnected
        calendarProviders[index].accountLabel = accountLabel
        calendarProviders[index].statusNote = statusNote
    }

    private func providerLabel(for providerKind: CalendarProviderKind) -> String {
        switch providerKind {
        case .apple:
            return "iPhone lokal"
        case .google:
            return "Google verbunden"
        case .outlook:
            return "Outlook verbunden"
        }
    }

    func previewLabel(for message: ChatMessage) -> String {
        switch message.kind {
        case .text: return message.body
        case .voice: return "Sprachnachricht"
        case .image: return "Bild"
        case .video: return "Video"
        case .file: return "Datei"
        case .event: return message.attachment?.title ?? "Termin"
        }
    }

    private func restoreSession(using snapshot: PersistedAppSnapshot?) async {
        do {
            guard let storedSession = try sessionStore.load() else {
                currentSession = nil
                currentUserID = nil
                clearWorkspaceData()
                persistSnapshotIfPossible(force: true)
                await syncEngine.stop()
                await refreshSyncDiagnostics()

                var updatedDiagnostics = diagnostics
                updatedDiagnostics.statusNote = "Keine gespeicherte Session gefunden."
                updatedDiagnostics.lastErrorDescription = nil
                diagnostics = updatedDiagnostics
                return
            }

            let restoredSession = try await matrixService.restoreSession(storedSession)
            currentSession = restoredSession
            currentUserID = restoredSession.userID
            performHydratingChanges {
                homeserver = restoredSession.homeserver
            }

            if let snapshot, !snapshot.threadsByID.isEmpty {
                applySnapshot(snapshot, includeWorkspace: true)
            } else {
                ensureLocalUtilityDefaults()
                persistSnapshotIfPossible(force: true)
            }

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.statusNote = snapshot?.threadsByID.isEmpty == false
                ? "Session und lokaler Workspace wurden wiederhergestellt."
                : "Session wiederhergestellt, Live-Daten werden geladen."
            updatedDiagnostics.lastSessionRestoreAt = .now
            updatedDiagnostics.lastErrorDescription = nil
            diagnostics = updatedDiagnostics

            AppLogger.info("Session wurde lokal wiederhergestellt.")

            await refreshMatrixData(using: restoredSession, forceFullSync: snapshot == nil)
            await startSyncLoopIfPossible()
        } catch {
            currentSession = nil
            currentUserID = nil
            clearWorkspaceData()
            errorMessage = error.localizedDescription
            await syncEngine.stop()
            await refreshSyncDiagnostics()

            do {
                try sessionStore.clear()
            } catch {
                AppLogger.error("Gespeicherte Session konnte nicht geloescht werden: \(error.localizedDescription)")
            }

            persistSnapshotIfPossible(force: true)

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.statusNote = "Gespeicherte Session war ungueltig und wurde verworfen."
            updatedDiagnostics.lastErrorDescription = error.localizedDescription
            diagnostics = updatedDiagnostics

            AppLogger.error("Session-Restore fehlgeschlagen: \(error.localizedDescription)")
        }
    }

    private func refreshMatrixData(using session: MatrixSession, forceFullSync: Bool) async {
        isSyncing = true
        let effectiveSession = forceFullSync
            ? MatrixSession(
                userID: session.userID,
                homeserver: session.homeserver,
                accessToken: session.accessToken,
                deviceID: session.deviceID,
                signedInAt: session.signedInAt,
                syncToken: nil,
                refreshToken: session.refreshToken,
                oidcData: session.oidcData,
                sdkStoreID: session.sdkStoreID
            )
            : session

        do {
            let workspace = try await matrixService.loadWorkspace(
                session: effectiveSession,
                existingMainPins: mainPinnedThreadIDs,
                existingSpaces: forceFullSync ? [] : spaces,
                existingThreadsByID: forceFullSync ? [:] : threadsByID,
                existingMessagesByThreadID: forceFullSync ? [:] : messagesByThreadID
            )

            currentSession = workspace.session
            currentUserID = workspace.session.userID
            try sessionStore.save(workspace.session)
            applyMatrixWorkspace(workspace)
            persistSnapshotIfPossible(force: true)

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastSessionSaveAt = .now
            updatedDiagnostics.lastSnapshotSaveAt = .now
            updatedDiagnostics.lastSuccessfulSyncAt = .now
            updatedDiagnostics.lastErrorDescription = nil
            updatedDiagnostics.statusNote = "Matrix-Login, Sync und lokale Daten sind aktiv."
            diagnostics = updatedDiagnostics

            AppLogger.info("Matrix-Sync erfolgreich aktualisiert.")
        } catch {
            errorMessage = error.localizedDescription

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastErrorDescription = error.localizedDescription
            updatedDiagnostics.syncFailureCount += 1
            updatedDiagnostics.statusNote = "Live-Sync fehlgeschlagen, lokaler Zustand bleibt erhalten."
            diagnostics = updatedDiagnostics

            AppLogger.error("Matrix-Sync fehlgeschlagen: \(error.localizedDescription)")
        }

        isSyncing = false
        await refreshSyncDiagnostics()
    }

    private func startSyncLoopIfPossible() async {
        guard currentSession != nil else {
            await syncEngine.stop()
            await refreshSyncDiagnostics()
            return
        }

        await syncEngine.start(minimumInterval: 20) { [weak self] in
            guard let self else { return }
            await self.refreshMatrixData(forceFullSync: false)
        }

        await refreshSyncDiagnostics()
        await registerMatrixPusherIfPossible()
    }

    private func refreshSyncDiagnostics() async {
        let state = await syncEngine.currentState()
        syncEngineState = state

        var updatedDiagnostics = diagnostics
        updatedDiagnostics.isSyncLoopRunning = state.isRunning
        updatedDiagnostics.syncFailureCount = state.consecutiveFailures
        updatedDiagnostics.lastSuccessfulSyncAt = state.lastSuccessfulSyncAt ?? updatedDiagnostics.lastSuccessfulSyncAt
        if let failureDescription = state.lastFailureDescription {
            updatedDiagnostics.lastErrorDescription = failureDescription
        }
        diagnostics = updatedDiagnostics
    }

    private func applyMatrixWorkspace(_ workspace: MatrixWorkspace) {
        performHydratingChanges {
            spaces = workspace.spaces
            threadsByID = workspace.threadsByID
            messagesByThreadID = workspace.messagesByThreadID
            mainPinnedThreadIDs = workspace.mainPinnedThreadIDs

            // Merge incoming typing users; clear rooms that are no longer typing.
            var updatedTyping = typingUsersByThreadID
            for (roomID, users) in workspace.typingUsersByThreadID {
                updatedTyping[roomID] = users
            }
            // Remove rooms where the sync payload had no typing users (meaning everyone stopped).
            for roomID in workspace.threadsByID.keys {
                if workspace.typingUsersByThreadID[roomID] == nil {
                    updatedTyping.removeValue(forKey: roomID)
                }
            }
            typingUsersByThreadID = updatedTyping

            if !spaces.contains(where: { $0.id == selectedSpaceID }) {
                selectedSpaceID = ChatSpace.mainID
            }

            if let selectedThreadID, threadsByID[selectedThreadID] == nil {
                self.selectedThreadID = nil
            }

            draftsByThreadID = draftsByThreadID.filter { workspace.threadsByID[$0.key] != nil }

            if calendarProviders.isEmpty {
                calendarProviders = defaultCalendarProviders()
            }
        }

        refreshDiagnosticsStatus()
    }

    private func ensureLocalUtilityDefaults() {
        performHydratingChanges {
            if calendarProviders.isEmpty {
                calendarProviders = defaultCalendarProviders()
            }
        }
        refreshDiagnosticsStatus()
    }

    private func defaultCalendarProviders() -> [CalendarProviderConnection] {
        [
            .init(kind: .apple, isConnected: true, accountLabel: "iPhone lokal", statusNote: "EventKit ist der direkte iOS-Weg fuer lokale Kalender."),
            .init(kind: .google, isConnected: false, accountLabel: "Nicht verbunden", statusNote: "Google Calendar API wird fuer OAuth-Sync vorbereitet."),
            .init(kind: .outlook, isConnected: false, accountLabel: "Nicht verbunden", statusNote: "Outlook-Sync laeuft spaeter ueber Microsoft Graph.")
        ]
    }

    private func loadPersistedSnapshot() -> PersistedAppSnapshot? {
        do {
            let snapshot = try snapshotStore.load()
            if snapshot != nil {
                var updatedDiagnostics = diagnostics
                updatedDiagnostics.lastSnapshotLoadAt = .now
                updatedDiagnostics.lastErrorDescription = nil
                diagnostics = updatedDiagnostics

                AppLogger.info("Persistierter Snapshot gefunden.")
            }
            return snapshot
        } catch {
            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastErrorDescription = error.localizedDescription
            updatedDiagnostics.statusNote = "Lokaler Snapshot konnte nicht gelesen werden."
            diagnostics = updatedDiagnostics

            AppLogger.error("Snapshot konnte nicht gelesen werden: \(error.localizedDescription)")
            return nil
        }
    }

    private func applySnapshot(_ snapshot: PersistedAppSnapshot, includeWorkspace: Bool) {
        performHydratingChanges {
            homeserver = snapshot.homeserver
            username = snapshot.username
            pushGatewayURL = snapshot.pushGatewayURL
            googleCalendarClientID = snapshot.googleCalendarClientID
            outlookCalendarClientID = snapshot.outlookCalendarClientID
            selectedTab = snapshot.selectedTab
            selectedSpaceID = snapshot.selectedSpaceID
            selectedThreadID = snapshot.selectedThreadID
            searchText = snapshot.searchText
            themeMode = snapshot.themeMode
            notificationsEnabled = snapshot.notificationsEnabled
            appLockEnabled = snapshot.appLockEnabled
            readReceiptsEnabled = snapshot.readReceiptsEnabled
            typingIndicatorsEnabled = snapshot.typingIndicatorsEnabled
            inlineMediaEnabled = snapshot.inlineMediaEnabled
            saveMediaToPhotos = snapshot.saveMediaToPhotos
            autoDownloadOnWiFi = snapshot.autoDownloadOnWiFi
            calendarAutoSyncEnabled = snapshot.calendarAutoSyncEnabled
            defaultMeetingDurationMinutes = snapshot.defaultMeetingDurationMinutes

            if includeWorkspace {
                spaces = snapshot.spaces
                threadsByID = snapshot.threadsByID
                messagesByThreadID = snapshot.messagesByThreadID
                mainPinnedThreadIDs = snapshot.mainPinnedThreadIDs
                calls = snapshot.calls
                calendarProviders = snapshot.calendarProviders
                scheduledEvents = snapshot.scheduledEvents
                draftsByThreadID = snapshot.draftsByThreadID
            }
        }

        refreshDiagnosticsStatus()
    }

    private func makeSnapshot() -> PersistedAppSnapshot {
        PersistedAppSnapshot(
            homeserver: homeserver,
            username: username,
            pushGatewayURL: pushGatewayURL,
            googleCalendarClientID: googleCalendarClientID,
            outlookCalendarClientID: outlookCalendarClientID,
            selectedTab: selectedTab,
            selectedSpaceID: selectedSpaceID,
            selectedThreadID: selectedThreadID,
            searchText: searchText,
            themeMode: themeMode,
            notificationsEnabled: notificationsEnabled,
            appLockEnabled: appLockEnabled,
            readReceiptsEnabled: readReceiptsEnabled,
            typingIndicatorsEnabled: typingIndicatorsEnabled,
            inlineMediaEnabled: inlineMediaEnabled,
            saveMediaToPhotos: saveMediaToPhotos,
            autoDownloadOnWiFi: autoDownloadOnWiFi,
            calendarAutoSyncEnabled: calendarAutoSyncEnabled,
            defaultMeetingDurationMinutes: defaultMeetingDurationMinutes,
            spaces: spaces,
            threadsByID: threadsByID,
            messagesByThreadID: messagesByThreadID,
            mainPinnedThreadIDs: mainPinnedThreadIDs,
            calls: calls,
            calendarProviders: calendarProviders,
            scheduledEvents: scheduledEvents,
            draftsByThreadID: draftsByThreadID,
            updatedAt: .now
        )
    }

    private func persistSnapshotIfPossible(force: Bool = false) {
        guard !isHydratingState else { return }
        guard hasBootstrapped || force else { return }

        do {
            try snapshotStore.save(makeSnapshot())

            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastSnapshotSaveAt = .now
            updatedDiagnostics.cachedThreadCount = threadsByID.count
            updatedDiagnostics.cachedMessageCount = messagesByThreadID.values.reduce(0) { $0 + $1.count }
            if updatedDiagnostics.statusNote == "Noch kein Restore ausgefuehrt." {
                updatedDiagnostics.statusNote = "Lokaler Snapshot geschrieben."
            }
            diagnostics = updatedDiagnostics
        } catch {
            var updatedDiagnostics = diagnostics
            updatedDiagnostics.lastErrorDescription = error.localizedDescription
            updatedDiagnostics.statusNote = "Lokaler Snapshot konnte nicht gespeichert werden."
            diagnostics = updatedDiagnostics

            AppLogger.error("Snapshot konnte nicht gespeichert werden: \(error.localizedDescription)")
        }
    }

    private func refreshDiagnosticsStatus() {
        var updatedDiagnostics = diagnostics
        updatedDiagnostics.cachedThreadCount = threadsByID.count
        updatedDiagnostics.cachedMessageCount = messagesByThreadID.values.reduce(0) { $0 + $1.count }
        diagnostics = updatedDiagnostics
    }

    private func performHydratingChanges(_ changes: () -> Void) {
        let previousState = isHydratingState
        isHydratingState = true
        changes()
        isHydratingState = previousState
    }

    private func clearWorkspaceData() {
        performHydratingChanges {
            selectedTab = .chats
            selectedSpaceID = ChatSpace.mainID
            selectedThreadID = nil
            searchText = ""
            spaces = []
            threadsByID = [:]
            messagesByThreadID = [:]
            mainPinnedThreadIDs = []
            calls = []
            scheduledEvents = []
            draftsByThreadID = [:]
            typingUsersByThreadID = [:]
        }

        refreshDiagnosticsStatus()
    }

    private func appendMessage(_ message: ChatMessage, to threadID: String, preview: String) {
        messagesByThreadID[threadID, default: []].append(message)
        updateThreadPreview(threadID, preview: preview, timestamp: message.timestamp)
        refreshDiagnosticsStatus()
    }

    private func updateThreadPreview(_ threadID: String, preview: String, timestamp: Date) {
        guard var thread = threadsByID[threadID] else { return }

        thread.lastMessagePreview = preview
        thread.lastActivity = timestamp
        thread.unreadCount = 0
        threadsByID[threadID] = thread
    }

    private func recalculateThreadPreview(for threadID: String) {
        guard let latest = messagesByThreadID[threadID]?.sorted(by: { $0.timestamp < $1.timestamp }).last else {
            return
        }

        updateThreadPreview(threadID, preview: previewLabel(for: latest), timestamp: latest.timestamp)
    }

    private func loadDemoData() {
        let now = Date()

        performHydratingChanges {
            selectedTab = .chats
            selectedSpaceID = ChatSpace.mainID
            selectedThreadID = nil
            searchText = ""

            spaces = [
                .init(id: ChatSpace.mainID, kind: .main, title: "Main", subtitle: "Wichtige Chats aus allen Spaces", icon: "star.circle.fill", accent: .sunset),
                .init(id: "space.matrix", kind: .matrix, title: "Matrix", subtitle: "Native Matrix-Raeume", icon: "bubble.left.and.bubble.right.fill", accent: .ocean),
                .init(id: "space.signal", kind: .signal, title: "Signal", subtitle: "Gebridgte Signal-Chats", icon: "message.fill", accent: .emerald),
                .init(id: "space.instagram", kind: .instagram, title: "Instagram", subtitle: "DMs und Creator-Chats", icon: "camera.fill", accent: .orchid),
                .init(id: "space.whatsapp", kind: .whatsapp, title: "WhatsApp", subtitle: "Familie und Alltag", icon: "phone.bubble.left.fill", accent: .teal),
                .init(id: "space.telegram", kind: .telegram, title: "Telegram", subtitle: "Gruppen und Polls", icon: "paperplane.fill", accent: .violet)
            ]

            let seededThreads: [ChatThread] = [
                .init(id: "thread.matrix.family", homeSpaceID: "space.matrix", title: "Familie", subtitle: "Matrix Space", avatarSymbol: "house.fill", accent: .ocean, lastMessagePreview: "Abendessen morgen um 19 Uhr?", lastActivity: now.addingTimeInterval(-900), unreadCount: 2, isMuted: false),
                .init(id: "thread.matrix.core", homeSpaceID: "space.matrix", title: "Core Team", subtitle: "Produkt und Roadmap", avatarSymbol: "bolt.fill", accent: .ocean, lastMessagePreview: "Ich habe das neue Space-Konzept skizziert.", lastActivity: now.addingTimeInterval(-4200), unreadCount: 0, isMuted: false),
                .init(id: "thread.signal.lena", homeSpaceID: "space.signal", title: "Lena", subtitle: "Signal Bridge", avatarSymbol: "person.fill", accent: .emerald, lastMessagePreview: "Schickst du mir spaeter noch den Link?", lastActivity: now.addingTimeInterval(-300), unreadCount: 1, isMuted: false),
                .init(id: "thread.signal.wg", homeSpaceID: "space.signal", title: "WG", subtitle: "Signal Gruppe", avatarSymbol: "sofa.fill", accent: .emerald, lastMessagePreview: "Putzplan fuer diese Woche passt fuer mich.", lastActivity: now.addingTimeInterval(-6600), unreadCount: 0, isMuted: true),
                .init(id: "thread.instagram.design", homeSpaceID: "space.instagram", title: "Design Collab", subtitle: "Instagram DM", avatarSymbol: "paintpalette.fill", accent: .orchid, lastMessagePreview: "Die neue Story wirkt viel cleaner.", lastActivity: now.addingTimeInterval(-1800), unreadCount: 0, isMuted: false),
                .init(id: "thread.whatsapp.home", homeSpaceID: "space.whatsapp", title: "Home Crew", subtitle: "WhatsApp Bridge", avatarSymbol: "figure.2.and.child.holdinghands", accent: .teal, lastMessagePreview: "Ich habe das Video gerade geschickt.", lastActivity: now.addingTimeInterval(-2400), unreadCount: 0, isMuted: false),
                .init(id: "thread.telegram.makers", homeSpaceID: "space.telegram", title: "Makers Board", subtitle: "Telegram Gruppe", avatarSymbol: "hammer.fill", accent: .violet, lastMessagePreview: "Koennen wir den Release-Termin kurz planen?", lastActivity: now.addingTimeInterval(-7800), unreadCount: 3, isMuted: false)
            ]

            threadsByID = Dictionary(uniqueKeysWithValues: seededThreads.map { ($0.id, $0) })
            mainPinnedThreadIDs = ["thread.signal.lena", "thread.matrix.family", "thread.instagram.design", "thread.whatsapp.home"]

            let familyDinner = ScheduledChatEvent(threadID: "thread.matrix.family", title: "Familienessen", note: "Abendessen bei Mara, bitte Dessert mitbringen.", startDate: now.addingTimeInterval(86400), endDate: now.addingTimeInterval(88200), createdBy: "Du", providerIDs: ["apple", "google"])
            let creatorReview = ScheduledChatEvent(threadID: "thread.instagram.design", title: "Campaign Review", note: "Kurz die Story-Karten und Reels durchgehen.", startDate: now.addingTimeInterval(172800), endDate: now.addingTimeInterval(175500), createdBy: "Mina", providerIDs: ["apple", "outlook"])
            scheduledEvents = [familyDinner, creatorReview]

            messagesByThreadID = [
                "thread.matrix.family": [
                    .init(senderDisplayName: "Mara", body: "Abendessen morgen um 19 Uhr?", timestamp: now.addingTimeInterval(-900), isOutgoing: false, reactions: [.init(emoji: "\u{2764}\u{FE0F}", count: 1, isOwnReaction: false)]),
                    .init(senderDisplayName: "Du", body: familyDinner.note, timestamp: now.addingTimeInterval(-760), isOutgoing: true, kind: .event, attachment: .init(icon: "calendar.badge.plus", title: familyDinner.title, subtitle: "\(familyDinner.startDate.formatted(date: .abbreviated, time: .shortened)) / Apple Calendar, Google Calendar"), linkedEventID: familyDinner.id)
                ],
                "thread.matrix.core": [
                    .init(senderDisplayName: "Jonas", body: "Ich habe das neue Space-Konzept skizziert.", timestamp: now.addingTimeInterval(-4200), isOutgoing: false),
                    .init(senderDisplayName: "Du", body: "Super, ich schaue gleich drauf.", timestamp: now.addingTimeInterval(-3900), isOutgoing: true),
                    .init(senderDisplayName: "Jonas", body: "Ich schicke spaeter noch die Datei nach.", timestamp: now.addingTimeInterval(-2700), isOutgoing: false, kind: .file, attachment: .init(icon: "doc.fill", title: "space-outline.pdf", subtitle: "PDF / 1.4 MB"))
                ],
                "thread.signal.lena": [
                    .init(senderDisplayName: "Lena", body: "Schickst du mir spaeter noch den Link?", timestamp: now.addingTimeInterval(-300), isOutgoing: false, reactions: [.init(emoji: "\u{2764}\u{FE0F}", count: 1, isOwnReaction: false)]),
                    .init(senderDisplayName: "Du", body: "Ich nehme dir schnell eine Sprachnachricht auf.", timestamp: now.addingTimeInterval(-220), isOutgoing: true, kind: .voice, attachment: .init(icon: "waveform", title: "Sprachnachricht", subtitle: "0:18"))
                ],
                "thread.signal.wg": [
                    .init(senderDisplayName: "Noah", body: "Putzplan fuer diese Woche passt fuer mich.", timestamp: now.addingTimeInterval(-6600), isOutgoing: false)
                ],
                "thread.instagram.design": [
                    .init(senderDisplayName: "Mina", body: "Die neue Story wirkt viel cleaner.", timestamp: now.addingTimeInterval(-1800), isOutgoing: false),
                    .init(senderDisplayName: "Du", body: "Ja, die Typo ist jetzt naeher am Apple-Stil.", timestamp: now.addingTimeInterval(-1500), isOutgoing: true),
                    .init(senderDisplayName: "Mina", body: creatorReview.note, timestamp: now.addingTimeInterval(-1200), isOutgoing: false, kind: .event, attachment: .init(icon: "calendar.badge.plus", title: creatorReview.title, subtitle: "\(creatorReview.startDate.formatted(date: .abbreviated, time: .shortened)) / Apple Calendar, Outlook"), linkedEventID: creatorReview.id, reactions: [.init(emoji: "\u{1F44D}", count: 2, isOwnReaction: false)]),
                    .init(senderDisplayName: "Du", body: "Ich habe dir noch einen aktuellen Screen geschickt.", timestamp: now.addingTimeInterval(-800), isOutgoing: true, kind: .image, attachment: .init(icon: "photo", title: "Preview Screen", subtitle: "PNG / 980 KB"))
                ],
                "thread.whatsapp.home": [
                    .init(senderDisplayName: "Nils", body: "Ich habe das Video gerade geschickt.", timestamp: now.addingTimeInterval(-2400), isOutgoing: false, kind: .video, attachment: .init(icon: "video.fill", title: "Weekend Trip", subtitle: "MP4 / 28 MB"), reactions: [.init(emoji: "\u{1F602}", count: 2, isOwnReaction: false)]),
                    .init(senderDisplayName: "Du", body: "Perfekt, ich lade die Packliste auch hoch.", timestamp: now.addingTimeInterval(-2100), isOutgoing: true, kind: .file, attachment: .init(icon: "doc.fill", title: "packing-list.pdf", subtitle: "PDF / 1.8 MB"))
                ],
                "thread.telegram.makers": [
                    .init(senderDisplayName: "Avery", body: "Koennen wir den Release-Termin kurz planen?", timestamp: now.addingTimeInterval(-7800), isOutgoing: false)
                ]
            ]

            calls = [
                .init(threadID: "thread.signal.lena", kindLabel: "Voice", statusLabel: "Incoming", startedAt: now.addingTimeInterval(-1600), note: "Verpasster Rueckruf ueber den Signal-Space."),
                .init(threadID: "thread.instagram.design", kindLabel: "Video", statusLabel: "Outgoing", startedAt: now.addingTimeInterval(-5100), note: "Kurze Design-Abstimmung zur Story-Reihe."),
                .init(threadID: "thread.telegram.makers", kindLabel: "Call Link", statusLabel: "Upcoming", startedAt: now.addingTimeInterval(64800), note: "Release-Planung mit Community und Bridge-Chats.")
            ]

            calendarProviders = [
                .init(kind: .apple, isConnected: true, accountLabel: "iPhone lokal", statusNote: "EventKit ist der direkte iOS-Weg fuer lokale Kalender."),
                .init(kind: .google, isConnected: true, accountLabel: "lou@gmail.com", statusNote: "Google Calendar API wird fuer OAuth-Sync vorbereitet."),
                .init(kind: .outlook, isConnected: false, accountLabel: "Nicht verbunden", statusNote: "Outlook-Sync laeuft spaeter ueber Microsoft Graph.")
            ]

            draftsByThreadID = [
                "thread.telegram.makers": "Ich bereite gerade noch die Roadmap fuer den Termin vor ..."
            ]
        }

        refreshDiagnosticsStatus()
    }
}
