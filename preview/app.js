(function () {
    const { initialData } = window.MatrixMessPreviewData;
    const UI = window.MatrixMessPreviewUI;

    const state = createState();

    const elements = {
        screenChats: document.getElementById("screenChats"),
        screenCalls: document.getElementById("screenCalls"),
        screenCalendar: document.getElementById("screenCalendar"),
        screenSettings: document.getElementById("screenSettings"),
        bottomNav: document.getElementById("bottomNav"),
        detailPanel: document.getElementById("detailPanel"),
        detailHeaderMeta: document.getElementById("detailHeaderMeta"),
        detailPinButton: document.getElementById("detailPinButton"),
        detailHero: document.getElementById("detailHero"),
        messageList: document.getElementById("messageList"),
        closeDetail: document.getElementById("closeDetail"),
        composerTools: document.getElementById("composerTools"),
        toggleComposerTools: document.getElementById("toggleComposerTools"),
        composerForm: document.getElementById("composerForm"),
        composerInput: document.getElementById("composerInput"),
        resetPreview: document.getElementById("resetPreview"),
        forwardSheet: document.getElementById("forwardSheet"),
        closeForwardSheet: document.getElementById("closeForwardSheet"),
        forwardTargets: document.getElementById("forwardTargets"),
        toast: document.getElementById("toast")
    };

    const helpers = {
        getSpace,
        getThread,
        getVisibleThreads,
        countThreadsForSpace,
        getMediaItems,
        formatOrder,
        escapeHtml,
        escapeAttribute,
        capitalize
    };

    bindEvents();
    initialize();

    function createState() {
        return {
            spaces: structuredClone(initialData.spaces),
            threads: structuredClone(initialData.threads),
            calls: structuredClone(initialData.calls),
            calendarProviders: structuredClone(initialData.calendarProviders),
            calendarEvents: structuredClone(initialData.calendarEvents),
            settingsSections: structuredClone(initialData.settingsSections),
            currentTab: "chats",
            selectedSpaceId: "main",
            selectedThreadId: null,
            search: "",
            mediaFilter: "all",
            forwardContext: null,
            expandedMessageId: null,
            composerToolsExpanded: false,
            toastTimer: null,
            preferences: {
                theme: "light",
                archiveMuted: false,
                swipeAction: "Pin",
                mainSync: true,
                compactMode: false,
                reduceMotion: false,
                showAvatars: true,
                inlineAutoplay: true,
                notificationsEnabled: true,
                reactionNotifications: true,
                mentionsOnly: false,
                quietHours: "22:00-07:00",
                messagePreview: "Full",
                badges: true,
                appLock: true,
                chatLock: true,
                readReceipts: true,
                typingIndicators: true,
                disappearingDefault: "7d",
                linkPreviewMode: "Wi-Fi only",
                strictAccountMode: false,
                autoDownload: "Wi-Fi only",
                saveToPhotos: false,
                storageManager: "Open",
                lowDataCalls: false,
                uploadQuality: "High",
                autoPlayVideo: true,
                linkedDevices: "2 linked",
                dynamicType: "Large",
                highContrast: false,
                voiceTranscripts: true,
                haptics: true
            }
        };
    }

    function bindEvents() {
        elements.screenChats.addEventListener("click", handleChatsClick);
        elements.screenChats.addEventListener("input", handleChatsInput);
        elements.screenCalls.addEventListener("click", handleCallsClick);
        elements.screenCalendar.addEventListener("click", handleCalendarClick);
        elements.screenSettings.addEventListener("click", handleSettingsClick);
        elements.bottomNav.addEventListener("click", handleBottomNavClick);
        elements.detailPanel.addEventListener("click", handleDetailClick);
        elements.closeDetail.addEventListener("click", handleCloseDetail);
        elements.detailPinButton.addEventListener("click", handleDetailPin);
        elements.toggleComposerTools.addEventListener("click", handleComposerToolsToggle);
        elements.composerForm.addEventListener("submit", handleComposerSubmit);
        elements.resetPreview.addEventListener("click", handleReset);
        elements.closeForwardSheet.addEventListener("click", closeForwardSheetUI);
        elements.forwardSheet.addEventListener("click", handleForwardSheetClick);
        window.addEventListener("popstate", handlePopState);
    }

    function initialize() {
        const restored = parseHashState();
        if (restored) {
            hydrateFromSnapshot(restored);
        }

        applyPreferences();
        history.replaceState(snapshotState(), "", buildHash(snapshotState()));
        render();
    }

    function render() {
        syncSelection();
        const ctx = { state, elements, helpers };
        UI.renderChatsScreen(ctx);
        UI.renderCallsScreen(ctx);
        UI.renderCalendarScreen(ctx);
        UI.renderSettingsScreen(ctx);
        UI.renderBottomNav(ctx);
        UI.renderDetail(ctx);
        UI.renderForwardSheet(ctx);
        elements.composerTools.classList.toggle(
            "composer-tools--hidden",
            !state.composerToolsExpanded || state.currentTab !== "chats" || !state.selectedThreadId
        );
        elements.toggleComposerTools.textContent = state.composerToolsExpanded ? "x" : "+";
    }

    function renderAndStore(mode = "replace") {
        render();
        const snapshot = snapshotState();
        if (mode === "push") {
            history.pushState(snapshot, "", buildHash(snapshot));
        } else {
            history.replaceState(snapshot, "", buildHash(snapshot));
        }
    }

    function handleChatsInput(event) {
        if (event.target.id !== "chatSearchInput") {
            return;
        }

        state.search = event.target.value;
        syncSelection();
        renderAndStore("replace");
    }

    function handleChatsClick(event) {
        const spaceButton = event.target.closest("[data-space]");
        if (spaceButton) {
            if (state.selectedSpaceId === spaceButton.dataset.space) {
                return;
            }
            state.selectedSpaceId = spaceButton.dataset.space;
            syncSelection();
            renderAndStore("push");
            return;
        }

        const pinButton = event.target.closest("[data-pin-thread]");
        if (pinButton) {
            event.stopPropagation();
            toggleMainPin(pinButton.dataset.pinThread);
            return;
        }

        const threadCard = event.target.closest("[data-thread]");
        if (threadCard) {
            openThread(threadCard.dataset.thread);
        }
    }

    function handleCallsClick(event) {
        const callCard = event.target.closest("[data-call-thread]");
        if (callCard) {
            openThread(callCard.dataset.callThread, "push", getThread(callCard.dataset.callThread)?.homeSpaceId);
            return;
        }

        const action = event.target.closest("[data-call-action]");
        if (action) {
            showToast(`${action.dataset.callAction} preview opened`);
        }
    }

    function handleCalendarClick(event) {
        const providerButton = event.target.closest("[data-provider-toggle]");
        if (providerButton) {
            toggleCalendarProvider(providerButton.dataset.providerToggle);
            return;
        }

        const eventButton = event.target.closest("[data-calendar-thread]");
        if (eventButton) {
            openThread(eventButton.dataset.calendarThread, "push", getThread(eventButton.dataset.calendarThread)?.homeSpaceId);
        }
    }

    function handleSettingsClick(event) {
        const themePill = event.target.closest("[data-theme-option]");
        if (themePill) {
            state.preferences.theme = themePill.dataset.themeOption;
            applyPreferences();
            renderAndStore("replace");
            return;
        }

        const toggle = event.target.closest("[data-toggle-key]");
        if (toggle) {
            const key = toggle.dataset.toggleKey;
            state.preferences[key] = !state.preferences[key];
            applyPreferences();
            renderAndStore("replace");
            return;
        }

        const select = event.target.closest("[data-select-key]");
        if (select) {
            cycleSetting(select.dataset.selectKey);
            applyPreferences();
            renderAndStore("replace");
            return;
        }

        const action = event.target.closest("[data-action-key]");
        if (!action) {
            return;
        }

        const row = findSettingRow(action.dataset.actionKey);
        if (row) {
            showToast(`${row.label} panel would open here`);
        }
    }

    function handleBottomNavClick(event) {
        const tabButton = event.target.closest("[data-tab]");
        if (!tabButton) {
            return;
        }

        if (state.currentTab === tabButton.dataset.tab) {
            return;
        }

        state.currentTab = tabButton.dataset.tab;
        state.expandedMessageId = null;
        state.composerToolsExpanded = false;
        renderAndStore("push");
    }

    function handleComposerToolsToggle() {
        state.composerToolsExpanded = !state.composerToolsExpanded;
        renderAndStore("replace");
    }

    function handleCloseDetail() {
        if (state.forwardContext) {
            closeForwardSheetUI();
            return;
        }

        if (history.state && (history.state.thread || history.state.tab !== "chats")) {
            history.back();
            return;
        }

        state.expandedMessageId = null;
        state.composerToolsExpanded = false;
        state.selectedThreadId = null;
        renderAndStore("replace");
    }

    function handleDetailPin() {
        if (state.selectedThreadId) {
            toggleMainPin(state.selectedThreadId);
        }
    }

    function handleComposerSubmit(event) {
        event.preventDefault();
        const thread = getThread(state.selectedThreadId);
        const value = elements.composerInput.value.trim();

        if (!thread || !value) {
            return;
        }

        const message = {
            id: createId("msg"),
            type: "text",
            author: "You",
            body: value,
            time: "Now",
            outgoing: true,
            reactions: []
        };

        thread.messages.push(message);
        updateThreadPreview(thread, message);
        elements.composerInput.value = "";
        renderAndStore("replace");
    }

    function handleDetailClick(event) {
        const actionToggle = event.target.closest("[data-toggle-actions]");
        if (actionToggle) {
            state.expandedMessageId = state.expandedMessageId === actionToggle.dataset.toggleActions
                ? null
                : actionToggle.dataset.toggleActions;
            renderAndStore("replace");
            return;
        }

        const attachButton = event.target.closest("[data-attach]");
        if (attachButton) {
            appendAttachmentMessage(attachButton.dataset.attach);
            return;
        }

        const reactionButton = event.target.closest("[data-react]");
        if (reactionButton) {
            toggleReaction(reactionButton.dataset.messageId, reactionButton.dataset.react);
            return;
        }

        const forwardButton = event.target.closest("[data-forward]");
        if (forwardButton) {
            state.forwardContext = {
                threadId: state.selectedThreadId,
                messageId: forwardButton.dataset.forward
            };
            render();
            return;
        }

        const editButton = event.target.closest("[data-edit]");
        if (editButton) {
            editMessage(editButton.dataset.edit);
            return;
        }

        const deleteButton = event.target.closest("[data-delete]");
        if (deleteButton) {
            deleteMessage(deleteButton.dataset.delete);
            return;
        }

        const pollOption = event.target.closest("[data-poll-message]");
        if (pollOption) {
            voteInPoll(pollOption.dataset.pollMessage, pollOption.dataset.pollOption);
            return;
        }

        const mediaButton = event.target.closest("[data-open-media]");
        if (mediaButton) {
            showToast("Shared media would open from this chat");
            return;
        }

        const scheduleButton = event.target.closest("[data-schedule-chat-event]");
        if (scheduleButton) {
            scheduleQuickEvent(scheduleButton.dataset.scheduleChatEvent || state.selectedThreadId);
        }
    }

    function handleForwardSheetClick(event) {
        if (event.target.classList.contains("sheet__backdrop")) {
            closeForwardSheetUI();
            return;
        }

        const target = event.target.closest("[data-forward-target]");
        if (!target || !state.forwardContext) {
            return;
        }

        forwardMessageToThread(state.forwardContext.messageId, target.dataset.forwardTarget);
    }

    function handlePopState(event) {
        const snapshot = event.state || parseHashState();
        if (!snapshot) {
            return;
        }

        hydrateFromSnapshot(snapshot);
        render();
    }

    function hydrateFromSnapshot(snapshot) {
        state.currentTab = snapshot.tab || "chats";
        state.selectedSpaceId = snapshot.space || "main";
        state.selectedThreadId = snapshot.thread || null;
        state.search = snapshot.search || "";
        state.mediaFilter = snapshot.filter || "all";
        state.preferences.theme = snapshot.theme || "light";
        state.preferences.compactMode = snapshot.compact === "1";
        state.preferences.reduceMotion = snapshot.motion === "1";
        state.preferences.inlineAutoplay = snapshot.autoplay !== "0";
        state.forwardContext = null;
        state.expandedMessageId = null;
        state.composerToolsExpanded = false;
        applyPreferences();
        syncSelection();
    }

    function applyPreferences() {
        document.documentElement.dataset.theme = resolveTheme();
        document.body.classList.toggle("compact-mode", state.preferences.compactMode);
        document.body.classList.toggle("reduce-motion", state.preferences.reduceMotion);
    }

    function resolveTheme() {
        if (state.preferences.theme === "system") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }

        return state.preferences.theme;
    }

    function snapshotState() {
        return {
            tab: state.currentTab,
            space: state.selectedSpaceId,
            thread: state.selectedThreadId,
            search: state.search,
            filter: state.mediaFilter,
            theme: state.preferences.theme,
            compact: state.preferences.compactMode ? "1" : "0",
            motion: state.preferences.reduceMotion ? "1" : "0",
            autoplay: state.preferences.inlineAutoplay ? "1" : "0"
        };
    }

    function buildHash(snapshot) {
        const params = new URLSearchParams();
        Object.entries(snapshot).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                params.set(key, value);
            }
        });
        return `#${params.toString()}`;
    }

    function parseHashState() {
        if (!window.location.hash.startsWith("#")) {
            return null;
        }

        const params = new URLSearchParams(window.location.hash.slice(1));
        if (!params.toString()) {
            return null;
        }

        return {
            tab: params.get("tab"),
            space: params.get("space"),
            thread: params.get("thread"),
            search: params.get("search"),
            filter: params.get("filter"),
            theme: params.get("theme"),
            compact: params.get("compact"),
            motion: params.get("motion"),
            autoplay: params.get("autoplay")
        };
    }

    function syncSelection() {
        if (state.currentTab !== "chats" || state.selectedThreadId === null) {
            return;
        }

        const visible = getVisibleThreads();
        const stillVisible = visible.some((thread) => thread.id === state.selectedThreadId);
        if (!stillVisible) {
            state.selectedThreadId = null;
        }
    }

    function getVisibleThreads() {
        const query = state.search.trim().toLowerCase();
        return state.threads
            .filter((thread) => state.selectedSpaceId === "main" ? thread.pinnedToMain : thread.homeSpaceId === state.selectedSpaceId)
            .filter((thread) => {
                if (!query) {
                    return true;
                }

                const haystack = [thread.title, thread.subtitle, thread.lastMessage, getSpace(thread.homeSpaceId)?.title || ""].join(" ").toLowerCase();
                return haystack.includes(query);
            })
            .sort((left, right) => right.order - left.order);
    }

    function getMediaItems() {
        const items = [];
        state.threads.forEach((thread) => {
            thread.messages.forEach((message) => {
                if (!["image", "video", "file", "embed", "voice", "poll"].includes(message.type)) {
                    return;
                }

                if (state.mediaFilter !== "all" && message.type !== state.mediaFilter) {
                    return;
                }

                items.push({
                    id: message.id,
                    threadId: thread.id,
                    accent: thread.accent,
                    badge: message.type === "embed" ? "LINK" : message.type.toUpperCase().slice(0, 5),
                    title: message.title || message.fileName || message.question || previewLabelForMessage(message),
                    meta: `${thread.title} / ${getSpace(thread.homeSpaceId)?.title || thread.homeSpaceId}`
                });
            });
        });
        return items;
    }

    function countThreadsForSpace(spaceId) {
        return state.threads.filter((thread) => spaceId === "main" ? thread.pinnedToMain : thread.homeSpaceId === spaceId).length;
    }

    function toggleCalendarProvider(providerId) {
        const provider = state.calendarProviders.find((entry) => entry.id === providerId);
        if (!provider) {
            return;
        }

        provider.connected = !provider.connected;
        if (provider.connected && provider.id === "outlook") {
            provider.account = "lou@outlook.com";
        } else if (!provider.connected) {
            provider.account = "Not connected";
        }

        renderAndStore("replace");
        showToast(provider.connected ? `${provider.title} connected` : `${provider.title} disconnected`);
    }

    function scheduleQuickEvent(threadId) {
        const thread = getThread(threadId);
        if (!thread) {
            return;
        }

        const connectedProviders = state.calendarProviders.filter((provider) => provider.connected).map((provider) => provider.title);
        const event = {
            id: createId("event"),
            threadId: thread.id,
            title: `${thread.title} sync`,
            note: "Planned directly from the chat preview.",
            start: "Today 19:00",
            sync: connectedProviders.length ? connectedProviders : ["MatrixMess only"]
        };

        state.calendarEvents.unshift(event);
        thread.messages.push({
            id: createId("msg"),
            type: "event",
            author: "You",
            time: "Now",
            outgoing: true,
            title: event.title,
            body: event.note,
            sync: event.sync,
            reactions: []
        });
        updateThreadPreview(thread, thread.messages[thread.messages.length - 1]);
        state.currentTab = "calendar";
        state.composerToolsExpanded = false;
        renderAndStore("push");
        showToast(`Event planned for ${thread.title}`);
    }

    function toggleMainPin(threadId) {
        const thread = getThread(threadId);
        if (!thread) {
            return;
        }

        thread.pinnedToMain = !thread.pinnedToMain;
        if (state.selectedSpaceId === "main" && !thread.pinnedToMain && state.selectedThreadId === threadId) {
            syncSelection();
        }

        renderAndStore("replace");
        showToast(thread.pinnedToMain ? `${thread.title} added to Main` : `${thread.title} removed from Main`);
    }

    function openThread(threadId, mode = "push", spaceId = state.selectedSpaceId) {
        const thread = getThread(threadId);
        if (!thread) {
            return;
        }

        const nextSpaceId = spaceId || thread.homeSpaceId;
        const isSameThread =
            state.currentTab === "chats" &&
            state.selectedThreadId === threadId &&
            state.selectedSpaceId === nextSpaceId;

        if (isSameThread) {
            return;
        }

        state.currentTab = "chats";
        state.selectedSpaceId = nextSpaceId;
        state.selectedThreadId = threadId;
        state.expandedMessageId = null;
        state.composerToolsExpanded = false;
        thread.unread = 0;
        renderAndStore(mode);
    }

    function appendAttachmentMessage(type) {
        const thread = getThread(state.selectedThreadId);
        if (!thread) {
            return;
        }

        const message = createAttachmentMessage(type);
        thread.messages.push(message);
        updateThreadPreview(thread, message);
        renderAndStore("replace");
        showToast(`${capitalize(type)} added to ${thread.title}`);
    }

    function createAttachmentMessage(type) {
        if (type === "voice") {
            return { id: createId("msg"), type: "voice", author: "You", time: "Now", outgoing: true, duration: "0:21", reactions: [] };
        }
        if (type === "image") {
            return { id: createId("msg"), type: "image", author: "You", time: "Now", outgoing: true, title: "Preview snapshot", body: "Shared a quick image mockup from the current flow.", reactions: [] };
        }
        if (type === "video") {
            return { id: createId("msg"), type: "video", author: "You", time: "Now", outgoing: true, title: "Walkthrough clip", body: "Inline video card with playback controls would appear here.", reactions: [] };
        }
        if (type === "file") {
            return { id: createId("msg"), type: "file", author: "You", time: "Now", outgoing: true, fileName: "matrixmess-roadmap.pdf", fileMeta: "PDF / 2.4 MB", reactions: [] };
        }
        if (type === "poll") {
            return {
                id: createId("msg"),
                type: "poll",
                author: "You",
                time: "Now",
                outgoing: true,
                question: "Which feature should land next?",
                options: [
                    { id: "o1", label: "Chat folders", votes: 5 },
                    { id: "o2", label: "Voice transcripts", votes: 3 },
                    { id: "o3", label: "Better embeds", votes: 4 }
                ],
                totalVotes: 12,
                votedOptionId: null,
                reactions: []
            };
        }
        return { id: createId("msg"), type: "embed", author: "You", time: "Now", outgoing: true, source: "YouTube", title: "UI review session", description: "Embedded video card for walkthrough content from external apps.", link: "youtube.com/watch?v=matrixmess-preview", reactions: [] };
    }

    function toggleReaction(messageId, emoji) {
        const message = findMessageById(messageId);
        if (!message) {
            return;
        }

        message.reactions ||= [];
        const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
        if (!existing) {
            message.reactions.push({ emoji, count: 1, mine: true });
        } else if (existing.mine) {
            existing.count = Math.max(0, existing.count - 1);
            existing.mine = false;
        } else {
            existing.count += 1;
            existing.mine = true;
        }

        message.reactions = message.reactions.filter((reaction) => reaction.count > 0);
        renderAndStore("replace");
    }

    function voteInPoll(messageId, optionId) {
        const message = findMessageById(messageId);
        if (!message || message.type !== "poll") {
            return;
        }

        if (message.votedOptionId) {
            const previous = message.options.find((option) => option.id === message.votedOptionId);
            if (previous) {
                previous.votes = Math.max(0, previous.votes - 1);
            }
        } else {
            message.totalVotes += 1;
        }

        const next = message.options.find((option) => option.id === optionId);
        if (next) {
            next.votes += 1;
            message.votedOptionId = optionId;
        }

        renderAndStore("replace");
    }

    function forwardMessageToThread(messageId, targetThreadId) {
        const sourceMessage = findMessageById(messageId);
        const targetThread = getThread(targetThreadId);
        const sourceThread = getThread(state.forwardContext?.threadId);
        if (!sourceMessage || !targetThread || !sourceThread) {
            return;
        }

        const forwarded = structuredClone(sourceMessage);
        forwarded.id = createId("msg");
        forwarded.author = "You";
        forwarded.time = "Now";
        forwarded.outgoing = true;
        forwarded.forwardedFrom = sourceThread.title;
        forwarded.reactions = [];
        forwarded.edited = false;
        targetThread.messages.push(forwarded);
        updateThreadPreview(targetThread, forwarded);
        closeForwardSheetUI();
        renderAndStore("replace");
        showToast(`Forwarded to ${targetThread.title}`);
    }

    function closeForwardSheetUI() {
        state.forwardContext = null;
        render();
    }

    function cycleSetting(key) {
        const section = state.settingsSections.find((entry) => entry.rows.some((row) => row.key === key));
        const row = section?.rows.find((entry) => entry.key === key);
        if (!row?.options) {
            return;
        }

        const currentIndex = row.options.indexOf(state.preferences[key]);
        state.preferences[key] = row.options[(currentIndex + 1) % row.options.length];
    }

    function updateThreadPreview(thread, message) {
        thread.lastMessage = previewLabelForMessage(message);
        thread.order = Date.now();
        thread.unread = 0;
    }

    function previewLabelForMessage(message) {
        if (message.type === "text") return message.body;
        if (message.type === "voice") return "Voice note";
        if (message.type === "image") return message.title || "Photo";
        if (message.type === "video") return message.title || "Video";
        if (message.type === "file") return message.fileName || "File";
        if (message.type === "event") return message.title || "Event";
        if (message.type === "poll") return message.question || "Poll";
        if (message.type === "embed") return message.title || "Link preview";
        return "Message";
    }

    function editMessage(messageId) {
        const message = findMessageById(messageId);
        const thread = getThread(state.selectedThreadId);
        if (!message || !thread) {
            return;
        }

        const nextText = window.prompt("Edit message", message.body || "");
        if (nextText === null) {
            return;
        }

        const trimmed = nextText.trim();
        if (!trimmed) {
            return;
        }

        message.body = trimmed;
        message.edited = true;
        updateThreadPreview(thread, message);
        renderAndStore("replace");
        showToast("Message edited");
    }

    function deleteMessage(messageId) {
        const message = findMessageById(messageId);
        const thread = getThread(state.selectedThreadId);
        if (!message || !thread) {
            return;
        }

        if (!window.confirm("Delete this message?")) {
            return;
        }

        message.type = "text";
        message.body = "Message removed.";
        delete message.title;
        delete message.description;
        delete message.fileName;
        delete message.fileMeta;
        delete message.duration;
        delete message.link;
        delete message.source;
        delete message.sync;
        delete message.options;
        delete message.question;
        message.reactions = [];
        message.edited = false;
        updateThreadPreview(thread, message);
        renderAndStore("replace");
        showToast("Message deleted");
    }

    function getThread(threadId) {
        return state.threads.find((thread) => thread.id === threadId);
    }

    function getSpace(spaceId) {
        return state.spaces.find((space) => space.id === spaceId);
    }

    function findSettingRow(key) {
        for (const section of state.settingsSections) {
            const row = section.rows.find((entry) => entry.key === key);
            if (row) {
                return row;
            }
        }

        return null;
    }

    function findMessageById(messageId) {
        for (const thread of state.threads) {
            const message = thread.messages.find((entry) => entry.id === messageId);
            if (message) {
                return message;
            }
        }
        return null;
    }

    function handleReset() {
        const fresh = createState();
        Object.assign(state, fresh);
        applyPreferences();
        renderAndStore("replace");
    }

    function showToast(text) {
        clearTimeout(state.toastTimer);
        elements.toast.textContent = text;
        elements.toast.classList.remove("toast--hidden");
        state.toastTimer = setTimeout(() => {
            elements.toast.classList.add("toast--hidden");
        }, 1800);
    }

    function formatOrder(order) {
        if (order > 1000000000000) return "Now";
        if (order >= 95) return "2m";
        if (order >= 90) return "9m";
        if (order >= 80) return "24m";
        if (order >= 70) return "1h";
        if (order >= 50) return "Yesterday";
        return "Mon";
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }

    function escapeAttribute(value) {
        return escapeHtml(value).replaceAll("`", "&#96;");
    }

    function createId(prefix) {
        return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    function capitalize(value) {
        return value.charAt(0).toUpperCase() + value.slice(1);
    }
})();
