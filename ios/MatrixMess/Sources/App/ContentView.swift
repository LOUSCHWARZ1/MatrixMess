import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import WebKit

private let appBuildLabel = "v0.3.0 – 2026-03-18"

private let quickReactionEmoji = [
    "\u{1F44D}",
    "\u{2764}\u{FE0F}",
    "\u{1F602}",
    "\u{1F525}"
]

struct ContentView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            if appState.isBootstrapping {
                BootstrapView()
            } else if appState.isLoggedIn {
                MessengerShellView()
            } else {
                LoginView()
            }
        }
        .task {
            await appState.bootstrap()
        }
    }
}

private struct BootstrapView: View {
    @State private var isPulsing = false
    @State private var logoScale: CGFloat = 0.6
    @State private var logoOpacity: Double = 0.0

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.15, green: 0.10, blue: 0.30),
                    Color(red: 0.08, green: 0.06, blue: 0.20)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 28) {
                ZStack {
                    // Outer glow ring
                    Circle()
                        .stroke(Color.white.opacity(0.08), lineWidth: 2)
                        .frame(width: 140, height: 140)
                        .scaleEffect(isPulsing ? 1.25 : 1.0)
                        .opacity(isPulsing ? 0.0 : 0.6)

                    // Inner glow
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color.indigo.opacity(0.4), Color.clear],
                                center: .center,
                                startRadius: 20,
                                endRadius: 70
                            )
                        )
                        .frame(width: 130, height: 130)

                    // App icon circle
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.55, green: 0.30, blue: 0.95), Color.indigo],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 88, height: 88)
                        .shadow(color: Color.purple.opacity(0.5), radius: 24, y: 6)

                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.system(size: 36, weight: .semibold))
                        .foregroundColor(.white)
                }
                .scaleEffect(logoScale)
                .opacity(logoOpacity)

                VStack(spacing: 8) {
                    Text("MatrixMess")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(.white)

                    Text("Dein sicherer Messenger wird geladen ...")
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.65))
                }
                .opacity(logoOpacity)

                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(1.1)
                    .tint(.white.opacity(0.7))

                Text(appBuildLabel)
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.35))
            }
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) {
                logoScale = 1.0
                logoOpacity = 1.0
            }
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                isPulsing = true
            }
        }
    }
}

private struct LoginView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                // Dark gradient background (inspired by Element X)
                LinearGradient(
                    colors: [
                        Color(red: 0.12, green: 0.08, blue: 0.24),
                        Color(red: 0.06, green: 0.04, blue: 0.14),
                        Color(uiColor: .systemBackground)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 32) {
                        Spacer(minLength: 36)

                        // App logo with glow effect
                        ZStack {
                            Circle()
                                .fill(
                                    RadialGradient(
                                        colors: [Color.purple.opacity(0.3), Color.clear],
                                        center: .center,
                                        startRadius: 30,
                                        endRadius: 80
                                    )
                                )
                                .frame(width: 160, height: 160)

                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [Color(red: 0.55, green: 0.30, blue: 0.95), Color.indigo],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 96, height: 96)
                                .shadow(color: Color.purple.opacity(0.45), radius: 28, y: 8)

                            Image(systemName: "bubble.left.and.bubble.right.fill")
                                .font(.system(size: 40, weight: .semibold))
                                .foregroundColor(.white)
                        }

                        VStack(spacing: 10) {
                            Text("MatrixMess")
                                .font(.system(size: 36, weight: .bold, design: .rounded))

                            Text("Sicher chatten ueber das Matrix-Netzwerk.\nSpaces, Bridges, Calls und Kalender.")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .lineSpacing(3)
                                .padding(.horizontal, 20)
                        }

                        // Login card
                        VStack(spacing: 18) {
                            LoginField(title: "Homeserver", text: $appState.homeserver, icon: "server.rack", hint: "z.B. https://matrix.org")
                                .keyboardType(.URL)

                            LoginField(title: "Benutzername", text: $appState.username, icon: "at", hint: "dein Matrix-Username")

                            VStack(alignment: .leading, spacing: 8) {
                                Label("Passwort", systemImage: "key.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundColor(.secondary)

                                SecureField("Dein Passwort", text: $appState.password)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 14)
                                    .background(
                                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .fill(Color(uiColor: .secondarySystemGroupedBackground))
                                    )
                            }

                            Button {
                                Task { await appState.signIn() }
                            } label: {
                                HStack(spacing: 10) {
                                    Spacer()
                                    if appState.isSigningIn {
                                        ProgressView().tint(.white)
                                        Text("Verbinde ...")
                                    } else {
                                        Image(systemName: "arrow.right.circle.fill")
                                        Text("Anmelden")
                                    }
                                    Spacer()
                                }
                                .font(.headline)
                                .foregroundColor(.white)
                                .padding(.vertical, 16)
                                .background(
                                    LinearGradient(
                                        colors: [Color(red: 0.55, green: 0.30, blue: 0.95), Color.indigo],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .shadow(color: Color.purple.opacity(0.30), radius: 12, y: 6)
                            }
                            .disabled(appState.isSigningIn)

                            if let errorMessage = appState.errorMessage {
                                HStack(spacing: 8) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .foregroundColor(.red)
                                    Text(errorMessage)
                                        .font(.footnote)
                                        .foregroundColor(.red)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(Color.red.opacity(0.08))
                                )
                            }
                        }
                        .padding(24)
                        .background(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(Color(uiColor: .systemBackground))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(Color(uiColor: .separator).opacity(0.3), lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.10), radius: 30, y: 15)

                        // Footer
                        VStack(spacing: 8) {
                            HStack(spacing: 6) {
                                Image(systemName: "lock.shield.fill")
                                    .foregroundColor(.green)
                                    .font(.caption)
                                Text("Ende-zu-Ende verschluesselt")
                                    .font(.caption.weight(.medium))
                                    .foregroundColor(.secondary)
                            }

                            HStack(spacing: 6) {
                                Image(systemName: "m.circle.fill")
                                    .foregroundColor(.indigo)
                                Text("Powered by Matrix")
                                    .font(.caption.weight(.medium))
                                    .foregroundColor(.secondary)
                            }

                            Text(appBuildLabel)
                                .font(.caption2)
                                .foregroundColor(.secondary.opacity(0.5))
                                .padding(.top, 4)
                        }

                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 24)
                }
            }
            .navigationBarHidden(true)
        }
    }
}

private struct LoginField: View {
    let title: String
    @Binding var text: String
    let icon: String
    var hint: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundColor(.secondary)

            TextField(hint.isEmpty ? title : hint, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color(uiColor: .secondarySystemGroupedBackground))
                )
        }
    }
}

private struct MessengerShellView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showingPostLoginSetup = false
    @State private var postLoginShowRecovery = false
    @State private var postLoginShowVerify = false

    var body: some View {
        TabView(selection: $appState.selectedTab) {
            ChatsRootView()
                .tabItem { Label(AppTab.chats.title, systemImage: AppTab.chats.systemImage) }
                .tag(AppTab.chats)

            CallsRootView()
                .tabItem { Label(AppTab.calls.title, systemImage: AppTab.calls.systemImage) }
                .tag(AppTab.calls)

            CalendarRootView()
                .tabItem { Label(AppTab.calendar.title, systemImage: AppTab.calendar.systemImage) }
                .tag(AppTab.calendar)

            SettingsRootView()
                .tabItem { Label(AppTab.settings.title, systemImage: AppTab.settings.systemImage) }
                .tag(AppTab.settings)
        }
        .accentColor(Color(red: 0.55, green: 0.30, blue: 0.95))
        .preferredColorScheme(appState.preferredColorScheme)
        .sheet(isPresented: $showingPostLoginSetup) {
            PostLoginSetupSheet(
                onRecovery: { postLoginShowRecovery = true },
                onVerify: {
                    Task {
                        await appState.requestCurrentDeviceVerification()
                        postLoginShowVerify = true
                    }
                },
                onDismiss: {
                    appState.needsPostLoginSetup = false
                    showingPostLoginSetup = false
                }
            )
            .environmentObject(appState)
        }
        .sheet(isPresented: $postLoginShowRecovery) {
            RecoveryKeySheet { key in
                await appState.recoverEncryption(with: key)
                appState.needsPostLoginSetup = false
            }
        }
        .sheet(isPresented: $postLoginShowVerify) {
            E2EEVerifySheet()
                .environmentObject(appState)
                .onDisappear {
                    if appState.verificationFlowState.isVerified {
                        appState.needsPostLoginSetup = false
                    }
                }
        }
        .onChange(of: appState.needsPostLoginSetup) { needs in
            if needs { showingPostLoginSetup = true }
        }
    }
}

private struct ChatsRootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationView {
            ConversationListView()
            EmptyDetailState(space: appState.selectedSpace)
        }
    }
}

private struct CallsRootView: View {
    var body: some View {
        NavigationView { CallsView() }
    }
}

private struct CalendarRootView: View {
    var body: some View {
        NavigationView { CalendarView() }
    }
}

private struct SettingsRootView: View {
    var body: some View {
        NavigationView { SettingsView() }
    }
}

private struct ConversationListView: View {
    @EnvironmentObject private var appState: AppState

    private var activeSpace: ChatSpace? { appState.selectedSpace }
    private var visibleThreads: [ChatThread] { appState.visibleThreads() }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            List {
                if let activeSpace {
                    Section {
                        SpaceOverviewCard(space: activeSpace, chatCount: appState.threadCount(for: activeSpace.id))
                            .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                            .listRowBackground(Color.clear)

                        SpaceTabStrip()
                            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 10, trailing: 0))
                            .listRowBackground(Color.clear)
                    }

                    if visibleThreads.isEmpty {
                        Section(activeSpace.isMain ? "Main Space" : activeSpace.title) {
                            EmptyThreadState(space: activeSpace)
                                .listRowBackground(Color.clear)
                        }
                    } else {
                        Section(activeSpace.isMain ? "Main Space" : activeSpace.title) {
                            ForEach(visibleThreads) { thread in
                                NavigationLink(tag: thread.id, selection: $appState.selectedThreadID) {
                                    ConversationDetailView(threadID: thread.id)
                                } label: {
                                    ConversationRow(thread: thread)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        appState.toggleMute(for: thread.id)
                                    } label: {
                                        Label(thread.isMuted ? "Laut" : "Stumm", systemImage: thread.isMuted ? "bell.fill" : "bell.slash.fill")
                                    }
                                    .tint(thread.isMuted ? .green : .gray)

                                    Button {
                                        appState.toggleMainPin(for: thread.id)
                                    } label: {
                                        Label(appState.isPinnedInMain(thread.id) ? "Aus Main" : "In Main", systemImage: appState.isPinnedInMain(thread.id) ? "star.slash.fill" : "star.fill")
                                    }
                                    .tint(appState.isPinnedInMain(thread.id) ? .orange : .indigo)
                                }
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    Button {
                                        appState.markThreadRead(thread.id)
                                    } label: {
                                        Label("Gelesen", systemImage: "checkmark.circle.fill")
                                    }
                                    .tint(.green)
                                }
                                .contextMenu {
                                    Button(appState.isPinnedInMain(thread.id) ? "Aus Main entfernen" : "In Main legen") {
                                        appState.toggleMainPin(for: thread.id)
                                    }

                                    Button(thread.isMuted ? "Stumm aus" : "Stumm") {
                                        appState.toggleMute(for: thread.id)
                                    }

                                    Button("Als gelesen markieren") {
                                        appState.markThreadRead(thread.id)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $appState.searchText, prompt: "Chats durchsuchen")
            .navigationTitle("Chats")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if let activeSpace {
                        HStack(spacing: 8) {
                            Image(systemName: activeSpace.icon)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(activeSpace.accent.tint)

                            if appState.isSyncing {
                                ProgressView()
                                    .scaleEffect(0.72)
                            }
                        }
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button {
                            Task { await appState.refreshMatrixData(forceFullSync: true) }
                        } label: {
                            Label("Sync jetzt", systemImage: "arrow.clockwise")
                        }
                        Button {
                            appState.selectTab(.calendar)
                        } label: {
                            Label("Calendar", systemImage: "calendar")
                        }
                        Button {
                            appState.selectTab(.settings)
                        } label: {
                            Label("Settings", systemImage: "gearshape")
                        }
                        Divider()
                        Button(role: .destructive) {
                            appState.signOut()
                        } label: {
                            Label("Abmelden", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle.fill")
                            .symbolRenderingMode(.hierarchical)
                            .font(.title3)
                    }
                }
            }
            .refreshable {
                await appState.refreshMatrixData()
            }

            // Floating action button – syncs rooms (new chat creation not yet supported)
            Button {
                Task { await appState.refreshMatrixData(forceFullSync: true) }
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(.white)
                    .frame(width: 56, height: 56)
                    .background(
                        LinearGradient(
                            colors: [Color(red: 0.55, green: 0.30, blue: 0.95), Color.indigo],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(Circle())
                    .shadow(color: Color.purple.opacity(0.35), radius: 12, y: 6)
            }
            .padding(.trailing, 20)
            .padding(.bottom, 20)
        }
    }
}

private struct SpaceOverviewCard: View {
    let space: ChatSpace
    let chatCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Label(space.title, systemImage: space.icon)
                        .font(.headline.weight(.bold))

                    Text(space.subtitle)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.88))
                }

                Spacer()

                Text("\(chatCount)")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.20))
                    .clipShape(Capsule())
            }

            Divider()
                .background(Color.white.opacity(0.2))

            HStack(spacing: 14) {
                Label("\(chatCount) Chats", systemImage: "bubble.left.and.bubble.right.fill")
                if space.isMain {
                    Label("Kuratiert", systemImage: "star.fill")
                } else {
                    Label("Nur dieser Space", systemImage: "square.grid.2x2.fill")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundColor(.white.opacity(0.92))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(space.accent.gradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: space.accent.tint.opacity(0.28), radius: 16, y: 8)
        .padding(.horizontal, 2)
    }
}

private struct SpaceTabStrip: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(appState.spaces) { space in
                    Button {
                        appState.selectSpace(space.id)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: space.icon)
                                .font(.caption)
                            Text(space.title)
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(space.id == appState.selectedSpaceID ? .white : space.accent.tint)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule(style: .continuous)
                                .fill(space.accent.softTint)
                                .overlay(
                                    Capsule(style: .continuous)
                                        .fill(space.accent.gradient)
                                        .opacity(space.id == appState.selectedSpaceID ? 1 : 0)
                                )
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

private struct ConversationRow: View {
    @EnvironmentObject private var appState: AppState
    let thread: ChatThread

    private var sourceSpace: ChatSpace? { appState.sourceSpace(for: thread) }
    private var draftPreview: String? {
        let value = appState.draft(for: thread.id).trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                ThreadAvatarView(thread: thread, size: 58)

                // Online indicator dot
                Circle()
                    .fill(Color.green)
                    .frame(width: 14, height: 14)
                    .overlay(
                        Circle()
                            .stroke(Color(uiColor: .systemBackground), lineWidth: 2.5)
                    )
                    .offset(x: 2, y: 2)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(thread.title)
                        .font(.body.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    if thread.isMuted {
                        Image(systemName: "bell.slash.fill")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    Spacer(minLength: 4)

                    Text(formattedTimestamp(thread.lastActivity))
                        .font(.caption)
                        .foregroundColor(thread.unreadCount > 0 ? thread.accent.tint : .secondary)
                }

                // U+270E = ✎ pencil (draft indicator)
                Text(draftPreview.map { "\u{270E} \($0)" } ?? thread.lastMessagePreview)
                    .font(.subheadline)
                    .foregroundColor(draftPreview == nil ? .secondary : .orange)
                    .lineLimit(2)

                HStack(spacing: 10) {
                    if let sourceSpace {
                        SourceBadge(space: sourceSpace)
                    } else {
                        Text(thread.subtitle)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    if thread.isEncrypted {
                        Label("E2EE", systemImage: "lock.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.secondary)
                    }
                }

            }

            if thread.unreadCount > 0 {
                Text("\(thread.unreadCount)")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [thread.accent.tint, thread.accent.tint.opacity(0.78)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    )
                    .shadow(color: thread.accent.tint.opacity(0.3), radius: 4, y: 2)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct SourceBadge: View {
    let space: ChatSpace

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: space.icon)
            Text(space.title)
        }
        .font(.caption2.weight(.semibold))
        .foregroundColor(space.accent.tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(space.accent.softTint)
        .clipShape(Capsule())
    }
}

private struct ThreadAvatarView: View {
    @EnvironmentObject private var appState: AppState

    let thread: ChatThread
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(thread.accent.gradient)
                .frame(width: size, height: size)

            if let avatarURL = appState.mediaDownloadURL(for: thread.avatarContentURI) {
                AsyncImage(url: avatarURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        fallback
                    }
                }
                .frame(width: size, height: size)
                .clipShape(Circle())
            } else {
                fallback
            }
        }
    }

    private var fallback: some View {
        Image(systemName: thread.avatarSymbol)
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundColor(.white)
    }
}

private struct EmptyThreadState: View {
    let space: ChatSpace

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(space.accent.softTint)
                    .frame(width: 64, height: 64)

                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundColor(space.accent.tint)
            }

            VStack(spacing: 6) {
                Text("Keine Chats sichtbar")
                    .font(.headline)

                if space.isMain {
                    Text("Lege Chats aus Matrix oder deinen Bridge-Spaces in den Main-Space, damit sie hier gesammelt erscheinen.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                } else {
                    Text("In diesem Space werden nur Chats aus \(space.title) angezeigt. Wechsle oben den Space oder suche nach einem Chat.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
    }
}

private struct EmptyDetailState: View {
    let space: ChatSpace?

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill((space?.accent.softTint ?? Color.blue.opacity(0.14)))
                    .frame(width: 92, height: 92)

                Image(systemName: space?.icon ?? "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundColor(space?.accent.tint ?? .blue)
            }

            Text(space?.title ?? "Chats")
                .font(.title3.weight(.semibold))

            Text("Waehle links einen Chat aus. Termine, Medien und weitere Aktionen werden direkt im Chat gesteuert statt in einer extra Medien-Ansicht.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .frame(maxWidth: 320)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(uiColor: .systemGroupedBackground))
    }
}

private struct ConversationDetailView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showingMediaSheet = false
    @State private var showingEventSheet = false
    @State private var showingFileImporter = false
    @State private var showingForwardDialog = false
    @State private var forwardingMessageID: UUID?
    @State private var editingMessageID: UUID?
    @State private var editingText = ""
    @State private var pendingImportKind: ChatMessageKind?
    @State private var showingProfileSheet = false
    @State private var showingMediaLibraryPicker = false
    @State private var isSending = false

    let threadID: String

    private let scrollAnchorID = "conversationBottom"

    private var thread: ChatThread? { appState.thread(withID: threadID) }
    private var sourceSpace: ChatSpace? {
        guard let thread else { return nil }
        return appState.sourceSpace(for: thread)
    }
    private var draftBinding: Binding<String> {
        Binding(
            get: { appState.draft(for: threadID) },
            set: { appState.setDraft($0, for: threadID) }
        )
    }

    var body: some View {
        Group {
            if let thread {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            if let sourceSpace {
                                Button {
                                    showingProfileSheet = true
                                } label: {
                                    ConversationHero(
                                        space: sourceSpace,
                                        thread: thread,
                                        mediaCount: appState.sharedMedia(for: thread.id).count,
                                        eventCount: appState.events(for: thread.id).count
                                    )
                                }
                                .buttonStyle(.plain)
                            }

                              ForEach(appState.messages(for: thread.id)) { message in
                                  conversationMessageRow(message, thread: thread)
                              }

                            Color.clear
                                .frame(height: 1)
                                .id(scrollAnchorID)
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 28)
                    }
                    .background(Color(uiColor: .systemGroupedBackground))
                    .task(id: threadID) {
                        // Give the layout one runloop pass to settle before scrolling.
                        await Task.yield()
                        proxy.scrollTo(scrollAnchorID, anchor: .bottom)
                    }
                    .onChange(of: appState.messages(for: thread.id).count) { _ in
                        withAnimation(.easeOut(duration: 0.25)) {
                            proxy.scrollTo(scrollAnchorID, anchor: .bottom)
                        }
                    }
                    .navigationTitle(thread.title)
                    .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                        Button {
                            Task {
                                if appState.activeCallRoomID == thread.id {
                                    await appState.endActiveCall()
                                } else {
                                    await appState.startCall(for: thread.id)
                                }
                            }
                        } label: {
                            Image(systemName: appState.activeCallRoomID == thread.id ? "phone.down.fill" : "phone.fill")
                        }

                        Button {
                            showingMediaSheet = true
                        } label: {
                            Image(systemName: "photo.on.rectangle.angled")
                        }

                        Menu {
                            Button {
                                showingEventSheet = true
                            } label: {
                                Label("Termin planen", systemImage: "calendar.badge.plus")
                            }

                            Button {
                                showingProfileSheet = true
                            } label: {
                                Label("Profil anzeigen", systemImage: "person.crop.circle")
                            }

                            Button {
                                appState.toggleMainPin(for: thread.id)
                            } label: {
                                Label(
                                    appState.isPinnedInMain(thread.id) ? "Aus Main entfernen" : "In Main legen",
                                    systemImage: appState.isPinnedInMain(thread.id) ? "star.slash.fill" : "star.fill"
                                )
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
                  .safeAreaInset(edge: .bottom) {
                      VStack(spacing: 0) {
                          let typingUsers = appState.typingUsersByThreadID[thread.id] ?? []
                          if appState.typingIndicatorsEnabled, !typingUsers.isEmpty {
                              TypingIndicatorBanner(userIDs: typingUsers)
                          }
                          ComposerBar(
                              draft: draftBinding,
                              accent: thread.accent,
                              isSending: isSending,
                              sendAction: {
                                  Task {
                                      isSending = true
                                      await appState.sendMessage(appState.draft(for: thread.id), to: thread.id)
                                      isSending = false
                                  }
                              },
                              attachmentAction: { kind in
                                  switch kind {
                                  case .voice:
                                      appState.sendAttachment(kind, to: thread.id)
                                  case .image, .video:
                                      pendingImportKind = kind
                                      showingMediaLibraryPicker = true
                                  case .file:
                                      pendingImportKind = kind
                                      showingFileImporter = true
                                  case .text, .event:
                                      break
                                  }
                              },
                            eventAction: {
                                showingEventSheet = true
                            }
                        )
                      }
                  }
                .sheet(isPresented: $showingMediaSheet) {
                    SharedMediaSheet(thread: thread)
                        .environmentObject(appState)
                }
                  .sheet(isPresented: $showingProfileSheet) {
                      ThreadProfileSheet(threadID: thread.id)
                          .environmentObject(appState)
                  }
                  .sheet(isPresented: $showingMediaLibraryPicker) {
                      MediaLibraryPicker(kind: pendingImportKind ?? .image) { data, mimeType, fileName in
                          let selectedKind = pendingImportKind ?? .image
                          pendingImportKind = nil
                          Task {
                              await appState.uploadMedia(
                                  data: data,
                                  mimeType: mimeType,
                                  fileName: fileName,
                                  kind: selectedKind,
                                  to: thread.id
                              )
                          }
                      }
                  }
                  .sheet(isPresented: $showingEventSheet) {
                      EventPlannerSheet(
                          thread: thread,
                          defaultProviderIDs: appState.connectedProviderIDs(),
                          defaultDurationMinutes: appState.defaultMeetingDurationMinutes
                      )
                      .environmentObject(appState)
                  }
                  .sheet(isPresented: Binding(
                    get: { editingMessageID != nil },
                    set: { isPresented in
                        if !isPresented {
                            editingMessageID = nil
                            editingText = ""
                        }
                    }
                  )) {
                      EditMessageSheet(
                          text: $editingText,
                          saveAction: {
                              if let editingMessageID {
                                  Task {
                                      await appState.editMessage(editingText, messageID: editingMessageID, in: thread.id)
                                      self.editingMessageID = nil
                                      editingText = ""
                                  }
                              }
                          }
                      )
                  }
                  .confirmationDialog("Weiterleiten nach ...", isPresented: $showingForwardDialog, titleVisibility: .visible) {
                      ForEach(appState.forwardTargets(excluding: thread.id)) { target in
                          Button(target.title) {
                              if let forwardingMessageID {
                                  appState.forwardMessage(forwardingMessageID, from: thread.id, to: target.id)
                            }
                        }
                    }

                    Button("Abbrechen", role: .cancel) {}
                } message: {
                    Text("Die Nachricht wird als neue Nachricht im Zielchat eingefuegt.")
                }
                  .onAppear {
                      appState.markThreadRead(thread.id)
                      Task {
                          await appState.syncReadMarker(for: thread.id)
                      }
                  }
                  .fileImporter(
                    isPresented: $showingFileImporter,
                    allowedContentTypes: allowedImportTypes(for: pendingImportKind),
                    allowsMultipleSelection: false
                  ) { result in
                      handleImportedFile(result, for: thread.id)
                  }
                }  // ScrollViewReader
            } else {
                Text("Chat nicht gefunden")
                    .foregroundColor(.secondary)
            }
        }
    }

    private func allowedImportTypes(for kind: ChatMessageKind?) -> [UTType] {
        switch kind {
        case .image:
            return [.image]
        case .video:
            return [.movie, .video]
        case .file, .none:
            return [.data, .content, .item]
        case .voice:
            return [.audio]
        case .text, .event:
            return [.data]
        }
    }

    @ViewBuilder
    private func conversationMessageRow(_ message: ChatMessage, thread: ChatThread) -> some View {
        MessageBubble(
            message: message,
            accent: thread.accent,
            attachmentAction: {
                Task {
                    await appState.downloadAttachment(messageID: message.id, in: thread.id)
                }
            },
            reactAction: { emoji in
                Task {
                    await appState.toggleReaction(emoji, on: message.id, in: thread.id)
                }
            },
            forwardAction: {
                forwardingMessageID = message.id
                showingForwardDialog = true
            },
            editAction: {
                editingMessageID = message.id
                editingText = message.body
            },
            retryAction: {
                Task {
                    await appState.retryMessage(message.id, in: thread.id)
                }
            },
            deleteAction: {
                Task {
                    await appState.redactMessage(message.id, in: thread.id)
                }
            }
        )
        .task(id: message.id) {
            guard appState.inlineMediaEnabled else { return }
            guard message.kind == .image || message.kind == .video else { return }
            guard let attachment = message.attachment,
                  attachment.localCachePath == nil,
                  attachment.contentURI != nil else { return }
            await appState.downloadAttachment(messageID: message.id, in: thread.id)
        }
    }

    private func handleImportedFile(_ result: Result<[URL], Error>, for threadID: String) {
        guard let importKind = pendingImportKind else { return }
        pendingImportKind = nil

        guard case .success(let urls) = result, let url = urls.first else {
            if case .failure(let error) = result {
                appState.errorMessage = error.localizedDescription
            }
            return
        }

        let accessed = url.startAccessingSecurityScopedResource()
        defer {
            if accessed {
                url.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: url)
            let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            Task {
                await appState.uploadMedia(
                    data: data,
                    mimeType: mimeType,
                    fileName: url.lastPathComponent,
                    kind: importKind,
                    to: threadID
                )
            }
        } catch {
            appState.errorMessage = error.localizedDescription
        }
    }
}

private struct ConversationHero: View {
    let space: ChatSpace
    let thread: ChatThread
    let mediaCount: Int
    let eventCount: Int

    var body: some View {
        VStack(spacing: 14) {
            ThreadAvatarView(thread: thread, size: 64)

            Text(thread.title)
                .font(.headline)
                .multilineTextAlignment(.center)

            if thread.isEncrypted {
                Label("Verschluesselt", systemImage: "lock.fill")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            SourceBadge(space: space)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .padding(.horizontal, 18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
    }
}

private struct ThreadProfileSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    let threadID: String
    @State private var localTitle = ""

    private var thread: ChatThread? { appState.thread(withID: threadID) }
    private var sourceSpace: ChatSpace? {
        guard let thread else { return nil }
        return appState.sourceSpace(for: thread)
    }

    var body: some View {
        NavigationView {
            Group {
                if let thread {
                    Form {
                        Section {
                            VStack(spacing: 14) {
                                ThreadAvatarView(thread: thread, size: 80)
                                Text(thread.title)
                                    .font(.title3.weight(.semibold))
                                Text(thread.subtitle)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                        }

                        Section("Chatdetails") {
                            settingsValueRow(label: "Bridge", value: appState.bridgeLabel(for: thread))
                            if let sourceSpace {
                                settingsValueRow(label: "Space", value: sourceSpace.title)
                            }
                            settingsValueRow(label: "Verschluesselt", value: thread.isEncrypted ? "Ja" : "Nein")
                            if let memberCount = thread.memberCount {
                                settingsValueRow(label: "Mitglieder", value: "\(memberCount)")
                            }
                            if let officialTitle = thread.officialTitle, officialTitle != thread.title {
                                settingsValueRow(label: "Originalname", value: officialTitle)
                            }
                            if let topic = thread.topic, !topic.isEmpty {
                                Text(topic)
                                    .font(.footnote)
                                    .foregroundColor(.secondary)
                            }
                        }

                        Section("Lokaler Anzeigename") {
                            TextField("Nur in MatrixMess sichtbar", text: $localTitle)
                            Button("Anzeigename speichern") {
                                appState.renameThreadLocally(thread.id, to: localTitle)
                            }
                            .disabled(localTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    .onAppear {
                        localTitle = thread.title
                    }
                } else {
                    Text("Profil konnte nicht geladen werden.")
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("Profil")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }

    @ViewBuilder
    private func settingsValueRow(label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
            Spacer(minLength: 16)
            Text(value)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage
    let accent: SpaceAccent
    let attachmentAction: () -> Void
    let reactAction: (String) -> Void
    let forwardAction: () -> Void
    let editAction: () -> Void
    let retryAction: () -> Void
    let deleteAction: () -> Void

    private var bubbleAccent: SpaceAccent {
        message.isOutgoing ? accent : senderAccent(for: message.senderDisplayName)
    }

    var body: some View {
        HStack {
            if message.isOutgoing {
                Spacer(minLength: 44)
            }

            VStack(alignment: .leading, spacing: 6) {
                if !message.isOutgoing {
                    Text(message.senderDisplayName)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(bubbleAccent.tint)
                }

                VStack(alignment: .leading, spacing: 8) {
                    if let forwardedFrom = message.forwardedFrom {
                        Label("Weitergeleitet aus \(forwardedFrom)", systemImage: "arrowshape.turn.up.right.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(message.isOutgoing ? .white.opacity(0.88) : .secondary)
                    }

                    MessageBody(
                        message: message,
                        isOutgoing: message.isOutgoing,
                        accent: accent,
                        attachmentAction: attachmentAction
                    )
                }
                .foregroundColor(message.isOutgoing ? .white : .primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(
                    Group {
                        if message.isOutgoing {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(
                                    LinearGradient(
                                        colors: [accent.tint, accent.tint.opacity(0.78)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                        } else {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(bubbleAccent.softTint.opacity(0.85))
                        }
                    }
                )
                .overlay(alignment: message.isOutgoing ? .bottomTrailing : .bottomLeading) {
                    // Small tail triangle
                    Triangle()
                        .fill(message.isOutgoing ? accent.tint.opacity(0.78) : bubbleAccent.softTint.opacity(0.85))
                        .frame(width: 12, height: 8)
                        .rotationEffect(.degrees(message.isOutgoing ? 0 : 180), anchor: .center)
                        .offset(x: message.isOutgoing ? 6 : -6, y: 4)
                }
                .contextMenu {
                    ForEach(quickReactionEmoji, id: \.self) { emoji in
                        Button(emoji) { reactAction(emoji) }
                    }

                      Divider()

                      Button {
                          forwardAction()
                      } label: {
                          Label("Weiterleiten", systemImage: "arrowshape.turn.up.right")
                      }

                      if message.isOutgoing {
                          if message.sendStatus == .failed {
                              Button {
                                  retryAction()
                              } label: {
                                  Label("Erneut senden", systemImage: "arrow.clockwise")
                              }
                          }

                          Button {
                              editAction()
                          } label: {
                              Label("Bearbeiten", systemImage: "pencil")
                          }

                          Button(role: .destructive) {
                              deleteAction()
                          } label: {
                              Label("Loeschen", systemImage: "trash")
                          }
                      }
                  }

                  if !message.reactions.isEmpty {
                      ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(message.reactions) { reaction in
                                Text("\(reaction.emoji) \(reaction.count)")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(
                                        Capsule()
                                            .fill(message.isOutgoing ? Color.white.opacity(0.16) : bubbleAccent.softTint.opacity(0.92))
                                    )
                            }
                        }
                    }
                }

                  Text(messageBubbleTimestamp(message.timestamp))
                      .font(.caption2)
                      .foregroundColor(.secondary)
                      .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)

                  if message.isOutgoing, let statusSymbol = deliveryStatusSymbol(for: message) {
                      HStack(spacing: 3) {
                          Spacer()
                          Image(systemName: statusSymbol)
                              .font(.caption2)
                              .foregroundColor(deliveryStatusColor(for: message))
                      }
                  }

                  if message.isEdited {
                      Text("Bearbeitet")
                          .font(.caption2.weight(.semibold))
                          .foregroundColor(.secondary)
                          .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)
                  }
              }
            .frame(maxWidth: 320, alignment: message.isOutgoing ? .trailing : .leading)

            if !message.isOutgoing {
                Spacer(minLength: 44)
            }
        }
        .frame(maxWidth: .infinity)
    }
}

private func deliveryStatusSymbol(for message: ChatMessage) -> String? {
    if let sendStatus = message.sendStatus {
        switch sendStatus {
        case .sending: return "clock"
        case .sent: return nil
        case .failed: return "exclamationmark.triangle.fill"
        }
    }
    return message.isPending ? "clock" : nil
}

private func deliveryStatusColor(for message: ChatMessage) -> Color {
    if message.sendStatus == .failed {
        return .red
    }
    return .secondary
}

private func senderAccent(for senderDisplayName: String) -> SpaceAccent {
    let normalized = senderDisplayName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let hashValue = normalized.unicodeScalars.reduce(UInt64(0)) { partialResult, scalar in
        (partialResult &* 31) &+ UInt64(scalar.value)
    }
    let accents = SpaceAccent.allCases
    guard !accents.isEmpty else { return .slate }
    return accents[Int(hashValue % UInt64(accents.count))]
}

private let sharedLinkDetector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

private struct MessageBody: View {
    @EnvironmentObject private var appState: AppState
    let message: ChatMessage
    let isOutgoing: Bool
    let accent: SpaceAccent
    let attachmentAction: () -> Void

    private var firstURL: URL? {
        guard message.kind == .text, !message.body.isEmpty else { return nil }
        let range = NSRange(message.body.startIndex..., in: message.body)
        return sharedLinkDetector?.firstMatch(in: message.body, range: range).flatMap {
            $0.url
        }
    }

    var body: some View {
        switch message.kind {
        case .text:
            VStack(alignment: .leading, spacing: 8) {
                Text(message.body)
                    .fixedSize(horizontal: false, vertical: true)
                if let url = firstURL {
                    if let socialVideo = SocialVideoLink.detect(in: url) {
                        SocialVideoCard(link: socialVideo, originalURL: url, isOutgoing: isOutgoing, accent: accent)
                    } else {
                        LinkPreviewCard(url: url, isOutgoing: isOutgoing, accent: accent)
                    }
                }
            }
        case .image:
            VStack(alignment: .leading, spacing: 10) {
                if let attachment = message.attachment {
                    InlineImageAttachment(attachment: attachment)
                    if !message.body.isEmpty {
                        Text(message.body)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case .video:
            VStack(alignment: .leading, spacing: 10) {
                if let attachment = message.attachment {
                    InlineVideoAttachment(attachment: attachment, action: attachmentAction)
                    if !message.body.isEmpty {
                        Text(message.body)
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        case .voice:
            VStack(alignment: .leading, spacing: 10) {
                if let attachment = message.attachment {
                    InlineVoiceAttachment(
                        attachment: attachment,
                        isOutgoing: isOutgoing,
                        accent: accent,
                        action: attachmentAction
                    )
                }
            }
        case .file, .event:
            VStack(alignment: .leading, spacing: 10) {
                if let attachment = message.attachment {
                    AttachmentCard(
                        attachment: attachment,
                        isOutgoing: isOutgoing,
                        accent: accent,
                        action: attachmentAction
                    )
                }
                if !message.body.isEmpty {
                    Text(message.body)
                        .font(.subheadline)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

private struct InlineImageAttachment: View {
    @EnvironmentObject private var appState: AppState

    let attachment: MessageAttachment

    var body: some View {
        Group {
            if let localCachePath = attachment.localCachePath,
               let uiImage = UIImage(contentsOfFile: localCachePath) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else if let remoteURL = appState.mediaDownloadURL(for: attachment.contentURI) {
                AsyncImage(url: remoteURL) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        imagePlaceholder(icon: "photo.slash")
                    default:
                        ZStack {
                            imagePlaceholder(icon: "photo")
                            ProgressView()
                        }
                    }
                }
            } else {
                imagePlaceholder(icon: "photo")
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 188)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private func imagePlaceholder(icon: String) -> some View {
        Rectangle()
            .fill(Color(uiColor: .tertiarySystemGroupedBackground))
            .overlay(
                Image(systemName: icon)
                    .font(.title2.weight(.semibold))
                    .foregroundColor(.secondary)
            )
    }
}

private struct InlineVideoAttachment: View {
    @EnvironmentObject private var appState: AppState
    @State private var localThumbnail: UIImage?
    @State private var remoteThumbnail: UIImage?

    let attachment: MessageAttachment
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                if let thumbnail = localThumbnail {
                    Image(uiImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                } else if let thumbnail = remoteThumbnail {
                    Image(uiImage: thumbnail)
                        .resizable()
                        .scaledToFill()
                } else {
                    ZStack {
                        Rectangle().fill(Color.black.opacity(0.7))
                        ProgressView()
                            .tint(.white)
                    }
                }

                Circle()
                    .fill(Color.black.opacity(0.52))
                    .frame(width: 54, height: 54)
                Image(systemName: "play.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .frame(height: 188)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .task(id: attachment.localCachePath) {
            guard let path = attachment.localCachePath else { return }
            localThumbnail = await generateVideoThumbnail(from: URL(fileURLWithPath: path))
        }
        .task(id: attachment.contentURI) {
            guard localThumbnail == nil,
                  let remoteURL = appState.mediaDownloadURL(for: attachment.contentURI) else {
                return
            }
            remoteThumbnail = await generateVideoThumbnail(from: remoteURL)
        }
    }

    private func generateVideoThumbnail(from url: URL) async -> UIImage? {
        await Task.detached(priority: .userInitiated) {
            let asset = AVURLAsset(url: url)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            let time = CMTime(seconds: 0, preferredTimescale: 600)
            guard let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) else { return nil }
            return UIImage(cgImage: cgImage)
        }.value
    }
}

private struct InlineVoiceAttachment: View {
    let attachment: MessageAttachment
    let isOutgoing: Bool
    let accent: SpaceAccent
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(isOutgoing ? Color.white.opacity(0.22) : accent.softTint)
                        .frame(width: 44, height: 44)
                    Image(systemName: "play.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(isOutgoing ? .white : accent.tint)
                }

                VStack(alignment: .leading, spacing: 4) {
                    WaveformView(isOutgoing: isOutgoing, accent: accent)
                        .frame(height: 28)
                    Text(attachment.subtitle)
                        .font(.caption2)
                        .foregroundColor(isOutgoing ? .white.opacity(0.72) : .secondary)
                }

                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct WaveformView: View {
    let isOutgoing: Bool
    let accent: SpaceAccent
    private let barCount = 24
    private let seed: [CGFloat] = [0.4, 0.7, 0.5, 1.0, 0.8, 0.6, 0.9, 0.4,
                                    0.7, 0.5, 0.8, 1.0, 0.6, 0.9, 0.5, 0.7,
                                    0.4, 0.8, 1.0, 0.6, 0.5, 0.9, 0.7, 0.4]

    var body: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach(0..<barCount, id: \.self) { index in
                Capsule()
                    .fill(isOutgoing ? Color.white.opacity(0.82) : accent.tint.opacity(0.72))
                    .frame(width: 2, height: max(4, seed[index % seed.count] * 28))
            }
        }
    }
}

// MARK: - Social video detection & embed

/// Parsed representation of a social-media video URL that can be embedded in-app.
private enum SocialVideoLink {
    case youtube(videoID: String)
    case tiktok(videoID: String)
    case instagram(shortCode: String, isReel: Bool)

    var platformName: String {
        switch self {
        case .youtube: return "YouTube"
        case .tiktok: return "TikTok"
        case .instagram: return "Instagram"
        }
    }

    var platformIcon: String {
        switch self {
        case .youtube: return "play.rectangle.fill"
        case .tiktok: return "music.note.tv.fill"
        case .instagram: return "camera.fill"
        }
    }

    /// The aspect ratio (width / height) best suited for displaying this embed.
    var aspectRatio: CGFloat {
        switch self {
        case .youtube: return 16.0 / 9.0
        case .tiktok: return 9.0 / 16.0
        case .instagram: return 4.0 / 5.0
        }
    }

    var embedURL: URL? {
        switch self {
        case .youtube(let id):
            return URL(string: "https://www.youtube.com/embed/\(id)?playsinline=1&autoplay=0")
        case .tiktok(let id):
            return URL(string: "https://www.tiktok.com/embed/v2/\(id)")
        case .instagram(let code, let isReel):
            if isReel {
                return URL(string: "https://www.instagram.com/reel/\(code)/embed/captioned/")
            }
            return URL(string: "https://www.instagram.com/p/\(code)/embed/captioned/")
        }
    }

    // MARK: Detection

    static func detect(in url: URL) -> SocialVideoLink? {
        let host = url.host?.lowercased() ?? ""
        let path = url.path

        if host.contains("youtube.com") || host == "youtu.be" || host == "www.youtu.be" {
            if let id = youtubeVideoID(from: url) { return .youtube(videoID: id) }
        }
        if host.contains("tiktok.com") {
            if let id = tiktokVideoID(from: url) { return .tiktok(videoID: id) }
        }
        if host.contains("instagram.com") {
            let parts = path.split(separator: "/").map(String.init)
            if let first = parts.first, (first == "reel" || first == "reels" || first == "p"), parts.count >= 2 {
                let isReel = first == "reel" || first == "reels"
                return .instagram(shortCode: parts[1], isReel: isReel)
            }
        }
        return nil
    }

    private static func youtubeVideoID(from url: URL) -> String? {
        let host = url.host?.lowercased() ?? ""
        let path = url.path
        // youtu.be/VIDEO_ID
        if host == "youtu.be" || host == "www.youtu.be" {
            let id = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return id.isEmpty ? nil : id
        }
        // youtube.com/shorts/VIDEO_ID
        if path.lowercased().hasPrefix("/shorts/") {
            let id = String(path.dropFirst("/shorts/".count))
            let clean = id.prefix(while: { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
            return clean.isEmpty ? nil : String(clean)
        }
        // youtube.com/watch?v=VIDEO_ID
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "v" })?.value
    }

    private static func tiktokVideoID(from url: URL) -> String? {
        let parts = url.path.split(separator: "/").map(String.init)
        if let idx = parts.firstIndex(of: "video"), idx + 1 < parts.count {
            return parts[idx + 1]
        }
        return nil
    }
}

/// Thin wrapper around WKWebView for social media embeds.
private struct WebEmbedView: UIViewRepresentable {
    let embedURL: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.scrollView.isScrollEnabled = false
        wv.backgroundColor = .black
        wv.isOpaque = false
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        guard uiView.url != embedURL else { return }
        uiView.load(URLRequest(url: embedURL))
    }
}

/// A tappable card that expands in-place to an embedded video player.
private struct SocialVideoCard: View {
    let link: SocialVideoLink
    let originalURL: URL
    let isOutgoing: Bool
    let accent: SpaceAccent

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if isExpanded, let embedURL = link.embedURL {
                WebEmbedView(embedURL: embedURL)
                    .frame(maxWidth: .infinity)
                    .aspectRatio(link.aspectRatio, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        isExpanded = false
                    }
                } label: {
                    Label("Schließen", systemImage: "xmark.circle")
                        .font(.caption)
                        .foregroundColor(isOutgoing ? .white.opacity(0.72) : .secondary)
                }
            } else {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        isExpanded = true
                    }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: link.platformIcon)
                            .font(.title3)
                            .foregroundColor(isOutgoing ? .white : accent.tint)
                            .frame(width: 42, height: 42)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(isOutgoing ? Color.white.opacity(0.18) : accent.softTint)
                            )

                        VStack(alignment: .leading, spacing: 2) {
                            Text(link.platformName)
                                .font(.caption.weight(.semibold))
                                .foregroundColor(isOutgoing ? .white.opacity(0.92) : accent.tint)
                            Text(originalURL.host ?? originalURL.absoluteString)
                                .font(.caption2)
                                .foregroundColor(isOutgoing ? .white.opacity(0.68) : .secondary)
                                .lineLimit(1)
                        }

                        Spacer(minLength: 0)

                        Image(systemName: "play.circle.fill")
                            .font(.title2)
                            .foregroundColor(isOutgoing ? .white.opacity(0.88) : accent.tint)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isOutgoing ? Color.white.opacity(0.12) : accent.softTint)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct LinkPreviewCard: View {
    let url: URL
    let isOutgoing: Bool
    let accent: SpaceAccent

    var body: some View {
        Link(destination: url) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(isOutgoing ? Color.white.opacity(0.72) : accent.tint)
                    .frame(width: 3)

                VStack(alignment: .leading, spacing: 3) {
                    Text(url.host ?? url.absoluteString)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(isOutgoing ? .white.opacity(0.92) : accent.tint)
                        .lineLimit(1)
                    Text(url.absoluteString)
                        .font(.caption2)
                        .foregroundColor(isOutgoing ? .white.opacity(0.68) : .secondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Image(systemName: "arrow.up.right.square")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(isOutgoing ? .white.opacity(0.72) : accent.tint)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isOutgoing ? Color.white.opacity(0.12) : accent.softTint)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct AttachmentCard: View {
    let attachment: MessageAttachment
    let isOutgoing: Bool
    let accent: SpaceAccent
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: attachment.icon)
                    .font(.headline)
                    .foregroundColor(isOutgoing ? accent.tint : .white)
                    .frame(width: 40, height: 40)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(isOutgoing ? Color.white.opacity(0.88) : accent.tint.opacity(0.22))
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(attachment.title)
                        .font(.subheadline.weight(.semibold))
                    Text(attachment.subtitle)
                        .font(.caption)
                        .foregroundColor(isOutgoing ? .white.opacity(0.8) : .secondary)
                }

                Spacer(minLength: 8)

                if attachment.contentURI != nil {
                    Image(systemName: attachment.localCachePath == nil ? "arrow.down.circle" : "checkmark.circle.fill")
                        .foregroundColor(isOutgoing ? .white.opacity(0.88) : accent.tint)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

private struct TypingIndicatorBanner: View {
    let userIDs: [String]

    @State private var isAnimating = false

    /// Extracts a friendly name from a Matrix user ID like "@alice:server.com" → "alice".
    private func displayName(for userID: String) -> String {
        guard userID.hasPrefix("@"), let colon = userID.firstIndex(of: ":") else { return userID }
        let localpart = String(userID[userID.index(after: userID.startIndex)..<colon])
        return localpart.isEmpty ? userID : localpart
    }

    private var label: String {
        let names = userIDs.map { displayName(for: $0) }
        switch names.count {
        case 1: return "\(names[0]) tippt…"
        case 2: return "\(names[0]) und \(names[1]) tippen…"
        default: return "\(names.count) Personen tippen…"
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .frame(width: 6, height: 6)
                        .scaleEffect(isAnimating ? 1.0 : 1.5)
                        .animation(
                            .easeInOut(duration: 0.5)
                                .repeatForever(autoreverses: true)
                                .delay(Double(index) * 0.18),
                            value: isAnimating
                        )
                }
            }
            .foregroundColor(.secondary)

            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(Color(uiColor: .systemBackground).opacity(0.92))
        .onAppear { isAnimating = true }
        .onDisappear { isAnimating = false }
    }
}

private struct ComposerBar: View {
    @Binding var draft: String
    let accent: SpaceAccent
    var isSending: Bool = false
    let sendAction: () -> Void
    let attachmentAction: (ChatMessageKind) -> Void
    let eventAction: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Menu {
                Section("Teilen") {
                    Button { attachmentAction(.voice) } label: { Label("Sprachnachricht", systemImage: "waveform") }
                    Button { attachmentAction(.image) } label: { Label("Bild", systemImage: "photo") }
                    Button { attachmentAction(.video) } label: { Label("Video", systemImage: "video.fill") }
                    Button { attachmentAction(.file) } label: { Label("Datei", systemImage: "doc.fill") }
                }

                Section("Planung") {
                    Button { eventAction() } label: { Label("Termin planen", systemImage: "calendar.badge.plus") }
                }
            } label: {
                Image(systemName: "plus.circle.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(accent.tint)
                    .frame(width: 36, height: 36)
            }

            HStack(spacing: 10) {
                TextField("Schreibe eine Nachricht ...", text: $draft)
                    .textFieldStyle(.plain)

                Button {
                    sendAction()
                } label: {
                    ZStack {
                        Circle()
                            .fill(accent.tint)
                            .frame(width: 34, height: 34)
                        if isSending {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .tint(.white)
                                .scaleEffect(0.72)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.subheadline.weight(.bold))
                                .foregroundColor(.white)
                        }
                    }
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(uiColor: .secondarySystemGroupedBackground))
            )

        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial)
    }
}

private struct EditMessageSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var text: String
    let saveAction: () -> Void

    var body: some View {
        NavigationView {
            Form {
                Section("Nachricht bearbeiten") {
                    TextEditor(text: $text)
                        .frame(minHeight: 140)
                }
            }
            .navigationTitle("Bearbeiten")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Abbrechen") { dismiss() }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Speichern") {
                        saveAction()
                        dismiss()
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct SharedMediaSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    let thread: ChatThread

    var body: some View {
        NavigationView {
            List {
                if appState.sharedMedia(for: thread.id).isEmpty {
                    Text("Noch keine geteilten Medien in diesem Chat.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(appState.sharedMedia(for: thread.id)) { message in
                        Button {
                            Task {
                                await appState.downloadAttachment(messageID: message.id, in: thread.id)
                            }
                        } label: {
                            HStack(spacing: 12) {
                                if let attachment = message.attachment {
                                    Image(systemName: attachment.icon)
                                        .foregroundColor(thread.accent.tint)
                                        .frame(width: 36, height: 36)
                                        .background(thread.accent.softTint)
                                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(attachment.title)
                                            .font(.subheadline.weight(.semibold))
                                        Text(attachment.subtitle)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                        Text(message.timestamp.formatted(date: .abbreviated, time: .shortened))
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }

                                    Spacer()

                                    if attachment.contentURI != nil {
                                        Image(systemName: attachment.localCachePath == nil ? "arrow.down.circle" : "checkmark.circle.fill")
                                            .foregroundColor(thread.accent.tint)
                                    }
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("Geteilte Medien")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }
}

private struct EventPlannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    let thread: ChatThread
    @State private var title: String
    @State private var note = ""
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var selectedProviderIDs: Set<String>

    init(thread: ChatThread, defaultProviderIDs: [String], defaultDurationMinutes: Int) {
        self.thread = thread
        let defaultStart = Calendar.current.date(byAdding: .hour, value: 1, to: .now) ?? .now
        let defaultEnd = Calendar.current.date(byAdding: .minute, value: defaultDurationMinutes, to: defaultStart) ?? defaultStart.addingTimeInterval(3600)
        _title = State(initialValue: "")
        _startDate = State(initialValue: defaultStart)
        _endDate = State(initialValue: defaultEnd)
        _selectedProviderIDs = State(initialValue: Set(defaultProviderIDs))
    }

    var body: some View {
        NavigationView {
            Form {
                Section("Termin") {
                    TextField("Titel", text: $title)
                    TextField("Notiz", text: $note)
                    DatePicker("Start", selection: $startDate, displayedComponents: [.date, .hourAndMinute])
                    DatePicker("Ende", selection: $endDate, displayedComponents: [.date, .hourAndMinute])
                }

                Section("Kalender verbinden") {
                    if appState.calendarProviders.isEmpty {
                        Text("Noch keine Provider verfuegbar.")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(appState.calendarProviders) { provider in
                            Toggle(isOn: providerSelectionBinding(provider.id)) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(provider.kind.title)
                                    Text(provider.isConnected ? provider.accountLabel : "Nicht verbunden")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .disabled(!provider.isConnected)
                        }
                    }

                    if appState.connectedProviderIDs().isEmpty {
                        Text("Aktuell wird der Termin nur in MatrixMess gespeichert. Verbinde im Calendar-Tab Apple Calendar, Google oder Outlook.")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Termin planen")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Abbrechen") { dismiss() }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Speichern") {
                        let safeEnd = max(endDate, startDate.addingTimeInterval(900))
                        Task {
                            await appState.createScheduledEvent(
                                title: title,
                                note: note,
                                startDate: startDate,
                                endDate: safeEnd,
                                in: thread.id,
                                providerIDs: Array(selectedProviderIDs)
                            )
                            dismiss()
                        }
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func providerSelectionBinding(_ providerID: String) -> Binding<Bool> {
        Binding {
            selectedProviderIDs.contains(providerID)
        } set: { isSelected in
            if isSelected {
                selectedProviderIDs.insert(providerID)
            } else {
                selectedProviderIDs.remove(providerID)
            }
        }
    }
}

private struct CallsView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        List {
            if let activeCallRoomID = appState.activeCallRoomID,
               let thread = appState.thread(withID: activeCallRoomID) {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "phone.connection.fill")
                            .font(.title2)
                            .foregroundColor(.green)

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Aktiver Call")
                                .font(.subheadline.weight(.bold))
                            Text(thread.title)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        Button {
                            Task { await appState.endActiveCall() }
                        } label: {
                            Image(systemName: "phone.down.fill")
                                .foregroundColor(.white)
                                .padding(10)
                                .background(Color.red)
                                .clipShape(Circle())
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section {
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color.green.opacity(0.12))
                            .frame(width: 72, height: 72)

                        Image(systemName: "phone.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.green)
                    }

                    VStack(spacing: 6) {
                        Text("Calls")
                            .font(.title3.weight(.bold))
                        Text("Starte Sprach- oder Videoanrufe direkt aus einem Chat heraus. Nutze den Calendar-Tab fuer Termin-Syncs.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }

            if !appState.calls.isEmpty {
                Section("Letzte Calls") {
                    ForEach(appState.calls.sorted(by: { $0.startedAt > $1.startedAt })) { call in
                        let thread = appState.thread(withID: call.threadID)

                        Button {
                            appState.openThread(call.threadID)
                        } label: {
                            HStack(spacing: 12) {
                                if let thread {
                                    ThreadAvatarView(thread: thread, size: 44)
                                } else {
                                    Circle()
                                        .fill(Color.green.opacity(0.14))
                                        .frame(width: 44, height: 44)
                                        .overlay(
                                            Image(systemName: "phone.fill")
                                                .foregroundColor(.green)
                                        )
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(thread?.title ?? "Call")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(.primary)
                                    Text(call.note)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                        .lineLimit(2)
                                }

                                Spacer()

                                VStack(alignment: .trailing, spacing: 4) {
                                    Image(systemName: call.kindLabel == "Video" ? "video.fill" : "phone.fill")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                    Text(formattedTimestamp(call.startedAt))
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Calls")
    }
}

private struct CalendarView: View {
    @EnvironmentObject private var appState: AppState
    @State private var displayedMonth = Calendar.current.date(from: Calendar.current.dateComponents([.year, .month], from: .now)) ?? .now
    @State private var selectedDate = Date()

    private let calendar = Calendar.current

    private var monthTitle: String {
        displayedMonth.formatted(.dateTime.year().month(.wide))
    }

    private var weekdaySymbols: [String] {
        let symbols = calendar.shortStandaloneWeekdaySymbols
        let start = max(0, min(symbols.count - 1, calendar.firstWeekday - 1))
        let tail = Array(symbols[start...])
        let head = Array(symbols[..<start])
        return tail + head
    }

    private var monthDays: [Date?] {
        guard let monthInterval = calendar.dateInterval(of: .month, for: displayedMonth) else { return [] }
        let firstDay = monthInterval.start
        let daysInMonth = calendar.range(of: .day, in: .month, for: firstDay)?.count ?? 0
        let weekdayOfFirst = calendar.component(.weekday, from: firstDay)
        let leadingBlanks = (weekdayOfFirst - calendar.firstWeekday + 7) % 7

        var values: [Date?] = Array(repeating: nil, count: leadingBlanks)
        for offset in 0..<daysInMonth {
            if let day = calendar.date(byAdding: .day, value: offset, to: firstDay) {
                values.append(day)
            }
        }
        while values.count % 7 != 0 {
            values.append(nil)
        }
        return values
    }

    private var selectedDayEvents: [ScheduledChatEvent] {
        appState.scheduledEvents
            .filter { calendar.isDate($0.startDate, inSameDayAs: selectedDate) }
            .sorted { $0.startDate < $1.startDate }
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color.orange.opacity(0.12))
                            .frame(width: 72, height: 72)

                        Image(systemName: "calendar.badge.clock")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.orange)
                    }

                    VStack(spacing: 6) {
                        Text("Kalender-Hub")
                            .font(.title3.weight(.bold))
                        Text("Zeigt Termine aus allen verbundenen Kalendern. Verbindungen verwaltest du in den Settings.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }

            Section("Monat") {
                VStack(spacing: 12) {
                    HStack {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                displayedMonth = calendar.date(byAdding: .month, value: -1, to: displayedMonth) ?? displayedMonth
                            }
                        } label: {
                            Image(systemName: "chevron.left")
                        }
                        .buttonStyle(.plain)

                        Spacer()

                        Text(monthTitle)
                            .font(.headline)

                        Spacer()

                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                displayedMonth = calendar.date(byAdding: .month, value: 1, to: displayedMonth) ?? displayedMonth
                            }
                        } label: {
                            Image(systemName: "chevron.right")
                        }
                        .buttonStyle(.plain)
                    }

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 8) {
                        ForEach(weekdaySymbols, id: \.self) { symbol in
                            Text(symbol.uppercased())
                                .font(.caption2.weight(.semibold))
                                .foregroundColor(.secondary)
                                .frame(maxWidth: .infinity)
                        }

                        ForEach(Array(monthDays.enumerated()), id: \.offset) { _, maybeDate in
                            if let date = maybeDate {
                                let isSelected = calendar.isDate(date, inSameDayAs: selectedDate)
                                let hasEvents = appState.scheduledEvents.contains { calendar.isDate($0.startDate, inSameDayAs: date) }
                                Button {
                                    selectedDate = date
                                } label: {
                                    VStack(spacing: 3) {
                                        Text("\(calendar.component(.day, from: date))")
                                            .font(.subheadline.weight(isSelected ? .bold : .regular))
                                            .foregroundColor(isSelected ? .white : .primary)
                                        Circle()
                                            .fill(hasEvents ? (isSelected ? Color.white.opacity(0.92) : Color.orange) : Color.clear)
                                            .frame(width: 5, height: 5)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 34)
                                    .background(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .fill(isSelected ? Color.orange : Color.clear)
                                    )
                                }
                                .buttonStyle(.plain)
                            } else {
                                Color.clear
                                    .frame(height: 34)
                            }
                        }
                    }
                }
            }

            Section(selectedDate.formatted(date: .complete, time: .omitted)) {
                if selectedDayEvents.isEmpty {
                    Text("Keine Termine an diesem Tag.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(selectedDayEvents) { event in
                        Button {
                            appState.openThread(event.threadID)
                        } label: {
                            CalendarEventRow(event: event)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Section("Naechste Termine") {
                ForEach(appState.upcomingEvents().prefix(6)) { event in
                    Button {
                        appState.openThread(event.threadID)
                    } label: {
                        CalendarEventRow(event: event)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Calendar")
    }
}

private struct CalendarProviderRow: View {
    @EnvironmentObject private var appState: AppState
    let provider: CalendarProviderConnection

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: provider.kind.systemImage)
                    .foregroundColor(provider.kind.accent.tint)
                    .frame(width: 36, height: 36)
                    .background(provider.kind.accent.softTint)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(provider.kind.title)
                        .font(.subheadline.weight(.semibold))
                    Text(provider.accountLabel)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                Button(provider.isConnected ? "Trennen" : "Verbinden") {
                    Task {
                        await appState.toggleCalendarConnection(provider.id)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(provider.isConnected ? .orange : provider.kind.accent.tint)
            }

            Text("\(provider.kind.apiLabel): \(provider.statusNote)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

private struct CalendarEventRow: View {
    @EnvironmentObject private var appState: AppState
    let event: ScheduledChatEvent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(event.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.primary)
                Spacer()
                Text(event.startDate.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            if !event.note.isEmpty {
                Text(event.note)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }

            HStack(spacing: 10) {
                if let thread = appState.thread(withID: event.threadID) {
                    Text(thread.title)
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(thread.accent.tint)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(thread.accent.softTint)
                        .clipShape(Capsule())
                }

                Text(appState.providerNames(for: event))
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct MediaLibraryPicker: UIViewControllerRepresentable {
    let kind: ChatMessageKind
    let onImport: (Data, String, String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(kind: kind, onImport: onImport)
    }

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.selectionLimit = 1
        configuration.filter = kind == .video ? .videos : .images
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        private let kind: ChatMessageKind
        private let onImport: (Data, String, String) -> Void

        init(kind: ChatMessageKind, onImport: @escaping (Data, String, String) -> Void) {
            self.kind = kind
            self.onImport = onImport
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            picker.dismiss(animated: true)
            guard let result = results.first else { return }

            let provider = result.itemProvider
            if kind == .video {
                let typeIdentifier = UTType.movie.identifier
                provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, _ in
                    if let url,
                       let data = try? Data(contentsOf: url) {
                        let fileName = url.lastPathComponent.isEmpty ? "video.mov" : url.lastPathComponent
                        let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "video/quicktime"
                        DispatchQueue.main.async {
                            self.onImport(data, mimeType, fileName)
                        }
                        return
                    }

                    // Fallback for providers that don't expose a temporary file URL.
                    provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, _ in
                        guard let data else { return }
                        let fileName = (provider.suggestedName ?? "video") + ".mov"
                        DispatchQueue.main.async {
                            self.onImport(data, "video/quicktime", fileName)
                        }
                    }
                }
            } else {
                let typeIdentifier = UTType.image.identifier
                provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, _ in
                    guard let data else { return }
                    let guessedUTI = provider.registeredTypeIdentifiers
                        .compactMap { UTType($0) }
                        .first(where: { $0.conforms(to: .image) })
                    let ext = guessedUTI?.preferredFilenameExtension ?? "jpg"
                    let mime = guessedUTI?.preferredMIMEType ?? "image/jpeg"
                    let fileName = (provider.suggestedName ?? "photo") + ".\(ext)"
                    DispatchQueue.main.async {
                        self.onImport(data, mime, fileName)
                    }
                }
            }
        }
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showingRecoverySheet = false
    @State private var showingVerifySheet = false

    var body: some View {
        Form {
            // Profile header (inspired by Element X)
            Section {
                VStack(spacing: 14) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 0.55, green: 0.30, blue: 0.95), Color.indigo],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 80, height: 80)
                            .shadow(color: Color.purple.opacity(0.3), radius: 12, y: 4)

                        Text(String((appState.currentUserID ?? "?").prefix(1)).uppercased())
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }

                    VStack(spacing: 4) {
                        Text(appState.currentUserID ?? "Nicht angemeldet")
                            .font(.headline)

                        Text(appState.homeserver)
                            .font(.caption)
                            .foregroundColor(.secondary)

                        HStack(spacing: 4) {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 8, height: 8)
                            Text("Session aktiv")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 2)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
            }

            // Sign out button
            Section {
                Button(role: .destructive) {
                    appState.signOut()
                } label: {
                    HStack {
                        Spacer()
                        Label("Abmelden", systemImage: "rectangle.portrait.and.arrow.right")
                            .font(.body.weight(.semibold))
                        Spacer()
                    }
                }
            }

            Section("Darstellung") {
                Picker("Theme", selection: Binding(
                    get: { appState.themeMode },
                    set: { appState.themeMode = $0 }
                )) {
                    ForEach(ThemeMode.allCases, id: \.self) { mode in
                        Text(mode.title).tag(mode)
                    }
                }

                Toggle("Inline-Medien im Chat", isOn: Binding(
                    get: { appState.inlineMediaEnabled },
                    set: { appState.inlineMediaEnabled = $0 }
                ))
            }

            Section("Mitteilungen") {
                Toggle("Mitteilungen", isOn: Binding(
                    get: { appState.notificationsEnabled },
                    set: { appState.notificationsEnabled = $0 }
                ))

                Toggle("Lesebestaetigungen", isOn: Binding(
                    get: { appState.readReceiptsEnabled },
                    set: { appState.readReceiptsEnabled = $0 }
                ))

                Toggle("Tippindikatoren", isOn: Binding(
                    get: { appState.typingIndicatorsEnabled },
                    set: { appState.typingIndicatorsEnabled = $0 }
                ))

                TextField("Push-Gateway URL", text: Binding(
                    get: { appState.pushGatewayURL },
                    set: { appState.pushGatewayURL = $0 }
                ))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                Button(appState.pushNotificationsAuthorized ? "APNs/Pusher aktualisieren" : "Push erlauben") {
                    Task {
                        if appState.pushNotificationsAuthorized {
                            await appState.registerMatrixPusher()
                        } else {
                            await appState.requestPushNotifications()
                        }
                    }
                }
            }

            Section("Privacy und Daten") {
                Toggle("App Lock", isOn: Binding(
                    get: { appState.appLockEnabled },
                    set: { appState.appLockEnabled = $0 }
                ))

                Toggle("Medien in Fotos sichern", isOn: Binding(
                    get: { appState.saveMediaToPhotos },
                    set: { appState.saveMediaToPhotos = $0 }
                ))

                Toggle("Auto-Download nur im WLAN", isOn: Binding(
                    get: { appState.autoDownloadOnWiFi },
                    set: { appState.autoDownloadOnWiFi = $0 }
                ))
            }

            Section("Kalender-Sync") {
                Toggle("Neue Termine automatisch syncen", isOn: Binding(
                    get: { appState.calendarAutoSyncEnabled },
                    set: { appState.calendarAutoSyncEnabled = $0 }
                ))

                Stepper("Standarddauer: \(appState.defaultMeetingDurationMinutes) Min", value: Binding(
                    get: { appState.defaultMeetingDurationMinutes },
                    set: { appState.defaultMeetingDurationMinutes = $0 }
                ), in: 15...180, step: 15)

                TextField("Google OAuth Client ID", text: Binding(
                    get: { appState.googleCalendarClientID },
                    set: { appState.googleCalendarClientID = $0 }
                ))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                TextField("Outlook OAuth Client ID", text: Binding(
                    get: { appState.outlookCalendarClientID },
                    set: { appState.outlookCalendarClientID = $0 }
                ))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                Text("Redirects: Google `dev.matrixmess.app:/oauth/google`, Outlook `msauth.dev.matrixmess.app://auth`.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }

            Section("Kalender-Verbindungen") {
                ForEach(appState.calendarProviders) { provider in
                    CalendarProviderRow(provider: provider)
                }

                Button("Kalender jetzt synchronisieren") {
                    Task {
                        for provider in appState.calendarProviders where provider.isConnected {
                            await appState.syncExternalCalendar(
                                provider.kind,
                                from: .now.addingTimeInterval(-60 * 60 * 24 * 30),
                                to: .now.addingTimeInterval(60 * 60 * 24 * 180)
                            )
                        }
                    }
                }
            }

            Section("Crypto und Sync") {
                settingsValueRow(label: "E2EE verfuegbar", value: appState.cryptoStatus.encryptionAvailable ? "Ja" : "Noch nicht aktiv")
                settingsValueRow(label: "Recovery", value: appState.cryptoStatus.recoveryStateLabel)
                settingsValueRow(label: "Key Backup", value: appState.cryptoStatus.backupStateLabel)
                settingsValueRow(label: "Device Verify", value: appState.cryptoStatus.verificationStateLabel)
                settingsValueRow(label: "Sync-Loop", value: appState.syncEngineState.isRunning ? "Laeuft" : "Gestoppt")
                settingsValueRow(label: "Sync-Fehler", value: "\(appState.syncEngineState.consecutiveFailures)")
                settingsValueRow(label: "Letzter Sync", value: diagnosticsText(appState.diagnostics.lastSuccessfulSyncAt))
                settingsValueRow(label: "APNs erlaubt", value: appState.pushNotificationsAuthorized ? "Ja" : "Nein")
                settingsValueRow(label: "APNs-Token", value: appState.remoteNotificationTokenAvailable ? "Vorhanden" : "Fehlt")

                if appState.verificationFlowState.isActive || appState.verificationFlowState.isVerified {
                    Button("Verifizierung anzeigen") {
                        showingVerifySheet = true
                    }
                    .foregroundColor(appState.verificationFlowState.isVerified ? .green : .blue)
                }

                Button("Crypto vorbereiten") {
                    Task { await appState.prepareCryptoStack() }
                }

                Button("Recovery Key eingeben") {
                    showingRecoverySheet = true
                }

                Button("Dieses Geraet verifizieren") {
                    Task {
                        await appState.requestCurrentDeviceVerification()
                        showingVerifySheet = true
                    }
                }
            }

            Section("App-Info") {
                settingsValueRow(label: "Version", value: appBuildLabel)
                settingsValueRow(label: "Build", value: "2026-03-18")
                settingsValueRow(label: "Homeserver", value: appState.homeserver)
                settingsValueRow(label: "User-ID", value: appState.currentUserID ?? "–")
            }

            Section("Diagnose") {
                settingsValueRow(label: "Status", value: appState.diagnostics.statusNote)
                settingsValueRow(label: "Threads", value: "\(appState.diagnostics.cachedThreadCount)")
                settingsValueRow(label: "Messages", value: "\(appState.diagnostics.cachedMessageCount)")
                settingsValueRow(label: "Drafts", value: "\(appState.draftsByThreadID.count)")
                settingsValueRow(label: "Sync-Loop", value: appState.diagnostics.isSyncLoopRunning ? "Laeuft" : "Gestoppt")
                settingsValueRow(label: "Sync-Fehler", value: "\(appState.diagnostics.syncFailureCount)")
                settingsValueRow(label: "Snapshot geladen", value: diagnosticsText(appState.diagnostics.lastSnapshotLoadAt))
                settingsValueRow(label: "Snapshot gespeichert", value: diagnosticsText(appState.diagnostics.lastSnapshotSaveAt))
                settingsValueRow(label: "Session gespeichert", value: diagnosticsText(appState.diagnostics.lastSessionSaveAt))
                settingsValueRow(label: "Session restored", value: diagnosticsText(appState.diagnostics.lastSessionRestoreAt))

                if let errorText = appState.diagnostics.lastErrorDescription {
                    Text(errorText)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }

                Button("Matrix-Daten neu laden") {
                    Task { await appState.refreshMatrixData(forceFullSync: true) }
                }

                Button("Persistierten Snapshot loeschen", role: .destructive) {
                    appState.clearStoredSnapshot()
                }
            }
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $showingRecoverySheet) {
            RecoveryKeySheet {
                await appState.recoverEncryption(with: $0)
            }
        }
        .sheet(isPresented: $showingVerifySheet) {
            E2EEVerifySheet()
                .environmentObject(appState)
        }
        .onChange(of: appState.verificationFlowState.isActive) { isActive in
            if isActive {
                showingVerifySheet = true
            }
        }
    }

    private func diagnosticsText(_ date: Date?) -> String {
        guard let date else { return "Noch nicht" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    @ViewBuilder
    private func settingsValueRow(label: String, value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
            Spacer(minLength: 16)
            Text(value)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct PostLoginSetupSheet: View {
    @EnvironmentObject private var appState: AppState
    let onRecovery: () -> Void
    let onVerify: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationView {
            VStack(spacing: 32) {
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(Color.blue.opacity(0.12))
                            .frame(width: 80, height: 80)
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 32, weight: .semibold))
                            .foregroundColor(.blue)
                    }

                    Text("Ende-zu-Ende-Verschlüsselung")
                        .font(.title2.weight(.bold))

                    Text("Richte die Verschlüsselung ein, damit deine Nachrichten sicher bleiben und auf allen Geräten lesbar sind.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)
                }
                .padding(.top, 12)

                VStack(spacing: 12) {
                    Button(action: onRecovery) {
                        HStack(spacing: 14) {
                            Image(systemName: "key.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 36, height: 36)
                                .background(Color.blue)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Recovery Key eingeben")
                                    .font(.body.weight(.semibold))
                                Text("Verschlüsselung aus bestehender Sitzung wiederherstellen")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(Color(uiColor: .tertiaryLabel))
                        }
                        .padding(16)
                        .background(Color(uiColor: .secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    Button(action: onVerify) {
                        HStack(spacing: 14) {
                            Image(systemName: "checkmark.shield.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 36, height: 36)
                                .background(Color.green)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                            VStack(alignment: .leading, spacing: 2) {
                                Text("Gerät verifizieren")
                                    .font(.body.weight(.semibold))
                                Text("Mit einem anderen angemeldeten Gerät gegenseitig bestätigen")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(Color(uiColor: .tertiaryLabel))
                        }
                        .padding(16)
                        .background(Color(uiColor: .secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                Button("Später einrichten", action: onDismiss)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.bottom, 8)
            }
            .padding(.horizontal, 24)
            .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Überspringen", action: onDismiss)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

private struct RecoveryKeySheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var recoveryKey = ""
    let submit: (String) async -> Void

    var body: some View {
        NavigationView {
            Form {
                Section("Wiederherstellungsschluessel") {
                    TextEditor(text: $recoveryKey)
                        .frame(minHeight: 140)
                    Text("Nutze hier denselben Recovery Key, den andere Matrix-Clients beim Geraete- oder Session-Restore abfragen.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle("Recovery Key")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Wiederherstellen") {
                        Task {
                            await submit(recoveryKey)
                            dismiss()
                        }
                    }
                    .disabled(recoveryKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: rect.midX, y: rect.maxY))
            p.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            p.closeSubpath()
        }
    }
}

private struct E2EEVerifySheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var appState: AppState

    private var state: MatrixVerificationFlowState { appState.verificationFlowState }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    verificationStatusHeader

                    if state.isVerified {
                        verifiedView
                    } else if !state.emojis.isEmpty {
                        emojiGrid
                        verificationActions
                    } else if !state.decimals.isEmpty {
                        decimalsView
                        verificationActions
                    } else {
                        pendingView
                    }
                }
                .padding(24)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Geraet verifizieren")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fertig") { dismiss() }
                }
            }
        }
    }

    private var verificationStatusHeader: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(statusColor.opacity(0.14))
                    .frame(width: 76, height: 76)
                Image(systemName: statusIcon)
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(statusColor)
            }
            Text(state.statusLabel)
                .font(.headline)
                .multilineTextAlignment(.center)
            if let detail = state.detailLabel {
                Text(detail)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            if let senderUserID = state.senderUserID {
                Label(senderUserID, systemImage: "person.crop.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.secondary)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
    }

    private var statusColor: Color {
        if state.isVerified { return .green }
        if state.isFailed || state.isCancelled { return .red }
        return .blue
    }

    private var statusIcon: String {
        if state.isVerified { return "checkmark.shield.fill" }
        if state.isFailed { return "xmark.shield.fill" }
        if state.isCancelled { return "minus.shield.fill" }
        if !state.emojis.isEmpty || !state.decimals.isEmpty { return "lock.open.fill" }
        return "shield.lefthalf.filled"
    }

    private var verifiedView: some View {
        VStack(spacing: 16) {
            Text("Dein Geraet ist jetzt mit diesem Geraet verifiziert. Verschluesselte Nachrichten werden korrekt entschluesselt.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
            Button("Fertig") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
    }

    private var pendingView: some View {
        VStack(spacing: 16) {
            if state.canStartSas {
                Text("Die andere Seite hat die Anfrage akzeptiert. Starte jetzt die SAS-Verifizierung.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                Button("SAS-Verifizierung starten") {
                    Task { await appState.startSasVerification() }
                }
                .buttonStyle(.borderedProminent)
            } else if state.canApprove {
                Text("Warte auf Verifizierungsdaten ...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                ProgressView()
            } else {
                ProgressView()
                Text("Warte auf die andere Seite ...")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            if state.canCancel {
                Button("Abbrechen", role: .cancel) {
                    Task { await appState.cancelVerification() }
                }
                .foregroundColor(.secondary)
            }
        }
    }

    private var emojiGrid: some View {
        VStack(spacing: 16) {
            Text("Vergleiche diese Emoji auf beiden Geraeten. Sie muessen identisch sein.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)

            let columns = Array(repeating: GridItem(.flexible(), spacing: 12), count: 4)
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(state.emojis.indices, id: \.self) { index in
                    let emoji = state.emojis[index]
                    VStack(spacing: 6) {
                        Text(emoji.symbol)
                            .font(.system(size: 34))
                        Text(emoji.description)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(uiColor: .secondarySystemGroupedBackground))
                    )
                }
            }
        }
    }

    private var decimalsView: some View {
        VStack(spacing: 16) {
            Text("Vergleiche diese Zahlen auf beiden Geraeten. Sie muessen identisch sein.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 20) {
                ForEach(state.decimals, id: \.self) { value in
                    Text("\(value)")
                        .font(.system(size: 28, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Color(uiColor: .secondarySystemGroupedBackground))
                        )
                }
            }
        }
    }

    private var verificationActions: some View {
        VStack(spacing: 12) {
            if state.canApprove {
                Button {
                    Task { await appState.approveVerification() }
                } label: {
                    HStack {
                        Spacer()
                        Label("Sie stimmen ueberein", systemImage: "checkmark.circle.fill")
                            .font(.headline)
                            .foregroundColor(.white)
                        Spacer()
                    }
                    .padding(.vertical, 14)
                    .background(Color.green)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            if state.canDecline {
                Button {
                    Task { await appState.declineVerification() }
                } label: {
                    HStack {
                        Spacer()
                        Label("Sie stimmen NICHT ueberein", systemImage: "xmark.circle.fill")
                            .font(.headline)
                            .foregroundColor(.white)
                        Spacer()
                    }
                    .padding(.vertical, 14)
                    .background(Color.red)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)
            }

            if state.canCancel {
                Button("Abbrechen", role: .cancel) {
                    Task { await appState.cancelVerification() }
                }
                .foregroundColor(.secondary)
            }
        }
    }
}

private func messageBubbleTimestamp(_ date: Date) -> String {
    if Calendar.current.isDateInToday(date) {
        return date.formatted(date: .omitted, time: .shortened)
    }
    return date.formatted(date: .abbreviated, time: .shortened)
}

private func formattedTimestamp(_ date: Date) -> String {
    if Calendar.current.isDateInToday(date) {
        return date.formatted(date: .omitted, time: .shortened)
    }

    if Calendar.current.isDateInYesterday(date) {
        return "Gestern"
    }

    return date.formatted(date: .abbreviated, time: .omitted)
}
