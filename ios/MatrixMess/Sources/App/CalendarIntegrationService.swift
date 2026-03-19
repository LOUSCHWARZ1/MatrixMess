import EventKit
import Foundation

struct CalendarAccessToken: Codable, Hashable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
}

struct CalendarEventMetadata: Hashable {
    let threadID: String
    let localEventID: UUID?
}

enum CalendarEventMetadataCodec {
    private static let markerPrefix = "[matrixmess"
    private static let markerSuffix = "]"

    static func embed(note: String, threadID: String, localEventID: UUID) -> String {
        let cleanedNote = normalize(note)
        guard !threadID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return cleanedNote
        }

        let encodedThreadID = threadID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? threadID
        let marker = "\(markerPrefix) thread=\(encodedThreadID) event=\(localEventID.uuidString.lowercased())\(markerSuffix)"
        if cleanedNote.isEmpty {
            return marker
        }
        return "\(marker)\n\n\(cleanedNote)"
    }

    static func extract(note: String) -> (cleanNote: String, metadata: CalendarEventMetadata?) {
        let lines = note.components(separatedBy: .newlines)
        for line in lines {
            if let metadata = parseMarkerLine(line) {
                let cleanLines = lines.filter { $0 != line }
                let cleanNote = normalize(cleanLines.joined(separator: "\n"))
                return (cleanNote, metadata)
            }
        }
        return (normalize(note), nil)
    }

    static func normalize(_ note: String) -> String {
        note
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func parseMarkerLine(_ line: String) -> CalendarEventMetadata? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix(markerPrefix), trimmed.hasSuffix(markerSuffix) else { return nil }

        let body = trimmed
            .dropFirst(markerPrefix.count)
            .dropLast(markerSuffix.count)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return nil }

        var threadID: String?
        var localEventID: UUID?
        for token in body.components(separatedBy: .whitespaces).filter({ !$0.isEmpty }) {
            let pair = token.split(separator: "=", maxSplits: 1).map(String.init)
            guard pair.count == 2 else { continue }
            let key = pair[0].lowercased()
            let value = pair[1]
            switch key {
            case "thread":
                threadID = value.removingPercentEncoding ?? value
            case "event":
                localEventID = UUID(uuidString: value)
            default:
                continue
            }
        }

        guard let threadID, !threadID.isEmpty else { return nil }
        return CalendarEventMetadata(threadID: threadID, localEventID: localEventID)
    }
}

protocol ExternalCalendarProvider {
    var kind: CalendarProviderKind { get }
    func fetchEvents(token: CalendarAccessToken, from startDate: Date, to endDate: Date) async throws -> [ScheduledChatEvent]
    func createEvent(_ event: ScheduledChatEvent, token: CalendarAccessToken) async throws -> String
    func updateEvent(_ event: ScheduledChatEvent, providerEventID: String, token: CalendarAccessToken) async throws
    func deleteEvent(providerEventID: String, token: CalendarAccessToken) async throws
}

struct AppleCalendarProvider {
    private let store = EKEventStore()

    func requestAccess() async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            store.requestAccess(to: .event) { granted, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: granted)
                }
            }
        }
    }

    func createEvent(_ event: ScheduledChatEvent) async throws -> String {
        let granted = try await requestAccess()
        guard granted else {
            throw MatrixServiceError.serverError("Kein Kalenderzugriff fuer Apple Calendar.")
        }

        let ekEvent = EKEvent(eventStore: store)
        ekEvent.title = event.title
        ekEvent.notes = CalendarEventMetadataCodec.embed(
            note: event.note,
            threadID: event.threadID,
            localEventID: event.id
        )
        ekEvent.startDate = event.startDate
        ekEvent.endDate = event.endDate
        ekEvent.calendar = store.defaultCalendarForNewEvents
        try store.save(ekEvent, span: .thisEvent)
        return ekEvent.eventIdentifier
    }

    func fetchEvents(from startDate: Date, to endDate: Date) async throws -> [ScheduledChatEvent] {
        let granted = try await requestAccess()
        guard granted else {
            throw MatrixServiceError.serverError("Kein Kalenderzugriff fuer Apple Calendar.")
        }

        let predicate = store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
        let events = store.events(matching: predicate)
        return events.compactMap { ekEvent in
            guard let providerEventID = ekEvent.eventIdentifier else { return nil }
            let rawTitle = (ekEvent.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let title = rawTitle.isEmpty ? "Apple Event" : rawTitle
            let noteResult = CalendarEventMetadataCodec.extract(note: ekEvent.notes ?? "")
            return ScheduledChatEvent(
                id: noteResult.metadata?.localEventID ?? UUID(),
                threadID: noteResult.metadata?.threadID ?? "",
                title: title,
                note: noteResult.cleanNote,
                startDate: ekEvent.startDate,
                endDate: ekEvent.endDate,
                createdBy: "Apple",
                providerIDs: [CalendarProviderKind.apple.rawValue],
                providerEventIDs: [CalendarProviderKind.apple.rawValue: providerEventID],
                lastModifiedAt: .now,
                lastSyncedAt: .now
            )
        }
    }

    func updateEvent(_ event: ScheduledChatEvent, providerEventID: String) async throws {
        let granted = try await requestAccess()
        guard granted else {
            throw MatrixServiceError.serverError("Kein Kalenderzugriff fuer Apple Calendar.")
        }
        guard let existing = store.event(withIdentifier: providerEventID) else {
            throw MatrixServiceError.serverError("Apple-Event nicht gefunden.")
        }

        existing.title = event.title
        existing.notes = CalendarEventMetadataCodec.embed(
            note: event.note,
            threadID: event.threadID,
            localEventID: event.id
        )
        existing.startDate = event.startDate
        existing.endDate = event.endDate
        try store.save(existing, span: .thisEvent)
    }

    func deleteEvent(providerEventID: String) async throws {
        let granted = try await requestAccess()
        guard granted else {
            throw MatrixServiceError.serverError("Kein Kalenderzugriff fuer Apple Calendar.")
        }
        guard let existing = store.event(withIdentifier: providerEventID) else {
            return
        }
        try store.remove(existing, span: .thisEvent)
    }
}

struct GoogleCalendarProvider: ExternalCalendarProvider {
    let kind: CalendarProviderKind = .google
    private let session: URLSession = .shared

    func fetchEvents(token: CalendarAccessToken, from startDate: Date, to endDate: Date) async throws -> [ScheduledChatEvent] {
        var components = URLComponents(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events")
        components?.queryItems = [
            .init(name: "timeMin", value: ISO8601DateFormatter().string(from: startDate)),
            .init(name: "timeMax", value: ISO8601DateFormatter().string(from: endDate)),
            .init(name: "singleEvents", value: "true")
        ]
        guard let url = components?.url else { return [] }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        let data = try await validatedData(for: request, providerLabel: "Google Calendar")

        struct Response: Decodable {
            struct Item: Decodable {
                struct DateValue: Decodable { let dateTime: String? }
                let id: String
                let summary: String?
                let description: String?
                let start: DateValue?
                let end: DateValue?
            }
            let items: [Item]
        }

        let response = try JSONDecoder().decode(Response.self, from: data)
        return response.items.compactMap { item in
            guard let startString = item.start?.dateTime,
                  let endString = item.end?.dateTime,
                  let start = ISO8601DateFormatter().date(from: startString),
                  let end = ISO8601DateFormatter().date(from: endString) else {
                return nil
            }
            let noteResult = CalendarEventMetadataCodec.extract(note: item.description ?? "")
            return ScheduledChatEvent(
                id: noteResult.metadata?.localEventID ?? UUID(),
                threadID: noteResult.metadata?.threadID ?? "",
                title: item.summary ?? "Google Event",
                note: noteResult.cleanNote,
                startDate: start,
                endDate: end,
                createdBy: "Google",
                providerIDs: [kind.rawValue],
                providerEventIDs: [kind.rawValue: item.id],
                lastModifiedAt: .now,
                lastSyncedAt: .now
            )
        }
    }

    func createEvent(_ event: ScheduledChatEvent, token: CalendarAccessToken) async throws -> String {
        struct RequestBody: Encodable {
            struct DateValue: Encodable { let dateTime: String }
            let summary: String
            let description: String
            let start: DateValue
            let end: DateValue
        }
        let formatter = ISO8601DateFormatter()
        let body = RequestBody(
            summary: event.title,
            description: CalendarEventMetadataCodec.embed(
                note: event.note,
                threadID: event.threadID,
                localEventID: event.id
            ),
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )
        var request = URLRequest(url: URL(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await validatedData(for: request, providerLabel: "Google Calendar")
        struct Response: Decodable { let id: String }
        return try JSONDecoder().decode(Response.self, from: data).id
    }

    func updateEvent(_ event: ScheduledChatEvent, providerEventID: String, token: CalendarAccessToken) async throws {
        _ = try await createOrUpdate(event, providerEventID: providerEventID, token: token, method: "PATCH")
    }

    func deleteEvent(providerEventID: String, token: CalendarAccessToken) async throws {
        var request = URLRequest(url: URL(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events/\(providerEventID)")!)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        _ = try await validatedData(for: request, providerLabel: "Google Calendar")
    }

    private func createOrUpdate(_ event: ScheduledChatEvent, providerEventID: String, token: CalendarAccessToken, method: String) async throws -> Data {
        struct RequestBody: Encodable {
            struct DateValue: Encodable { let dateTime: String }
            let summary: String
            let description: String
            let start: DateValue
            let end: DateValue
        }
        let formatter = ISO8601DateFormatter()
        let body = RequestBody(
            summary: event.title,
            description: CalendarEventMetadataCodec.embed(
                note: event.note,
                threadID: event.threadID,
                localEventID: event.id
            ),
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )
        var request = URLRequest(url: URL(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events/\(providerEventID)")!)
        request.httpMethod = method
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await validatedData(for: request, providerLabel: "Google Calendar")
    }

    private func validatedData(for request: URLRequest, providerLabel: String) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MatrixServiceError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw MatrixServiceError.serverError("\(providerLabel) Fehler (\(httpResponse.statusCode)).")
        }
        return data
    }
}

struct OutlookCalendarProvider: ExternalCalendarProvider {
    let kind: CalendarProviderKind = .outlook
    private let session: URLSession = .shared

    func fetchEvents(token: CalendarAccessToken, from startDate: Date, to endDate: Date) async throws -> [ScheduledChatEvent] {
        let formatter = ISO8601DateFormatter()
        var components = URLComponents(string: "https://graph.microsoft.com/v1.0/me/calendarView")
        components?.queryItems = [
            .init(name: "startDateTime", value: formatter.string(from: startDate)),
            .init(name: "endDateTime", value: formatter.string(from: endDate)),
            .init(name: "$select", value: "id,subject,bodyPreview,body,start,end")
        ]
        guard let url = components?.url else { return [] }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        let data = try await validatedData(for: request, providerLabel: "Outlook Calendar")

        struct Response: Decodable {
            struct Item: Decodable {
                struct DateTimeValue: Decodable { let dateTime: String }
                struct BodyValue: Decodable { let content: String? }
                let id: String
                let subject: String?
                let bodyPreview: String?
                let body: BodyValue?
                let start: DateTimeValue?
                let end: DateTimeValue?
            }
            let value: [Item]
        }

        let response = try JSONDecoder().decode(Response.self, from: data)
        return response.value.compactMap { item in
            guard let startString = item.start?.dateTime,
                  let endString = item.end?.dateTime,
                  let start = formatter.date(from: startString),
                  let end = formatter.date(from: endString) else {
                return nil
            }
            let rawBody = item.body?.content ?? item.bodyPreview ?? ""
            let noteResult = CalendarEventMetadataCodec.extract(note: stripHTMLTags(rawBody))
            return ScheduledChatEvent(
                id: noteResult.metadata?.localEventID ?? UUID(),
                threadID: noteResult.metadata?.threadID ?? "",
                title: item.subject ?? "Outlook Event",
                note: noteResult.cleanNote,
                startDate: start,
                endDate: end,
                createdBy: "Outlook",
                providerIDs: [kind.rawValue],
                providerEventIDs: [kind.rawValue: item.id],
                lastModifiedAt: .now,
                lastSyncedAt: .now
            )
        }
    }

    func createEvent(_ event: ScheduledChatEvent, token: CalendarAccessToken) async throws -> String {
        struct RequestBody: Encodable {
            struct DateValue: Encodable {
                let dateTime: String
                let timeZone = "UTC"
            }
            let subject: String
            let body: Body
            let start: DateValue
            let end: DateValue

            struct Body: Encodable {
                let contentType = "text"
                let content: String
            }
        }

        let formatter = ISO8601DateFormatter()
        let body = RequestBody(
            subject: event.title,
            body: .init(content: CalendarEventMetadataCodec.embed(
                note: event.note,
                threadID: event.threadID,
                localEventID: event.id
            )),
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )

        var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me/events")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let data = try await validatedData(for: request, providerLabel: "Outlook Calendar")
        struct Response: Decodable { let id: String }
        return try JSONDecoder().decode(Response.self, from: data).id
    }

    func updateEvent(_ event: ScheduledChatEvent, providerEventID: String, token: CalendarAccessToken) async throws {
        struct RequestBody: Encodable {
            struct DateValue: Encodable {
                let dateTime: String
                let timeZone = "UTC"
            }
            let subject: String
            let body: Body
            let start: DateValue
            let end: DateValue

            struct Body: Encodable {
                let contentType = "text"
                let content: String
            }
        }

        let formatter = ISO8601DateFormatter()
        let body = RequestBody(
            subject: event.title,
            body: .init(content: CalendarEventMetadataCodec.embed(
                note: event.note,
                threadID: event.threadID,
                localEventID: event.id
            )),
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )
        var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me/events/\(providerEventID)")!)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        _ = try await validatedData(for: request, providerLabel: "Outlook Calendar")
    }

    func deleteEvent(providerEventID: String, token: CalendarAccessToken) async throws {
        var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me/events/\(providerEventID)")!)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        _ = try await validatedData(for: request, providerLabel: "Outlook Calendar")
    }

    private func validatedData(for request: URLRequest, providerLabel: String) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw MatrixServiceError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw MatrixServiceError.serverError("\(providerLabel) Fehler (\(httpResponse.statusCode)).")
        }
        return data
    }

    private func stripHTMLTags(_ text: String) -> String {
        guard !text.isEmpty else { return text }
        guard let regex = try? NSRegularExpression(pattern: "<[^>]+>", options: []) else {
            return text
        }
        let range = NSRange(location: 0, length: (text as NSString).length)
        let stripped = regex.stringByReplacingMatches(in: text, options: [], range: range, withTemplate: "")
        return CalendarEventMetadataCodec.normalize(stripped)
    }
}

struct CalendarProviderTokenStore {
    private let keychain = KeychainStore()
    private let service = "dev.matrixmess.app.calendar-tokens"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    func load(providerID: String) throws -> CalendarAccessToken? {
        guard let data = try keychain.read(service: service, account: providerID) else {
            return nil
        }
        return try decoder.decode(CalendarAccessToken.self, from: data)
    }

    func save(_ token: CalendarAccessToken, providerID: String) throws {
        let data = try encoder.encode(token)
        try keychain.write(data, service: service, account: providerID)
    }
}
