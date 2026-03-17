import Foundation
import MatrixRustSDK

enum MatrixCryptoServiceError: LocalizedError {
    case sdkIntegrationRequired
    case encryptedMediaPending

    var errorDescription: String? {
        switch self {
        case .sdkIntegrationRequired:
            return "Fuer E2EE wird die Matrix Rust SDK-Crypto-Schicht auf dem Mac/Xcode-Build noch final angebunden."
        case .encryptedMediaPending:
            return "Verschluesselte Medien brauchen die vollstaendige Crypto-/Megolm-Integration."
        }
    }
}

struct MatrixCryptoStatus: Hashable {
    let encryptionAvailable: Bool
    let keyBackupConfigured: Bool
    let deviceVerificationAvailable: Bool
}

actor MatrixCryptoService {
    func currentStatus() -> MatrixCryptoStatus {
        // Der Swift-Paket-Import ist bewusst aktiv. Die finale Verdrahtung gegen die
        // konkreten FFI-Typen aus MatrixRustSDK braucht Xcode, Paketauflösung und
        // einen verifizierbaren Build gegen die aktuellen SDK-Schnittstellen.
        MatrixCryptoStatus(
            encryptionAvailable: false,
            keyBackupConfigured: false,
            deviceVerificationAvailable: false
        )
    }

    func prepareEncryptedSession(for session: MatrixSession) async throws {
        _ = session
        throw MatrixCryptoServiceError.sdkIntegrationRequired
    }

    func encryptMediaPayload() async throws {
        throw MatrixCryptoServiceError.encryptedMediaPending
    }
}
