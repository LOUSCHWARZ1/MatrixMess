import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

enum CalendarOAuthServiceError: LocalizedError {
    case missingClientID
    case invalidRedirectURI
    case authorizationCancelled
    case authorizationFailed(String)
    case invalidCallback
    case invalidState
    case missingAuthorizationCode
    case tokenExchangeFailed

    var errorDescription: String? {
        switch self {
        case .missingClientID:
            return "Fuer den Provider fehlt noch die OAuth-Client-ID."
        case .invalidRedirectURI:
            return "Die Redirect-URI fuer OAuth ist ungueltig."
        case .authorizationCancelled:
            return "Die OAuth-Anmeldung wurde abgebrochen."
        case .authorizationFailed(let message):
            return message
        case .invalidCallback:
            return "Die OAuth-Rueckgabe war unvollstaendig."
        case .invalidState:
            return "Die OAuth-State-Pruefung ist fehlgeschlagen."
        case .missingAuthorizationCode:
            return "Der Authorization Code fehlt in der Rueckgabe."
        case .tokenExchangeFailed:
            return "Der OAuth-Token konnte nicht abgerufen werden."
        }
    }
}

struct CalendarOAuthConfiguration: Hashable {
    let providerKind: CalendarProviderKind
    let clientID: String
    let redirectURI: String

    var authorizationURL: URL {
        switch providerKind {
        case .google:
            return URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        case .outlook:
            return URL(string: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize")!
        case .apple:
            return URL(string: "https://apple.invalid")!
        }
    }

    var tokenURL: URL {
        switch providerKind {
        case .google:
            return URL(string: "https://oauth2.googleapis.com/token")!
        case .outlook:
            return URL(string: "https://login.microsoftonline.com/common/oauth2/v2.0/token")!
        case .apple:
            return URL(string: "https://apple.invalid")!
        }
    }

    var scopes: [String] {
        switch providerKind {
        case .google:
            return ["https://www.googleapis.com/auth/calendar"]
        case .outlook:
            return ["offline_access", "https://graph.microsoft.com/Calendars.ReadWrite"]
        case .apple:
            return []
        }
    }

    var callbackScheme: String {
        URL(string: redirectURI)?.scheme ?? ""
    }
}

@MainActor
final class CalendarOAuthService: NSObject {
    private let session: URLSession
    private let presentationContextProvider = OAuthPresentationContextProvider()
    private var currentAuthSession: ASWebAuthenticationSession?

    init(session: URLSession = .shared) {
        self.session = session
    }

    func authorize(configuration: CalendarOAuthConfiguration) async throws -> CalendarAccessToken {
        guard !configuration.clientID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw CalendarOAuthServiceError.missingClientID
        }
        guard let redirectURL = URL(string: configuration.redirectURI),
              redirectURL.scheme != nil else {
            throw CalendarOAuthServiceError.invalidRedirectURI
        }

        let state = randomURLSafeString(length: 32)
        let codeVerifier = randomURLSafeString(length: 64)
        let codeChallenge = codeChallenge(for: codeVerifier)
        let authURL = try makeAuthorizationURL(
            configuration: configuration,
            redirectURI: configuration.redirectURI,
            state: state,
            codeChallenge: codeChallenge
        )

        let callbackURL = try await startAuthorizationSession(
            authorizationURL: authURL,
            callbackScheme: configuration.callbackScheme
        )
        let callbackItems = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems ?? []

        if let error = callbackItems.first(where: { $0.name == "error" })?.value {
            let description = callbackItems.first(where: { $0.name == "error_description" })?.value ?? error
            throw CalendarOAuthServiceError.authorizationFailed(description)
        }

        guard callbackItems.first(where: { $0.name == "state" })?.value == state else {
            throw CalendarOAuthServiceError.invalidState
        }

        guard let code = callbackItems.first(where: { $0.name == "code" })?.value else {
            throw CalendarOAuthServiceError.missingAuthorizationCode
        }

        return try await exchangeCode(
            configuration: configuration,
            code: code,
            redirectURI: configuration.redirectURI,
            codeVerifier: codeVerifier
        )
    }

    private func makeAuthorizationURL(
        configuration: CalendarOAuthConfiguration,
        redirectURI: String,
        state: String,
        codeChallenge: String
    ) throws -> URL {
        var components = URLComponents(url: configuration.authorizationURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: configuration.clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: configuration.scopes.joined(separator: " ")),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256")
        ]

        switch configuration.providerKind {
        case .google:
            components?.queryItems?.append(URLQueryItem(name: "access_type", value: "offline"))
            components?.queryItems?.append(URLQueryItem(name: "prompt", value: "consent"))
        case .outlook:
            break
        case .apple:
            break
        }

        guard let url = components?.url else {
            throw CalendarOAuthServiceError.invalidRedirectURI
        }
        return url
    }

    private func startAuthorizationSession(
        authorizationURL: URL,
        callbackScheme: String
    ) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let authSession = ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                self.currentAuthSession = nil

                if let error = error as? ASWebAuthenticationSessionError,
                   error.code == .canceledLogin {
                    continuation.resume(throwing: CalendarOAuthServiceError.authorizationCancelled)
                    return
                }

                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let callbackURL else {
                    continuation.resume(throwing: CalendarOAuthServiceError.invalidCallback)
                    return
                }

                continuation.resume(returning: callbackURL)
            }

            authSession.presentationContextProvider = presentationContextProvider
            authSession.prefersEphemeralWebBrowserSession = false
            currentAuthSession = authSession
            if !authSession.start() {
                currentAuthSession = nil
                continuation.resume(throwing: CalendarOAuthServiceError.authorizationFailed("OAuth-Web-Session konnte nicht gestartet werden."))
            }
        }
    }

    private func exchangeCode(
        configuration: CalendarOAuthConfiguration,
        code: String,
        redirectURI: String,
        codeVerifier: String
    ) async throws -> CalendarAccessToken {
        var request = URLRequest(url: configuration.tokenURL)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = formEncodedBody([
            "client_id": configuration.clientID,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirectURI,
            "code_verifier": codeVerifier
        ])

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            throw CalendarOAuthServiceError.tokenExchangeFailed
        }

        struct TokenResponse: Decodable {
            let accessToken: String
            let refreshToken: String?
            let expiresIn: Int?

            enum CodingKeys: String, CodingKey {
                case accessToken = "access_token"
                case refreshToken = "refresh_token"
                case expiresIn = "expires_in"
            }
        }

        let tokenResponse = try JSONDecoder().decode(TokenResponse.self, from: data)
        let expiresAt = tokenResponse.expiresIn.map { Date().addingTimeInterval(TimeInterval($0)) }
        return CalendarAccessToken(
            accessToken: tokenResponse.accessToken,
            refreshToken: tokenResponse.refreshToken,
            expiresAt: expiresAt
        )
    }

    private func formEncodedBody(_ values: [String: String]) -> Data? {
        let body = values
            .map { key, value in
                let escapedKey = key.addingPercentEncoding(withAllowedCharacters: formComponentAllowedCharacters) ?? key
                let escapedValue = value.addingPercentEncoding(withAllowedCharacters: formComponentAllowedCharacters) ?? value
                return "\(escapedKey)=\(escapedValue)"
            }
            .sorted()
            .joined(separator: "&")
        return body.data(using: .utf8)
    }

    private func randomURLSafeString(length: Int) -> String {
        let alphabet = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return String((0..<length).compactMap { _ in alphabet.randomElement() })
    }

    private func codeChallenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private var formComponentAllowedCharacters: CharacterSet {
        CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
    }
}

@MainActor
private final class OAuthPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
