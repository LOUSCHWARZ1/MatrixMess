import AVFAudio
import CallKit
import Foundation

protocol WebRTCCallEngine {
    func prepareAudioSession() throws
    func startOutgoingCall(roomID: String) async throws
    func endCurrentCall() async
}

struct PlaceholderWebRTCCallEngine: WebRTCCallEngine {
    func prepareAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
        try session.setActive(true)
    }

    func startOutgoingCall(roomID: String) async throws {
        AppLogger.info("WebRTC-Platzhalter fuer Raum \(roomID) gestartet.")
    }

    func endCurrentCall() async {
        try? AVAudioSession.sharedInstance().setActive(false)
    }
}

@MainActor
final class MatrixCallService: NSObject, ObservableObject {
    @Published private(set) var activeCallRoomID: String?
    @Published private(set) var lastCallError: String?

    private let provider: CXProvider
    private let controller = CXCallController()
    private let webRTCEngine: WebRTCCallEngine
    private var currentUUID: UUID?

    init(webRTCEngine: WebRTCCallEngine = PlaceholderWebRTCCallEngine()) {
        let configuration = CXProviderConfiguration(localizedName: "MatrixMess")
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        self.provider = CXProvider(configuration: configuration)
        self.webRTCEngine = webRTCEngine
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    func startCall(roomID: String, displayName: String) async {
        let uuid = UUID()
        let handle = CXHandle(type: .generic, value: displayName)
        let action = CXStartCallAction(call: uuid, handle: handle)
        action.isVideo = true
        let transaction = CXTransaction(action: action)

        do {
            try await request(transaction)
            currentUUID = uuid
            activeCallRoomID = roomID
            try webRTCEngine.prepareAudioSession()
            try await webRTCEngine.startOutgoingCall(roomID: roomID)
        } catch {
            lastCallError = error.localizedDescription
        }
    }

    func endCall() async {
        guard let uuid = currentUUID else { return }
        let action = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: action)

        do {
            try await request(transaction)
            currentUUID = nil
            activeCallRoomID = nil
            await webRTCEngine.endCurrentCall()
        } catch {
            lastCallError = error.localizedDescription
        }
    }

    private func request(_ transaction: CXTransaction) async throws {
        try await withCheckedThrowingContinuation { continuation in
            controller.request(transaction) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }
}

@preconcurrency extension MatrixCallService: CXProviderDelegate {
    nonisolated func providerDidReset(_ provider: CXProvider) {
        Task { @MainActor in
            await webRTCEngine.endCurrentCall()
            activeCallRoomID = nil
            currentUUID = nil
        }
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        action.fulfill()
    }

    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        Task { @MainActor in
            await webRTCEngine.endCurrentCall()
            activeCallRoomID = nil
            currentUUID = nil
            action.fulfill()
        }
    }
}
