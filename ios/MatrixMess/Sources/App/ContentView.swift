import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

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
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(uiColor: .systemBackground), Color(uiColor: .secondarySystemBackground)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .scaleEffect(1.2)

                Text("MatrixMess vorbereitet")
                    .font(.title3.weight(.semibold))

                Text("Session, lokaler Snapshot und Einstellungen werden geladen.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
    }
}

private struct LoginView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationView {
            ZStack {
                Color(uiColor: .systemGroupedBackground)
                    .ignoresSafeArea()

                VStack(spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("MatrixMess")
                            .font(.system(size: 34, weight: .bold, design: .rounded))

                        Text("Ein Apple-naher Messenger mit Spaces, Bridges, Calls und Kalender-Sync.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(spacing: 16) {
                        LoginField(title: "Homeserver", text: $appState.homeserver, icon: "network")
                            .keyboardType(.URL)

                        LoginField(title: "Benutzername", text: $appState.username, icon: "person.fill")

                        VStack(alignment: .leading, spacing: 8) {
                            Label("Passwort", systemImage: "lock.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.secondary)

                            SecureField("Passwort", text: $appState.password)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .fill(Color(uiColor: .secondarySystemGroupedBackground))
                                )
                        }

                        Button {
                            Task { await appState.signIn() }
                        } label: {
                            HStack {
                                Spacer()
                                if appState.isSigningIn {
                                    ProgressView().tint(.white)
                                    Text("Verbinde ...")
                                } else {
                                    Text("Messenger starten")
                                }
                                Spacer()
                            }
                            .font(.headline)
                            .foregroundColor(.white)
                            .padding(.vertical, 16)
                            .background(
                                LinearGradient(
                                    colors: [Color.blue, Color.cyan],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }
                        .disabled(appState.isSigningIn)

                        if let errorMessage = appState.errorMessage {
                            Text(errorMessage)
                                .font(.footnote)
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(22)
                    .background(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(Color(uiColor: .systemBackground))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .stroke(Color.white.opacity(0.7), lineWidth: 1)
                    )
                    .shadow(color: Color.black.opacity(0.06), radius: 24, y: 12)

                    Text("Nach dem Login siehst du Chats, Calls, Calendar und Settings als feste Bereiche. Medien, Reaktionen und Weiterleiten leben direkt in den Chats und tauchen erst bei Bedarf auf.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Spacer(minLength: 0)
                }
                .padding(24)
            }
            .navigationBarHidden(true)
        }
    }
}

private struct LoginField: View {
    let title: String
    @Binding var text: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundColor(.secondary)

            TextField(title, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color(uiColor: .secondarySystemGroupedBackground))
                )
        }
    }
}

private struct MessengerShellView: View {
    @EnvironmentObject private var appState: AppState

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
        .accentColor(.blue)
        .preferredColorScheme(appState.preferredColorScheme)
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
                                Button {
                                    appState.toggleMainPin(for: thread.id)
                                } label: {
                                    Text(appState.isPinnedInMain(thread.id) ? "Aus Main" : "In Main")
                                }
                                .tint(appState.isPinnedInMain(thread.id) ? .orange : .blue)
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
                        Label(activeSpace.title, systemImage: activeSpace.icon)
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
                    Button("Matrix neu laden") {
                        Task { await appState.refreshMatrixData(forceFullSync: true) }
                    }
                    Button("Calendar") { appState.selectTab(.calendar) }
                    Button("Settings") { appState.selectTab(.settings) }
                    Button("Abmelden", role: .destructive) { appState.signOut() }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .refreshable {
            await appState.refreshMatrixData()
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
                        .font(.headline.weight(.semibold))

                    Text(space.subtitle)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.92))
                }

                Spacer()

                Text("\(chatCount)")
                    .font(.headline.weight(.bold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.16))
                    .clipShape(Capsule())
            }

            HStack(spacing: 12) {
                Label("\(chatCount) Chats", systemImage: "bubble.left.and.bubble.right.fill")
                if space.isMain {
                    Label("Kuratiert", systemImage: "star.fill")
                } else {
                    Label("Nur dieser Space", systemImage: "square.grid.2x2.fill")
                }
            }
            .font(.caption.weight(.semibold))
            .foregroundColor(.white.opacity(0.95))
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(space.accent.gradient)
        )
        .shadow(color: space.accent.tint.opacity(0.22), radius: 18, y: 10)
        .padding(.horizontal, 2)
    }
}

private struct SpaceTabStrip: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(appState.spaces) { space in
                    Button {
                        appState.selectSpace(space.id)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: space.icon)
                            Text(space.title)
                            Text("\(appState.threadCount(for: space.id))")
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 4)
                                .background(Color.white.opacity(space.id == appState.selectedSpaceID ? 0.18 : 1))
                                .clipShape(Capsule())
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(space.id == appState.selectedSpaceID ? .white : space.accent.tint)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
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
            .padding(.vertical, 4)
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
            ThreadAvatarView(thread: thread, size: 54)

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(thread.title)
                        .font(.body.weight(.semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    if appState.selectedSpaceID == ChatSpace.mainID, let sourceSpace {
                        SourceBadge(space: sourceSpace)
                    }

                    Spacer(minLength: 8)

                    Text(formattedTimestamp(thread.lastActivity))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(draftPreview.map { "Entwurf: \($0)" } ?? thread.lastMessagePreview)
                    .font(.subheadline)
                    .foregroundColor(draftPreview == nil ? .secondary : .orange)
                    .lineLimit(2)

                HStack(spacing: 10) {
                    Text(thread.subtitle)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if thread.isEncrypted {
                        Label("E2EE", systemImage: "lock.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.secondary)
                    }

                    if draftPreview != nil {
                        Label("Entwurf", systemImage: "square.and.pencil")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.orange)
                    }

                    if thread.isMuted {
                        Label("Stumm", systemImage: "bell.slash.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.secondary)
                    }

                    if appState.isPinnedInMain(thread.id) && appState.selectedSpaceID != ChatSpace.mainID {
                        Label("Im Main", systemImage: "star.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.orange)
                    }
                }
            }

            if thread.unreadCount > 0 {
                Text("\(thread.unreadCount)")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(thread.accent.tint)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 6)
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
        VStack(alignment: .leading, spacing: 10) {
            Label("Keine Chats sichtbar", systemImage: "tray")
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
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
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

    let threadID: String

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
                                  deleteAction: {
                                      Task {
                                          await appState.redactMessage(message.id, in: thread.id)
                                      }
                                  }
                              )
                          }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 28)
                }
                .background(Color(uiColor: .systemGroupedBackground))
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
                      ComposerBar(
                          draft: draftBinding,
                          accent: thread.accent,
                          sendAction: {
                              Task {
                                  await appState.sendMessage(appState.draft(for: thread.id), to: thread.id)
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                ThreadAvatarView(thread: thread, size: 52)

                VStack(alignment: .leading, spacing: 4) {
                    Text(thread.title)
                        .font(.headline)

                    Text(thread.subtitle)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
            }

            HStack(spacing: 10) {
                SourceBadge(space: space)
                Label("\(mediaCount) Medien", systemImage: "photo.on.rectangle")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
                Label("\(eventCount) Termine", systemImage: "calendar")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.secondary)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
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
    let deleteAction: () -> Void

    var body: some View {
        HStack {
            if message.isOutgoing {
                Spacer(minLength: 44)
            }

            VStack(alignment: .leading, spacing: 6) {
                if !message.isOutgoing {
                    Text(message.senderDisplayName)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.secondary)
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
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(message.isOutgoing ? accent.tint : Color(uiColor: .secondarySystemGroupedBackground))
                )
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
                                            .fill(Color(uiColor: message.isOutgoing ? .systemBlue.withAlphaComponent(0.18) : .secondarySystemBackground))
                                    )
                            }
                        }
                    }
                }

                  Text(message.timestamp.formatted(date: .omitted, time: .shortened))
                      .font(.caption2)
                      .foregroundColor(.secondary)
                      .frame(maxWidth: .infinity, alignment: message.isOutgoing ? .trailing : .leading)

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

private struct MessageBody: View {
    @EnvironmentObject private var appState: AppState
    let message: ChatMessage
    let isOutgoing: Bool
    let accent: SpaceAccent
    let attachmentAction: () -> Void

    var body: some View {
        switch message.kind {
        case .text:
            Text(message.body)
                .fixedSize(horizontal: false, vertical: true)
        case .voice, .image, .video, .file, .event:
            VStack(alignment: .leading, spacing: 10) {
                if let attachment = message.attachment {
                    if message.kind == .image {
                        InlineImageAttachment(attachment: attachment)
                    }
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
                    default:
                        Rectangle()
                            .fill(Color(uiColor: .tertiarySystemGroupedBackground))
                            .overlay(
                                Image(systemName: "photo")
                                    .font(.title2.weight(.semibold))
                                    .foregroundColor(.secondary)
                            )
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 188)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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

private struct ComposerBar: View {
    @Binding var draft: String
    let accent: SpaceAccent
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
                Image(systemName: "plus")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(accent.tint)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(accent.softTint))
            }

            HStack(spacing: 10) {
                TextField("Nachricht", text: $draft)
                    .textFieldStyle(.plain)

                Button {
                    sendAction()
                } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                        .frame(width: 34, height: 34)
                        .background(accent.tint)
                        .clipShape(Circle())
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Call Links", systemImage: "link.circle.fill")
                        .font(.headline)
                    Text("Plane Sprach- oder Videoanrufe aus Chats heraus und nutze den Calendar-Tab fuer saubere Termin-Syncs.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    if let activeCallRoomID = appState.activeCallRoomID,
                       let thread = appState.thread(withID: activeCallRoomID) {
                        Button("Aktiven Call mit \(thread.title) beenden") {
                            Task {
                                await appState.endActiveCall()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                    }
                }
                .padding(.vertical, 8)
            }

            Section("Letzte Calls") {
                ForEach(appState.calls) { call in
                    let thread = appState.thread(withID: call.threadID)

                    Button {
                        appState.openThread(call.threadID)
                    } label: {
                        HStack(spacing: 12) {
                            if let thread {
                                ThreadAvatarView(thread: thread, size: 44)
                            } else {
                                Circle()
                                    .fill(Color.blue.opacity(0.14))
                                    .frame(width: 44, height: 44)
                                    .overlay(
                                        Image(systemName: "phone.fill")
                                            .foregroundColor(.blue)
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
                                Text(call.kindLabel)
                                    .font(.caption.weight(.semibold))
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
        .listStyle(.insetGrouped)
        .navigationTitle("Calls")
    }
}

private struct CalendarView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Kalender-Hub", systemImage: "calendar.badge.clock")
                        .font(.headline)
                    Text("Verbinde Apple Calendar, Google und Outlook. Termine aus Chats landen hier und koennen spaeter in echte Provider synchronisiert werden.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Verbunden") {
                ForEach(appState.calendarProviders) { provider in
                    CalendarProviderRow(provider: provider)
                }
            }

            Section("Anstehende Termine") {
                if appState.upcomingEvents().isEmpty {
                    Text("Noch keine Termine geplant.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(appState.upcomingEvents()) { event in
                        Button {
                            appState.openThread(event.threadID)
                        } label: {
                            CalendarEventRow(event: event)
                        }
                        .buttonStyle(.plain)
                    }
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
                    guard let url,
                          let data = try? Data(contentsOf: url) else { return }
                    let fileName = url.lastPathComponent.isEmpty ? "video.mov" : url.lastPathComponent
                    let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "video/quicktime"
                    DispatchQueue.main.async {
                        self.onImport(data, mimeType, fileName)
                    }
                }
            } else {
                let typeIdentifier = UTType.image.identifier
                provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, _ in
                    guard let data else { return }
                    DispatchQueue.main.async {
                        self.onImport(data, "image/jpeg", "photo.jpg")
                    }
                }
            }
        }
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var showingRecoverySheet = false

    var body: some View {
        Form {
            Section("Appearance") {
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

            Section("Notifications") {
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

            Section("Calendar") {
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

                Button("Crypto vorbereiten") {
                    Task { await appState.prepareCryptoStack() }
                }

                Button("Recovery Key eingeben") {
                    showingRecoverySheet = true
                }

                Button("Dieses Geraet verifizieren") {
                    Task { await appState.requestCurrentDeviceVerification() }
                }
            }

            Section("Diagnose") {
                settingsValueRow(label: "Status", value: appState.diagnostics.statusNote)
                settingsValueRow(label: "User", value: appState.currentUserID ?? "Keine aktive Session")
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

private func formattedTimestamp(_ date: Date) -> String {
    if Calendar.current.isDateInToday(date) {
        return date.formatted(date: .omitted, time: .shortened)
    }

    if Calendar.current.isDateInYesterday(date) {
        return "Gestern"
    }

    return date.formatted(date: .abbreviated, time: .omitted)
}
