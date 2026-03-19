import Foundation

enum MatrixMediaServiceError: LocalizedError {
    case invalidMXCURL
    case missingFileName
    case unsupportedEncryptedRoom

    var errorDescription: String? {
        switch self {
        case .invalidMXCURL:
            return "Die Matrix-Medien-URL ist ungueltig."
        case .missingFileName:
            return "Fuer den Upload wird ein Dateiname benoetigt."
        case .unsupportedEncryptedRoom:
            return "Medien in verschluesselte Raeume brauchen die Crypto-Schicht und sind hier noch nicht final verdrahtet."
        }
    }
}

struct MatrixMediaUploadResult: Hashable {
    let contentURI: String
    let attachment: MessageAttachment
}

actor MatrixMediaService {
    private struct UploadResponse: Decodable {
        let contentURI: String

        enum CodingKeys: String, CodingKey {
            case contentURI = "content_uri"
        }
    }

    private let session: URLSession
    private let fileManager: FileManager

    init(session: URLSession = .shared, fileManager: FileManager = .default) {
        self.session = session
        self.fileManager = fileManager
    }

    func uploadMedia(
        data: Data,
        mimeType: String,
        fileName: String,
        messageKind: ChatMessageKind,
        session matrixSession: MatrixSession,
        roomIsEncrypted: Bool
    ) async throws -> MatrixMediaUploadResult {
        guard !fileName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw MatrixMediaServiceError.missingFileName
        }

        guard !roomIsEncrypted else {
            throw MatrixMediaServiceError.unsupportedEncryptedRoom
        }

        guard let homeserver = URL(string: matrixSession.homeserver) else {
            throw MatrixServiceError.invalidHomeserver
        }

        let uploadResponse = try await uploadMediaWithFallback(
            homeserver: homeserver,
            data: data,
            mimeType: mimeType,
            fileName: fileName,
            accessToken: matrixSession.accessToken
        )

        let localFile = try persistOutgoingMedia(data: data, fileName: fileName)
        let attachment = MessageAttachment(
            icon: icon(for: messageKind),
            title: fileName,
            subtitle: "\(mimeType) / \(ByteCountFormatter.string(fromByteCount: Int64(data.count), countStyle: .file))",
            contentURI: uploadResponse.contentURI,
            mimeType: mimeType,
            localCachePath: localFile.path,
            fileSize: data.count
        )

        return MatrixMediaUploadResult(contentURI: uploadResponse.contentURI, attachment: attachment)
    }

    func downloadMedia(
        contentURI: String,
        session matrixSession: MatrixSession
    ) async throws -> URL {
        guard let homeserver = URL(string: matrixSession.homeserver) else {
            throw MatrixServiceError.invalidHomeserver
        }

        let parsed = try parseMXC(contentURI)
        let cacheURL = try cachedFileURL(for: parsed)
        if fileManager.fileExists(atPath: cacheURL.path) {
            return cacheURL
        }

        let data = try await downloadMediaWithFallback(
            homeserver: homeserver,
            parsed: parsed,
            accessToken: matrixSession.accessToken
        )

        try createParentDirectoryIfNeeded(for: cacheURL)
        try data.write(to: cacheURL, options: .atomic)
        return cacheURL
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

    private func uploadMediaWithFallback(
        homeserver: URL,
        data: Data,
        mimeType: String,
        fileName: String,
        accessToken: String
    ) async throws -> UploadResponse {
        let versions = ["v3", "r0"]
        var lastError: Error?

        for version in versions {
            do {
                var components = URLComponents(url: homeserver, resolvingAgainstBaseURL: false)
                components?.path = "/_matrix/media/\(version)/upload"
                components?.queryItems = [URLQueryItem(name: "filename", value: fileName)]
                guard let url = components?.url else {
                    throw MatrixServiceError.invalidHomeserver
                }

                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
                request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
                request.httpBody = data

                let (responseData, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw MatrixServiceError.invalidResponse
                }

                guard (200..<300).contains(httpResponse.statusCode) else {
                    if let matrixError = try? JSONDecoder().decode(MatrixErrorResponse.self, from: responseData),
                       let message = matrixError.error {
                        if let errcode = matrixError.errcode, !errcode.isEmpty {
                            throw MatrixServiceError.serverError("\(errcode): \(message)")
                        }
                        throw MatrixServiceError.serverError(message)
                    }
                    throw MatrixServiceError.serverError("Upload fehlgeschlagen (\(httpResponse.statusCode)).")
                }

                return try JSONDecoder().decode(UploadResponse.self, from: responseData)
            } catch {
                lastError = error
            }
        }

        throw lastError ?? MatrixServiceError.serverError("Upload fehlgeschlagen.")
    }

    private func downloadMediaWithFallback(
        homeserver: URL,
        parsed: (serverName: String, mediaID: String),
        accessToken: String
    ) async throws -> Data {
        let versions = ["v3", "r0"]
        var lastError: Error?
        let encodedServerName = encodedPathSegment(parsed.serverName)
        let encodedMediaID = encodedPathSegment(parsed.mediaID)

        for version in versions {
            do {
                var components = URLComponents(url: homeserver, resolvingAgainstBaseURL: false)
                components?.path = "/_matrix/media/\(version)/download/\(encodedServerName)/\(encodedMediaID)"
                guard let url = components?.url else {
                    throw MatrixServiceError.invalidHomeserver
                }

                var request = URLRequest(url: url)
                request.httpMethod = "GET"
                request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

                let (data, response) = try await session.data(for: request)
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw MatrixServiceError.invalidResponse
                }
                guard (200..<300).contains(httpResponse.statusCode) else {
                    throw MatrixServiceError.serverError("Download fehlgeschlagen (\(httpResponse.statusCode)).")
                }
                return data
            } catch {
                lastError = error
            }
        }

        throw lastError ?? MatrixServiceError.serverError("Download fehlgeschlagen.")
    }

    private func encodedPathSegment(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#[]@")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private func mediaCacheDirectory() throws -> URL {
        try fileManager.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        .appendingPathComponent("MatrixMessMedia", isDirectory: true)
    }

    private func cachedFileURL(for parsed: (serverName: String, mediaID: String)) throws -> URL {
        try mediaCacheDirectory()
            .appendingPathComponent(parsed.serverName, isDirectory: true)
            .appendingPathComponent(parsed.mediaID, isDirectory: false)
    }

    private func createParentDirectoryIfNeeded(for url: URL) throws {
        let directory = url.deletingLastPathComponent()
        guard !fileManager.fileExists(atPath: directory.path) else {
            return
        }

        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func persistOutgoingMedia(data: Data, fileName: String) throws -> URL {
        let localDirectory = try mediaCacheDirectory().appendingPathComponent("local", isDirectory: true)
        if !fileManager.fileExists(atPath: localDirectory.path) {
            try fileManager.createDirectory(at: localDirectory, withIntermediateDirectories: true)
        }

        let sanitizedFileName = fileName.replacingOccurrences(of: "/", with: "_")
        let fileURL = localDirectory.appendingPathComponent("\(UUID().uuidString)-\(sanitizedFileName)")
        try data.write(to: fileURL, options: .atomic)
        return fileURL
    }
}
