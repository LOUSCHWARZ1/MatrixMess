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

struct MatrixPushHealthStatus: Hashable {
    var deviceTokenAvailable = false
    var lastTokenUpdateAt: Date?
    var lastPusherRegistrationAt: Date?
    var lastPusherVerificationAt: Date?
    var pusherRegisteredOnHomeserver: Bool?
    var lastGatewayReachabilityCheckAt: Date?
    var pushGatewayReachable: Bool?
    var lastGatewayLatencyMs: Int?
    var lastErrorDescription: String?
}

actor MatrixNotificationService {
    private let notificationCenter: UNUserNotificationCenter
    private let session: URLSession
    private(set) var deviceTokenHex: String?
    private(set) var healthStatus = MatrixPushHealthStatus()

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

    func registerForRemoteNotifications() async {
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func updateDeviceToken(_ tokenData: Data) {
        deviceTokenHex = tokenData.map { String(format: "%02x", $0) }.joined()
        healthStatus.deviceTokenAvailable = true
        healthStatus.lastTokenUpdateAt = .now
        healthStatus.lastErrorDescription = nil
    }

    func noteRegistrationFailure(_ error: Error) {
        healthStatus.lastErrorDescription = error.localizedDescription
    }

    func currentHealthStatus() -> MatrixPushHealthStatus {
        healthStatus
    }

    func registerPusher(
        session matrixSession: MatrixSession,
        config: MatrixPushConfig
    ) async throws {
        do {
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
                let lang = Locale.current.languageCode ?? "en"
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
            components?.path = combinedPath(basePath: homeserver.path, endpointPath: "/_matrix/client/v3/pushers/set")
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
            healthStatus.lastPusherRegistrationAt = .now
            healthStatus.lastErrorDescription = nil
        } catch {
            healthStatus.lastErrorDescription = error.localizedDescription
            throw error
        }
    }

    func verifyPusherRegistration(
        session matrixSession: MatrixSession,
        config: MatrixPushConfig
    ) async throws -> Bool {
        guard let token = deviceTokenHex else {
            healthStatus.pusherRegisteredOnHomeserver = false
            healthStatus.lastPusherVerificationAt = .now
            healthStatus.lastErrorDescription = MatrixNotificationServiceError.missingPushToken.localizedDescription
            throw MatrixNotificationServiceError.missingPushToken
        }
        guard let homeserver = URL(string: matrixSession.homeserver), homeserver.host != nil else {
            throw MatrixNotificationServiceError.invalidHomeserver
        }

        struct PushersResponse: Decodable {
            struct Pusher: Decodable {
                struct PusherData: Decodable {
                    let url: String?
                }

                let pushkey: String
                let appID: String
                let data: PusherData?

                enum CodingKeys: String, CodingKey {
                    case pushkey
                    case appID = "app_id"
                    case data
                }
            }

            let pushers: [Pusher]
        }

        var components = URLComponents(url: homeserver, resolvingAgainstBaseURL: false)
        components?.path = combinedPath(basePath: homeserver.path, endpointPath: "/_matrix/client/v3/pushers")
        guard let url = components?.url else {
            throw MatrixNotificationServiceError.invalidHomeserver
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(matrixSession.accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw MatrixServiceError.serverError("Pusher-Status konnte nicht gelesen werden.")
        }

        let payload = try JSONDecoder().decode(PushersResponse.self, from: data)
        let normalizedGateway = config.pushGatewayURL.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let isRegistered = payload.pushers.contains { pusher in
            let samePushKey = pusher.pushkey == token
            let sameApp = pusher.appID == config.appID
            let sameGateway = (pusher.data?.url ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedGateway
            return samePushKey && sameApp && sameGateway
        }

        healthStatus.lastPusherVerificationAt = .now
        healthStatus.pusherRegisteredOnHomeserver = isRegistered
        if isRegistered {
            healthStatus.lastErrorDescription = nil
        }
        return isRegistered
    }

    func checkPushGatewayReachability(pushGatewayURL: String) async {
        let trimmedURL = pushGatewayURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmedURL) else {
            healthStatus.lastGatewayReachabilityCheckAt = .now
            healthStatus.pushGatewayReachable = false
            healthStatus.lastGatewayLatencyMs = nil
            healthStatus.lastErrorDescription = MatrixNotificationServiceError.invalidPushGateway.localizedDescription
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 8
        let start = Date()
        do {
            let (_, response) = try await session.data(for: request)
            let elapsedMs = Int(Date().timeIntervalSince(start) * 1000)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
            healthStatus.lastGatewayReachabilityCheckAt = .now
            healthStatus.lastGatewayLatencyMs = elapsedMs
            healthStatus.pushGatewayReachable = (200..<500).contains(statusCode)
            if healthStatus.pushGatewayReachable == true {
                healthStatus.lastErrorDescription = nil
            } else {
                healthStatus.lastErrorDescription = "Push-Gateway reagiert mit Status \(statusCode)."
            }
        } catch {
            healthStatus.lastGatewayReachabilityCheckAt = .now
            healthStatus.lastGatewayLatencyMs = nil
            healthStatus.pushGatewayReachable = false
            healthStatus.lastErrorDescription = error.localizedDescription
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
