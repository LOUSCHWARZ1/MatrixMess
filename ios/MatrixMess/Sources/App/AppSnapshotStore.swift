import Foundation

struct PersistedAppSnapshot: Codable {
    var homeserver: String
    var username: String
    var pushGatewayURL: String
    var googleCalendarClientID: String
    var outlookCalendarClientID: String
    var selectedTab: AppTab
    var selectedSpaceID: String
    var selectedThreadID: String?
    var searchText: String
    var themeMode: ThemeMode
    var notificationsEnabled: Bool
    var appLockEnabled: Bool
    var readReceiptsEnabled: Bool
    var typingIndicatorsEnabled: Bool
    var inlineMediaEnabled: Bool
    var saveMediaToPhotos: Bool
    var autoDownloadOnWiFi: Bool
    var calendarAutoSyncEnabled: Bool
    var defaultMeetingDurationMinutes: Int
    var spaces: [ChatSpace]
    var customSpaces: [ChatSpace]
    var threadSpaceOverrides: [String: String]
    var originalHomeSpaceByThreadID: [String: String]
    var threadsByID: [String: ChatThread]
    var messagesByThreadID: [String: [ChatMessage]]
    var mainPinnedThreadIDs: [String]
    var calls: [CallRecord]
    var calendarProviders: [CalendarProviderConnection]
    var scheduledEvents: [ScheduledChatEvent]
    var draftsByThreadID: [String: String]
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case homeserver
        case username
        case pushGatewayURL
        case googleCalendarClientID
        case outlookCalendarClientID
        case selectedTab
        case selectedSpaceID
        case selectedThreadID
        case searchText
        case themeMode
        case notificationsEnabled
        case appLockEnabled
        case readReceiptsEnabled
        case typingIndicatorsEnabled
        case inlineMediaEnabled
        case saveMediaToPhotos
        case autoDownloadOnWiFi
        case calendarAutoSyncEnabled
        case defaultMeetingDurationMinutes
        case spaces
        case customSpaces
        case threadSpaceOverrides
        case originalHomeSpaceByThreadID
        case threadsByID
        case messagesByThreadID
        case mainPinnedThreadIDs
        case calls
        case calendarProviders
        case scheduledEvents
        case draftsByThreadID
        case updatedAt
    }

    init(
        homeserver: String,
        username: String,
        pushGatewayURL: String,
        googleCalendarClientID: String,
        outlookCalendarClientID: String,
        selectedTab: AppTab,
        selectedSpaceID: String,
        selectedThreadID: String?,
        searchText: String,
        themeMode: ThemeMode,
        notificationsEnabled: Bool,
        appLockEnabled: Bool,
        readReceiptsEnabled: Bool,
        typingIndicatorsEnabled: Bool,
        inlineMediaEnabled: Bool,
        saveMediaToPhotos: Bool,
        autoDownloadOnWiFi: Bool,
        calendarAutoSyncEnabled: Bool,
        defaultMeetingDurationMinutes: Int,
        spaces: [ChatSpace],
        customSpaces: [ChatSpace],
        threadSpaceOverrides: [String: String],
        originalHomeSpaceByThreadID: [String: String],
        threadsByID: [String: ChatThread],
        messagesByThreadID: [String: [ChatMessage]],
        mainPinnedThreadIDs: [String],
        calls: [CallRecord],
        calendarProviders: [CalendarProviderConnection],
        scheduledEvents: [ScheduledChatEvent],
        draftsByThreadID: [String: String],
        updatedAt: Date
    ) {
        self.homeserver = homeserver
        self.username = username
        self.pushGatewayURL = pushGatewayURL
        self.googleCalendarClientID = googleCalendarClientID
        self.outlookCalendarClientID = outlookCalendarClientID
        self.selectedTab = selectedTab
        self.selectedSpaceID = selectedSpaceID
        self.selectedThreadID = selectedThreadID
        self.searchText = searchText
        self.themeMode = themeMode
        self.notificationsEnabled = notificationsEnabled
        self.appLockEnabled = appLockEnabled
        self.readReceiptsEnabled = readReceiptsEnabled
        self.typingIndicatorsEnabled = typingIndicatorsEnabled
        self.inlineMediaEnabled = inlineMediaEnabled
        self.saveMediaToPhotos = saveMediaToPhotos
        self.autoDownloadOnWiFi = autoDownloadOnWiFi
        self.calendarAutoSyncEnabled = calendarAutoSyncEnabled
        self.defaultMeetingDurationMinutes = defaultMeetingDurationMinutes
        self.spaces = spaces
        self.customSpaces = customSpaces
        self.threadSpaceOverrides = threadSpaceOverrides
        self.originalHomeSpaceByThreadID = originalHomeSpaceByThreadID
        self.threadsByID = threadsByID
        self.messagesByThreadID = messagesByThreadID
        self.mainPinnedThreadIDs = mainPinnedThreadIDs
        self.calls = calls
        self.calendarProviders = calendarProviders
        self.scheduledEvents = scheduledEvents
        self.draftsByThreadID = draftsByThreadID
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        homeserver = try container.decode(String.self, forKey: .homeserver)
        username = try container.decode(String.self, forKey: .username)
        pushGatewayURL = try container.decodeIfPresent(String.self, forKey: .pushGatewayURL) ?? ""
        googleCalendarClientID = try container.decodeIfPresent(String.self, forKey: .googleCalendarClientID) ?? ""
        outlookCalendarClientID = try container.decodeIfPresent(String.self, forKey: .outlookCalendarClientID) ?? ""
        selectedTab = try container.decode(AppTab.self, forKey: .selectedTab)
        selectedSpaceID = try container.decode(String.self, forKey: .selectedSpaceID)
        selectedThreadID = try container.decodeIfPresent(String.self, forKey: .selectedThreadID)
        searchText = try container.decode(String.self, forKey: .searchText)
        themeMode = try container.decode(ThemeMode.self, forKey: .themeMode)
        notificationsEnabled = try container.decode(Bool.self, forKey: .notificationsEnabled)
        appLockEnabled = try container.decode(Bool.self, forKey: .appLockEnabled)
        readReceiptsEnabled = try container.decode(Bool.self, forKey: .readReceiptsEnabled)
        typingIndicatorsEnabled = try container.decode(Bool.self, forKey: .typingIndicatorsEnabled)
        inlineMediaEnabled = try container.decode(Bool.self, forKey: .inlineMediaEnabled)
        saveMediaToPhotos = try container.decode(Bool.self, forKey: .saveMediaToPhotos)
        autoDownloadOnWiFi = try container.decode(Bool.self, forKey: .autoDownloadOnWiFi)
        calendarAutoSyncEnabled = try container.decode(Bool.self, forKey: .calendarAutoSyncEnabled)
        defaultMeetingDurationMinutes = try container.decode(Int.self, forKey: .defaultMeetingDurationMinutes)
        spaces = try container.decode([ChatSpace].self, forKey: .spaces)
        customSpaces = try container.decodeIfPresent([ChatSpace].self, forKey: .customSpaces) ?? []
        threadSpaceOverrides = try container.decodeIfPresent([String: String].self, forKey: .threadSpaceOverrides) ?? [:]
        originalHomeSpaceByThreadID = try container.decodeIfPresent([String: String].self, forKey: .originalHomeSpaceByThreadID) ?? [:]
        threadsByID = try container.decode([String: ChatThread].self, forKey: .threadsByID)
        messagesByThreadID = try container.decode([String: [ChatMessage]].self, forKey: .messagesByThreadID)
        mainPinnedThreadIDs = try container.decode([String].self, forKey: .mainPinnedThreadIDs)
        calls = try container.decode([CallRecord].self, forKey: .calls)
        calendarProviders = try container.decode([CalendarProviderConnection].self, forKey: .calendarProviders)
        scheduledEvents = try container.decode([ScheduledChatEvent].self, forKey: .scheduledEvents)
        draftsByThreadID = try container.decode([String: String].self, forKey: .draftsByThreadID)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
    }
}

struct AppSnapshotStore {
    private let fileManager: FileManager
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func load() throws -> PersistedAppSnapshot? {
        let url = try snapshotURL()
        guard fileManager.fileExists(atPath: url.path) else {
            return nil
        }

        let data = try Data(contentsOf: url)
        return try decoder.decode(PersistedAppSnapshot.self, from: data)
    }

    func save(_ snapshot: PersistedAppSnapshot) throws {
        let url = try snapshotURL()
        try createParentDirectoryIfNeeded(for: url)
        let data = try encoder.encode(snapshot)
        try data.write(to: url, options: .atomic)
    }

    func clear() throws {
        let url = try snapshotURL()
        guard fileManager.fileExists(atPath: url.path) else {
            return
        }

        try fileManager.removeItem(at: url)
    }

    private func snapshotURL() throws -> URL {
        let directory = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return directory
            .appendingPathComponent("MatrixMess", isDirectory: true)
            .appendingPathComponent("app-snapshot.json", isDirectory: false)
    }

    private func createParentDirectoryIfNeeded(for url: URL) throws {
        let directory = url.deletingLastPathComponent()
        guard !fileManager.fileExists(atPath: directory.path) else {
            return
        }

        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}
