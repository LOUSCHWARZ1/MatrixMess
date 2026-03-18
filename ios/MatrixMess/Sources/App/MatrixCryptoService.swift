import Foundation

struct MatrixCryptoStatus: Hashable {
    let encryptionAvailable: Bool
    let keyBackupConfigured: Bool
    let deviceVerificationAvailable: Bool
    let recoveryStateLabel: String
    let backupStateLabel: String
    let verificationStateLabel: String

    init(
        encryptionAvailable: Bool,
        keyBackupConfigured: Bool,
        deviceVerificationAvailable: Bool,
        recoveryStateLabel: String = "Offen",
        backupStateLabel: String = "Offen",
        verificationStateLabel: String = "Offen"
    ) {
        self.encryptionAvailable = encryptionAvailable
        self.keyBackupConfigured = keyBackupConfigured
        self.deviceVerificationAvailable = deviceVerificationAvailable
        self.recoveryStateLabel = recoveryStateLabel
        self.backupStateLabel = backupStateLabel
        self.verificationStateLabel = verificationStateLabel
    }
}

actor MatrixCryptoService {
    private let matrixService: MatrixService

    init(matrixService: MatrixService) {
        self.matrixService = matrixService
    }

    func currentStatus(session: MatrixSession?) async -> MatrixCryptoStatus {
        await matrixService.currentCryptoStatus(session: session)
    }

    func prepareEncryptedSession(for session: MatrixSession) async throws {
        try await matrixService.prepareEncryptedSession(for: session)
    }

    func recover(using recoveryKey: String, session: MatrixSession) async throws -> MatrixCryptoStatus {
        try await matrixService.recoverEncryption(using: recoveryKey, session: session)
    }

    func requestDeviceVerification(session: MatrixSession) async throws {
        try await matrixService.requestOwnDeviceVerification(session: session)
    }
}
