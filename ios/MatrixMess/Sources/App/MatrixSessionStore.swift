import Foundation

enum MatrixSessionStoreError: LocalizedError {
    case invalidPayload

    var errorDescription: String? {
        switch self {
        case .invalidPayload:
            return "Die gespeicherte Matrix-Session konnte nicht gelesen werden."
        }
    }
}

struct MatrixSessionStore {
    private let keychain = KeychainStore()
    private let service = "dev.matrixmess.app.session"
    private let account = "active-user"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func load() throws -> MatrixSession? {
        guard let data = try keychain.read(service: service, account: account) else {
            return nil
        }

        guard let session = try? decoder.decode(MatrixSession.self, from: data) else {
            throw MatrixSessionStoreError.invalidPayload
        }

        return session
    }

    func save(_ session: MatrixSession) throws {
        let data = try encoder.encode(session)
        try keychain.write(data, service: service, account: account)
    }

    func clear() throws {
        try keychain.delete(service: service, account: account)
    }
}
