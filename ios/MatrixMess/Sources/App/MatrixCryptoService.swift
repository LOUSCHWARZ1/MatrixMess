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

struct MatrixVerificationEmoji: Hashable {
    let symbol: String
    let description: String
}

struct MatrixVerificationFlowState: Hashable {
    var statusLabel: String = "Keine aktive Verifizierung"
    var detailLabel: String? = nil
    var senderUserID: String? = nil
    var deviceID: String? = nil
    var flowID: String? = nil
    var emojis: [MatrixVerificationEmoji] = []
    var decimals: [UInt16] = []
    var canStartSas = false
    var canApprove = false
    var canDecline = false
    var canCancel = false
    var isVerified = false

    var isActive: Bool {
        senderUserID != nil || !emojis.isEmpty || !decimals.isEmpty || canStartSas || canApprove || canDecline || canCancel || isVerified
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

    func currentVerificationState() async -> MatrixVerificationFlowState {
        await matrixService.currentVerificationFlowState()
    }

    func startSasVerification(session: MatrixSession) async throws {
        try await matrixService.startSasVerification(session: session)
    }

    func approveVerification(session: MatrixSession) async throws {
        try await matrixService.approveVerification(session: session)
    }

    func declineVerification(session: MatrixSession) async throws {
        try await matrixService.declineVerification(session: session)
    }

    func cancelVerification(session: MatrixSession) async throws {
        try await matrixService.cancelVerification(session: session)
    }
}
