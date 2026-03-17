import Combine
import SwiftUI

@main
struct MatrixMessApp: App {
    @UIApplicationDelegateAdaptor(MatrixMessAppDelegate.self) private var appDelegate
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
                .onReceive(NotificationCenter.default.publisher(for: .matrixMessDidRegisterForRemoteNotifications)) { notification in
                    guard let token = notification.object as? Data else { return }
                    Task {
                        await appState.handleRemoteNotificationToken(token)
                    }
                }
                .onReceive(NotificationCenter.default.publisher(for: .matrixMessDidFailRemoteNotifications)) { notification in
                    guard let error = notification.object as? Error else { return }
                    appState.noteRemoteNotificationRegistrationFailure(error)
                }
        }
    }
}
