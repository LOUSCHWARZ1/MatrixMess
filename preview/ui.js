(function () {
    const { appTabs, quickReactionEmoji } = window.MatrixMessPreviewData;

    function renderChatsScreen(ctx) {
        const { state, elements, helpers } = ctx;
        const space = helpers.getSpace(state.selectedSpaceId);
        const visibleThreads = helpers.getVisibleThreads();

        elements.screenChats.classList.toggle("screen--hidden", state.currentTab !== "chats");
        elements.screenChats.classList.toggle("screen--active", state.currentTab === "chats");
        elements.screenChats.innerHTML = `
            <section class="top-shell">
                <div>
                    <p class="top-shell__eyebrow">Apple-style matrix messenger</p>
                    <h2>Chats</h2>
                    <p class="top-shell__copy">Spaces, bridges, hidden chat actions and a curated Main inbox.</p>
                </div>
                <button class="avatar-chip" type="button">LM</button>
            </section>

            <label class="search-shell" for="chatSearchInput">
                <span class="search-shell__label">Search</span>
                <input id="chatSearchInput" type="search" value="${helpers.escapeAttribute(state.search)}" placeholder="Search chats">
            </label>

            <section class="chip-row">
                ${state.spaces.map((spaceItem) => {
                    const count = helpers.countThreadsForSpace(spaceItem.id);
                    return `
                        <button class="space-tab accent-${spaceItem.accent}${spaceItem.id === state.selectedSpaceId ? " is-active" : ""}" data-space="${spaceItem.id}" type="button">
                            <span class="space-tab__dot accent-${spaceItem.accent}">${spaceItem.shortLabel}</span>
                            <span>${spaceItem.title}</span>
                            <span class="space-tab__count">${count}</span>
                        </button>
                    `;
                }).join("")}
            </section>

            <section class="space-summary accent-${space?.accent || "ocean"}">
                <h3 class="space-summary__title">${space?.title || "Space"}</h3>
                <p class="space-summary__copy">${space?.subtitle || ""}</p>
                <div class="space-summary__meta">
                    <span class="summary-pill">${visibleThreads.length} visible chats</span>
                    <span class="summary-pill">${space?.helper || ""}</span>
                </div>
            </section>

            <section class="thread-list">
                ${visibleThreads.length ? visibleThreads.map((thread) => renderThreadCard(ctx, thread)).join("") : `
                    <div class="empty-state">
                        ${state.selectedSpaceId === "main"
                            ? "Main is empty. Add chats from your bridge spaces to collect them here."
                            : "No chats match this space right now. Switch spaces or clear the search."}
                    </div>
                `}
            </section>
        `;
    }

    function renderThreadCard(ctx, thread) {
        const { state, helpers } = ctx;
        const sourceSpace = helpers.getSpace(thread.homeSpaceId);
        const sourceBadge = state.selectedSpaceId === "main" && sourceSpace
            ? `<span class="source-badge accent-${sourceSpace.accent}">${sourceSpace.title}</span>`
            : "";

        const mutedBadge = thread.muted ? `<span class="muted-badge">Muted</span>` : "";
        const pinBadge = thread.pinnedToMain && state.selectedSpaceId !== "main"
            ? `<span class="pin-state">In Main</span>`
            : "";
        const unread = state.preferences.badges && thread.unread > 0
            ? `<div class="thread-card__unread accent-${thread.accent}">${thread.unread}</div>`
            : "";
        const avatar = state.preferences.showAvatars
            ? `<div class="thread-card__avatar accent-${thread.accent}">${thread.avatar}</div>`
            : "";

        return `
            <article class="thread-card accent-${thread.accent}${thread.id === state.selectedThreadId ? " is-selected" : ""}${state.preferences.showAvatars ? "" : " thread-card--no-avatar"}" data-thread="${thread.id}">
                ${avatar}
                <div class="thread-card__body">
                    <div class="thread-card__topline">
                        <h3 class="thread-card__title">${thread.title}</h3>
                        ${sourceBadge}
                        <span class="thread-card__time">${helpers.formatOrder(thread.order)}</span>
                    </div>
                    <p class="thread-card__preview">${helpers.escapeHtml(thread.lastMessage)}</p>
                    <div class="thread-card__meta">
                        <span class="source-badge accent-${thread.accent}">${thread.subtitle}</span>
                        ${mutedBadge}
                        ${pinBadge}
                    </div>
                </div>
                <div class="thread-card__side">
                    ${unread}
                    <button class="thread-card__pin${thread.pinnedToMain ? " is-pinned" : ""}" data-pin-thread="${thread.id}" type="button">
                        ${thread.pinnedToMain ? "Remove Main" : "Add Main"}
                    </button>
                </div>
            </article>
        `;
    }

    function renderCallsScreen(ctx) {
        const { state, elements } = ctx;
        elements.screenCalls.classList.toggle("screen--hidden", state.currentTab !== "calls");
        elements.screenCalls.classList.toggle("screen--active", state.currentTab === "calls");
        elements.screenCalls.innerHTML = `
            <section class="top-shell">
                <div>
                    <p class="top-shell__eyebrow">Voice and video</p>
                    <h2>Calls</h2>
                    <p class="top-shell__copy">Call links, voice rooms and bridge-aware call history.</p>
                </div>
                <button class="avatar-chip" type="button">VC</button>
            </section>

            <section class="call-link-card">
                <p class="section-eyebrow">CALL LINKS</p>
                <h3>Create a reusable room link</h3>
                <p class="section-copy">Useful for Matrix rooms, private circles and bridge-friendly planning calls.</p>
                <div class="call-link-card__actions">
                    <button class="chip-button" data-call-action="Create call link" type="button">Create link</button>
                    <button class="chip-button" data-call-action="Schedule room call" type="button">Schedule</button>
                </div>
            </section>

            <section class="calls-list">
                ${state.calls.map((call) => renderCallCard(ctx, call)).join("")}
            </section>
        `;
    }

    function renderCallCard(ctx, call) {
        const { state, helpers } = ctx;
        const thread = helpers.getThread(call.threadId);
        const space = thread ? helpers.getSpace(thread.homeSpaceId) : null;
        const avatar = state.preferences.showAvatars
            ? `<div class="call-card__avatar accent-${thread?.accent || "ocean"}">${thread?.avatar || "CL"}</div>`
            : "";

        return `
            <article class="call-card accent-${thread?.accent || "ocean"}${state.preferences.showAvatars ? "" : " call-card--no-avatar"}" data-call-thread="${call.threadId}">
                ${avatar}
                <div class="call-card__body">
                    <div class="call-card__topline">
                        <h3 class="call-card__title">${thread?.title || "Call"}</h3>
                        <span class="call-card__time">${call.time}</span>
                    </div>
                    <p class="call-card__copy">${call.note}</p>
                    <div class="call-card__meta">
                        <span class="call-type">${call.type}</span>
                        <span class="source-badge accent-${space?.accent || "ocean"}">${space?.title || "Space"}</span>
                        <span class="muted-badge">${call.status}</span>
                    </div>
                </div>
                <div class="call-card__icon">Call</div>
            </article>
        `;
    }

    function renderCalendarScreen(ctx) {
        const { state, elements, helpers } = ctx;

        elements.screenCalendar.classList.toggle("screen--hidden", state.currentTab !== "calendar");
        elements.screenCalendar.classList.toggle("screen--active", state.currentTab === "calendar");
        elements.screenCalendar.innerHTML = `
            <section class="top-shell">
                <div>
                    <p class="top-shell__eyebrow">Calendar sync</p>
                    <h2>Calendar</h2>
                    <p class="top-shell__copy">Plan events from chats and mirror them into Apple Calendar, Google or Outlook.</p>
                </div>
                <button class="avatar-chip" type="button">CL</button>
            </section>

            <section class="calls-list">
                ${state.calendarProviders.map((provider) => `
                    <article class="call-card accent-${provider.accent}">
                        <div class="call-card__avatar accent-${provider.accent}">${provider.title.slice(0, 2).toUpperCase()}</div>
                        <div class="call-card__body">
                            <div class="call-card__topline">
                                <h3 class="call-card__title">${provider.title}</h3>
                                <span class="call-card__time">${provider.api}</span>
                            </div>
                            <p class="call-card__copy">${provider.account}</p>
                            <div class="call-card__meta">
                                <span class="source-badge accent-${provider.accent}">${provider.connected ? "Connected" : "Not connected"}</span>
                            </div>
                        </div>
                        <button class="chip-button" data-provider-toggle="${provider.id}" type="button">
                            ${provider.connected ? "Disconnect" : "Connect"}
                        </button>
                    </article>
                `).join("")}
            </section>

            <section class="settings-section">
                <h3>Upcoming events</h3>
                <div class="settings-stack">
                    ${state.calendarEvents.map((event) => renderCalendarEventCard(ctx, event)).join("")}
                </div>
            </section>
        `;
    }

    function renderCalendarEventCard(ctx, event) {
        const { helpers } = ctx;
        const thread = helpers.getThread(event.threadId);

        return `
            <button class="sheet-target" data-calendar-thread="${event.threadId}" type="button">
                <div>
                    <strong>${event.title}</strong>
                    <span>${event.note}</span>
                </div>
                <span class="source-badge accent-${thread?.accent || "ocean"}">${event.start}</span>
            </button>
        `;
    }

    function renderSettingsScreen(ctx) {
        const { state, elements } = ctx;
        elements.screenSettings.classList.toggle("screen--hidden", state.currentTab !== "settings");
        elements.screenSettings.classList.toggle("screen--active", state.currentTab === "settings");
        elements.screenSettings.innerHTML = `
            <section class="top-shell">
                <div>
                    <p class="top-shell__eyebrow">Messenger controls</p>
                    <h2>Settings</h2>
                    <p class="top-shell__copy">Grouped like modern messaging apps: appearance, notifications, privacy, data and accessibility.</p>
                </div>
                <button class="avatar-chip" type="button">ST</button>
            </section>

            <section class="settings-account">
                <p class="section-eyebrow">ACCOUNT</p>
                <h3>lou@matrixmess.local</h3>
                <p>Preview persona with bridge-heavy inbox, call links, media sharing and secure chat controls.</p>
                <div class="settings-account__meta">
                    <span class="summary-pill">${state.spaces.length} spaces connected</span>
                    <span class="summary-pill">${state.threads.filter((thread) => thread.pinnedToMain).length} Main favorites enabled</span>
                </div>
            </section>

            ${renderThemeSection(ctx)}
            ${state.settingsSections.map((section) => renderSettingsSection(ctx, section)).join("")}
            ${renderDiagnosticsSection(ctx)}
        `;
    }

    function renderThemeSection(ctx) {
        const { state, helpers } = ctx;
        return `
            <section class="settings-section">
                <h3>Theme</h3>
                <div class="settings-theme">
                    ${["system", "light", "dark"].map((theme) => `
                        <button class="theme-pill${state.preferences.theme === theme ? " is-active" : ""}" data-theme-option="${theme}" type="button">
                            ${helpers.capitalize(theme)}
                        </button>
                    `).join("")}
                </div>
                <p class="settings-note">Theme changes affect the whole preview instantly, including the detail view and tab bar.</p>
            </section>
        `;
    }

    function renderSettingsSection(ctx, section) {
        return `
            <section class="settings-section">
                <h3>${section.title}</h3>
                <div class="settings-stack">
                    ${section.rows.map((row) => renderSettingsRow(ctx, row)).join("")}
                </div>
            </section>
        `;
    }

    function renderDiagnosticsSection(ctx) {
        const { state } = ctx;
        const messageCount = state.threads.reduce((total, thread) => total + thread.messages.length, 0);
        const pinnedCount = state.threads.filter((thread) => thread.pinnedToMain).length;

        return `
            <section class="settings-section">
                <h3>Diagnostics</h3>
                <div class="settings-stack">
                    ${renderDiagnosticRow("Status", "Preview state is available immediately. The real iOS app now persists session, snapshot and sync state locally.")}
                    ${renderDiagnosticRow("Current tab", state.currentTab)}
                    ${renderDiagnosticRow("Spaces", String(state.spaces.length))}
                    ${renderDiagnosticRow("Threads", String(state.threads.length))}
                    ${renderDiagnosticRow("Messages", String(messageCount))}
                    ${renderDiagnosticRow("Main favorites", String(pinnedCount))}
                    ${renderDiagnosticRow("Drafts", "Native iOS app persists per-chat drafts via local snapshot storage.")}
                    ${renderDiagnosticRow("Matrix sync", "The iOS app now merges incremental /sync updates, handles leave rooms and runs a retrying sync loop.")}
                    ${renderDiagnosticRow("Media", "The iOS app now wires real Matrix upload/download services and local media cache paths.")}
                    ${renderDiagnosticRow("Push/APNs", "The iOS app now bridges APNs registration into Matrix pusher registration.")}
                    ${renderDiagnosticRow("Crypto", "The iOS app contains a Matrix Rust SDK crypto integration seam that still needs Xcode-side API verification.")}
                    ${renderDiagnosticRow("Theme", state.preferences.theme)}
                    ${renderDiagnosticRow("Preview storage", "URL hash state")}
                </div>
            </section>
        `;
    }

    function renderSettingsRow(ctx, row) {
        const { state, helpers } = ctx;
        const value = state.preferences[row.key];
        let control = "";

        if (row.kind === "toggle") {
            control = `<button class="settings-toggle${value ? " is-on" : ""}" data-toggle-key="${row.key}" type="button" aria-label="${row.label}"></button>`;
        } else if (row.kind === "select") {
            control = `<button class="ghost-button" data-select-key="${row.key}" type="button">${helpers.escapeHtml(value)}</button>`;
        } else if (row.kind === "action") {
            control = `<button class="ghost-button" data-action-key="${row.key}" type="button">${helpers.escapeHtml(row.actionLabel)}</button>`;
        }

        return `
            <div class="settings-row">
                <div class="settings-row__body">
                    <p class="settings-row__title">${row.label}</p>
                    <p class="settings-row__description">${row.description}</p>
                </div>
                ${control}
            </div>
        `;
    }

    function renderDiagnosticRow(label, value) {
        return `
            <div class="settings-row">
                <div class="settings-row__body">
                    <p class="settings-row__title">${label}</p>
                    <p class="settings-row__description">${value}</p>
                </div>
            </div>
        `;
    }

    function renderBottomNav(ctx) {
        const { state, elements } = ctx;
        elements.bottomNav.innerHTML = appTabs.map((tab) => `
            <button class="bottom-tab${state.currentTab === tab.id ? " is-active" : ""}" data-tab="${tab.id}" type="button">
                <span class="bottom-tab__icon">${tab.shortLabel}</span>
                <span class="bottom-tab__label">${tab.label}</span>
            </button>
        `).join("");
    }

    function renderDetail(ctx) {
        const { state, elements, helpers } = ctx;
        const thread = helpers.getThread(state.selectedThreadId);
        const shouldShow = state.currentTab === "chats" && thread;

        if (!shouldShow) {
            elements.detailPanel.classList.add("detail-panel--hidden");
            return;
        }

        const sourceSpace = helpers.getSpace(thread.homeSpaceId);
        elements.detailPanel.classList.remove("detail-panel--hidden");
        elements.closeDetail.textContent = `Back to ${state.selectedSpaceId === "main" ? "Main" : sourceSpace?.title || "Chats"}`;
        elements.detailHeaderMeta.innerHTML = `
            <h3>${thread.title}</h3>
            <p>${sourceSpace ? sourceSpace.title : thread.subtitle}</p>
        `;
        elements.detailPinButton.textContent = thread.pinnedToMain ? "In Main" : "Add Main";
        elements.detailPinButton.className = `ghost-button detail-pin${thread.pinnedToMain ? " is-pinned" : ""}`;

        elements.detailHero.className = `detail-hero accent-${thread.accent}`;
        elements.detailHero.innerHTML = `
            <div class="detail-hero__avatar accent-${thread.accent}">${thread.avatar}</div>
            <div class="detail-hero__body">
                <h4>${thread.title}</h4>
                <p>${thread.subtitle}</p>
                <div class="detail-hero__badges">
                    <span class="source-badge accent-${sourceSpace?.accent || thread.accent}">${sourceSpace ? sourceSpace.title : thread.subtitle}</span>
                    ${thread.muted ? `<span class="muted-badge">Muted</span>` : ""}
                    ${thread.pinnedToMain ? `<span class="pin-state">Visible in Main</span>` : ""}
                </div>
                <div class="detail-hero__actions">
                    <button class="chip-button" data-open-media="${thread.id}" type="button">Media</button>
                    <button class="chip-button" data-schedule-chat-event="${thread.id}" type="button">Plan</button>
                </div>
            </div>
        `;

        elements.messageList.innerHTML = thread.messages.map((message) => renderMessage(ctx, message, thread.accent)).join("");
    }

    function renderForwardSheet(ctx) {
        const { state, elements, helpers } = ctx;
        if (!state.forwardContext) {
            elements.forwardSheet.classList.add("sheet--hidden");
            return;
        }

        elements.forwardSheet.classList.remove("sheet--hidden");
        const sourceThreadId = state.forwardContext.threadId;
        const targets = state.threads.filter((thread) => thread.id !== sourceThreadId);
        elements.forwardTargets.innerHTML = targets.map((thread) => `
            <button class="sheet-target" data-forward-target="${thread.id}" type="button">
                <div>
                    <strong>${thread.title}</strong>
                    <span>${thread.subtitle}</span>
                </div>
                <span class="source-badge accent-${thread.accent}">${helpers.getSpace(thread.homeSpaceId)?.title || thread.homeSpaceId}</span>
            </button>
        `).join("");
    }

    function renderMessage(ctx, message, accent) {
        const { helpers } = ctx;
        const reactionPills = message.reactions?.length
            ? `<div class="message__reactions">${message.reactions.map((reaction) => `
                <button class="reaction-pill${reaction.mine ? " is-mine" : ""}" data-react="${reaction.emoji}" data-message-id="${message.id}" type="button">
                    ${reaction.emoji} ${reaction.count}
                </button>
            `).join("")}</div>`
            : "";

        const quickActions = state.expandedMessageId === message.id
            ? `
                <div class="message__actions">
                    ${quickReactionEmoji.map((emoji) => `
                        <button class="message-action" data-react="${emoji}" data-message-id="${message.id}" type="button">${emoji}</button>
                    `).join("")}
                    <button class="message-action" data-forward="${message.id}" type="button">Forward</button>
                    ${message.outgoing ? `<button class="message-action" data-edit="${message.id}" type="button">Edit</button>` : ""}
                    ${message.outgoing ? `<button class="message-action" data-delete="${message.id}" type="button">Delete</button>` : ""}
                </div>
            `
            : "";

        return `
            <article class="message${message.outgoing ? " message--outgoing" : ""}">
                <div class="message__bubble ${message.outgoing ? "message__bubble--outgoing" : "message__bubble--incoming"} accent-${accent}">
                    ${message.outgoing ? "" : `<p class="message__author">${message.author}</p>`}
                    ${renderMessageContent(ctx, message)}
                    ${reactionPills}
                    <div class="message__toolbar">
                        <button class="message-action" data-toggle-actions="${message.id}" type="button">
                            ${state.expandedMessageId === message.id ? "Hide actions" : "Actions"}
                        </button>
                    </div>
                    ${quickActions}
                    <span class="message__time">${message.time}</span>
                    ${message.edited ? `<span class="message__time">Edited</span>` : ""}
                </div>
            </article>
        `;
    }

    function renderMessageContent(ctx, message) {
        const { state, helpers } = ctx;
        const forwarded = message.forwardedFrom
            ? `<span class="source-badge">Forwarded from ${message.forwardedFrom}</span>`
            : "";

        if (message.type === "text") {
            return `${forwarded}<p class="message__text">${helpers.escapeHtml(message.body)}</p>`;
        }

        if (message.type === "voice") {
            return `
                ${forwarded}
                <div class="message__voice">
                    <div class="voice-bar"></div>
                    <div class="voice-bar__meta">
                        <span>Voice note</span>
                        <span>${message.duration}</span>
                    </div>
                </div>
            `;
        }

        if (message.type === "image" || message.type === "video") {
            return `
                ${forwarded}
                <div class="message__media">
                    <div class="message__mediaCover">${message.type === "video" ? "Video" : "Photo"}</div>
                    <p class="message__mediaCaption">${message.title}</p>
                    <p class="message__text">${helpers.escapeHtml(message.body || "")}</p>
                </div>
            `;
        }

        if (message.type === "file") {
            return `
                ${forwarded}
                <div class="message__file">
                    <div class="file-card">
                        <div class="file-card__icon">FILE</div>
                        <div>
                            <p class="file-card__name">${message.fileName}</p>
                            <div class="file-card__meta">
                                <span>${message.fileMeta}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (message.type === "event") {
            return `
                ${forwarded}
                <div class="message__file">
                    <div class="file-card">
                        <div class="file-card__icon">PLAN</div>
                        <div>
                            <p class="file-card__name">${message.title}</p>
                            <div class="file-card__meta">
                                <span>${(message.sync || []).join(", ") || "MatrixMess only"}</span>
                            </div>
                        </div>
                    </div>
                    <p class="message__text">${helpers.escapeHtml(message.body || "")}</p>
                </div>
            `;
        }

        if (message.type === "embed") {
            return `
                ${forwarded}
                <div class="message__embed">
                    <div class="embed-card__cover">${state.preferences.inlineAutoplay ? "Inline preview" : "Tap to play"}</div>
                    <div class="embed-card__meta">
                        <span>${message.source}</span>
                        <span>${message.link}</span>
                    </div>
                    <p class="embed-card__title">${message.title}</p>
                    <p class="embed-card__copy">${message.description}</p>
                </div>
            `;
        }

        if (message.type === "poll") {
            return `
                ${forwarded}
                <div class="message__poll">
                    <p class="poll-question">${message.question}</p>
                    ${message.options.map((option) => {
                        const percentage = Math.max(8, Math.round((option.votes / Math.max(message.totalVotes, 1)) * 100));
                        return `
                            <button class="poll-option${message.votedOptionId === option.id ? " is-selected" : ""}" data-poll-message="${message.id}" data-poll-option="${option.id}" type="button">
                                <div class="poll-option__row">
                                    <span>${option.label}</span>
                                    <span>${option.votes}</span>
                                </div>
                                <div class="poll-option__bar">
                                    <div class="poll-option__fill" style="width: ${percentage}%"></div>
                                </div>
                            </button>
                        `;
                    }).join("")}
                </div>
            `;
        }

        return `<p class="message__text">${helpers.escapeHtml(message.body || "")}</p>`;
    }

    window.MatrixMessPreviewUI = {
        renderChatsScreen,
        renderCallsScreen,
        renderCalendarScreen,
        renderSettingsScreen,
        renderBottomNav,
        renderDetail,
        renderForwardSheet
    };
})();
