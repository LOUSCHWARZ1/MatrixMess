import Foundation

actor MatrixSyncEngine {
    struct State: Hashable {
        var isRunning = false
        var consecutiveFailures = 0
        var lastSuccessfulSyncAt: Date?
        var lastFailureDescription: String?
    }

    private var task: Task<Void, Never>?
    private var state = State()

    func start(
        minimumInterval: TimeInterval = 20,
        syncOperation: @escaping @Sendable () async throws -> Void
    ) {
        stop()

        state.isRunning = true
        task = Task {
            while !Task.isCancelled {
                do {
                    try await syncOperation()
                    state.consecutiveFailures = 0
                    state.lastSuccessfulSyncAt = .now
                    state.lastFailureDescription = nil
                    try await Task.sleep(nanoseconds: UInt64(max(minimumInterval, 5) * 1_000_000_000))
                } catch {
                    state.consecutiveFailures += 1
                    state.lastFailureDescription = error.localizedDescription
                    let backoff = min(pow(2, Double(state.consecutiveFailures)), 120)
                    try? await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))
                }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
        state.isRunning = false
    }

    func currentState() -> State {
        state
    }
}
