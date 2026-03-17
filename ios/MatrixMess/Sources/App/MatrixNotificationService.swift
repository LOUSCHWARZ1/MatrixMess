import Foundation
import UIKit
import UserNotifications

enum MatrixNotificationServiceError: LocalizedError {
    case missingPushToken
    case invalidHomeserver
    case invalidPushGateway

    var errorDescription: String? {
        switch self {
        case .missingPushToken:
            return "Es liegt noch kein APNs-Token vor."
        case .invalidHomeserver:
            return "Die Homeserver-URL ist fuer Push ungueltig."
        case .invalidPushGateway:
            return "Die Push-Gateway-URL ist ungueltig."
        }
    }
}

struct MatrixPushConfig: Hashable {
    let appID: String
    let pushGatewayURL: String
}

actor MatrixNotificationService {
    private let notificationCenter: UNUserNotificationCenter
    private let session: URLSession
    private(set) var deviceTokenHex: String?

    init(
        notificationCenter: UNUserNotificationCenter = .current(),
        session: URLSession = .shared
    ) {
        self.notificationCenter = notificationCenter
        self.session = session
    }

    func requestAuthorization() async throws -> Bool {
        try await notificationCenter.requestAuthorization(options: [.alert, .badge, .sound])
    }

    nonisolated @MainActor
    func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func updateDeviceToken(_ tokenData: Data) {
        deviceTokenHex = tokenData.map { String(format: "%02x", $0) }.joined()
    }

    func registerPusher(
        session matrixSession: MatrixSession,
        config: MatrixPushConfig
    ) async throws {
        guard let token = deviceTokenHex else {
            throw MatrixNotificationServiceError.missingPushToken
        }
        guard let homeserver = URL(string: matrixSession.homeserver), homeserver.host != nil else {
            throw MatrixNotificationServiceError.invalidHomeserver
        }
        guard URL(string: config.pushGatewayURL) != nil else {
            throw MatrixNotificationServiceError.invalidPushGateway
        }

        struct PusherData: Encodable {
            let url: String
            let format = "event_id_only"
        }

        struct PusherRequest: Encodable {
            let pushkey: String
            let kind = "http"
            let appID: String
            let appDisplayName = "MatrixMess"
            let deviceDisplayName = "iPhone"
            let profileTag = "matrixmess-ios"
            let lang = Locale.current.language.languageCode?.identifier ?? "en"
            let data: PusherData
            let append = false

            enum CodingKeys: String, CodingKey {
                case pushkey
                case kind
                case appID = "app_id"
                case appDisplayName = "app_display_name"
                case deviceDisplayName = "device_display_name"
                case profileTag = "profile_tag"
                case lang
                case data
                case append
            }
        }

        var components = URLComponents(url: homeserver, resolvingAgainstBaseURL: false)
        components?.path = "/_matrix/client/v3/pushers/set"
        guard let url = components?.url else {
            throw MatrixNotificationServiceError.invalidHomeserver
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(matrixSession.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            PusherRequest(
                pushkey: token,
                appID: config.appID,
                data: .init(url: config.pushGatewayURL)
            )
        )

        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw MatrixServiceError.serverError("Pusher konnte nicht registriert werden.")
        }
    }
}
