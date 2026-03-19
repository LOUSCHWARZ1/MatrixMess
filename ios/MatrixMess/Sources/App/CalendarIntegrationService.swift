import EventKit
import Foundation

struct CalendarAccessToken: Codable, Hashable {
    let accessToken: String
    let refreshToken: String?
    let expiresAt: Date?
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
        ekEvent.notes = event.note
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
            return ScheduledChatEvent(
                id: UUID(),
                threadID: "",
                title: title,
                note: ekEvent.notes ?? "",
                startDate: ekEvent.startDate,
                endDate: ekEvent.endDate,
                createdBy: "Apple",
                providerIDs: [CalendarProviderKind.apple.rawValue],
                providerEventIDs: [CalendarProviderKind.apple.rawValue: providerEventID]
            )
        }
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
        let (data, _) = try await session.data(for: request)

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
            return ScheduledChatEvent(
                id: UUID(),
                threadID: "",
                title: item.summary ?? "Google Event",
                note: item.description ?? "",
                startDate: start,
                endDate: end,
                createdBy: "Google",
                providerIDs: [kind.rawValue],
                providerEventIDs: [kind.rawValue: item.id]
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
            description: event.note,
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )
        var request = URLRequest(url: URL(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await session.data(for: request)
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
        _ = try await session.data(for: request)
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
            description: event.note,
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )
        var request = URLRequest(url: URL(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events/\(providerEventID)")!)
        request.httpMethod = method
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await session.data(for: request).0
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
            .init(name: "endDateTime", value: formatter.string(from: endDate))
        ]
        guard let url = components?.url else { return [] }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await session.data(for: request)

        struct Response: Decodable {
            struct Item: Decodable {
                struct DateTimeValue: Decodable { let dateTime: String }
                let id: String
                let subject: String?
                let bodyPreview: String?
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
            return ScheduledChatEvent(
                id: UUID(),
                threadID: "",
                title: item.subject ?? "Outlook Event",
                note: item.bodyPreview ?? "",
                startDate: start,
                endDate: end,
                createdBy: "Outlook",
                providerIDs: [kind.rawValue],
                providerEventIDs: [kind.rawValue: item.id]
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
            body: .init(content: event.note),
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )

        var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me/events")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, _) = try await session.data(for: request)
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
            body: .init(content: event.note),
            start: .init(dateTime: formatter.string(from: event.startDate)),
            end: .init(dateTime: formatter.string(from: event.endDate))
        )
        var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me/events/\(providerEventID)")!)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        _ = try await session.data(for: request)
    }

    func deleteEvent(providerEventID: String, token: CalendarAccessToken) async throws {
        var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me/events/\(providerEventID)")!)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token.accessToken)", forHTTPHeaderField: "Authorization")
        _ = try await session.data(for: request)
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
