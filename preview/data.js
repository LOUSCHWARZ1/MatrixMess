window.MatrixMessPreviewData = {
    quickReactionEmoji: ["\uD83D\uDC4D", "\u2764\uFE0F", "\uD83D\uDE02", "\uD83D\uDD25"],
    appTabs: [
        { id: "chats", label: "Chats", shortLabel: "CH" },
        { id: "calls", label: "Calls", shortLabel: "CA" },
        { id: "calendar", label: "Calendar", shortLabel: "CL" },
        { id: "settings", label: "Settings", shortLabel: "SE" }
    ],
    mediaFilters: ["all", "image", "video", "file", "embed", "voice", "poll"],
    initialData: {
        spaces: [
            { id: "main", title: "Main", subtitle: "Important chats collected from every space", accent: "sunset", shortLabel: "M", helper: "Curated cross-space inbox" },
            { id: "matrix", title: "Matrix", subtitle: "Native Matrix chats and rooms", accent: "ocean", shortLabel: "MX", helper: "Only Matrix chats live here" },
            { id: "signal", title: "Signal", subtitle: "Bridge chats from Signal", accent: "teal", shortLabel: "SG", helper: "Signal bridge space" },
            { id: "instagram", title: "Instagram", subtitle: "Instagram DMs and groups", accent: "orchid", shortLabel: "IG", helper: "Creator and DM space" },
            { id: "whatsapp", title: "WhatsApp", subtitle: "Bridge chats from WhatsApp", accent: "emerald", shortLabel: "WA", helper: "Family and casual chats" },
            { id: "telegram", title: "Telegram", subtitle: "Channels, groups and polls", accent: "violet", shortLabel: "TG", helper: "Communities and power chats" },
            { id: "discord", title: "Discord", subtitle: "Servers and direct messages", accent: "indigo", shortLabel: "DC", helper: "Gaming and work communities" },
            { id: "slack", title: "Slack", subtitle: "Work channels and DMs", accent: "orchid", shortLabel: "SL", helper: "Product and internal work" },
            { id: "sms", title: "SMS", subtitle: "Traditional text messages", accent: "slate", shortLabel: "SMS", helper: "Carrier messages and OTPs" }
        ],
        threads: [
            {
                id: "signal-lena",
                title: "Lena",
                subtitle: "Signal Bridge",
                homeSpaceId: "signal",
                accent: "teal",
                avatar: "LE",
                lastMessage: "Can you send me the link later?",
                order: 98,
                unread: 1,
                muted: false,
                pinnedToMain: true,
                messages: [
                    {
                        id: "sl1",
                        type: "text",
                        author: "Lena",
                        body: "Can you send me the link later?",
                        time: "18:55",
                        outgoing: false,
                        reactions: [
                            { emoji: "\u2764\uFE0F", count: 1, mine: false }
                        ]
                    },
                    {
                        id: "sl2",
                        type: "voice",
                        author: "You",
                        time: "18:57",
                        outgoing: true,
                        duration: "0:18",
                        reactions: []
                    },
                    {
                        id: "sl3",
                        type: "image",
                        author: "Lena",
                        time: "18:59",
                        outgoing: false,
                        title: "Kitchen layout",
                        body: "Maybe this arrangement works better for the preview.",
                        reactions: [
                            { emoji: "\uD83D\uDC4D", count: 2, mine: false }
                        ]
                    }
                ]
            },
            {
                id: "matrix-family",
                title: "Family",
                subtitle: "Matrix Space",
                homeSpaceId: "matrix",
                accent: "ocean",
                avatar: "FA",
                lastMessage: "Dinner tomorrow at 19:00?",
                order: 90,
                unread: 2,
                muted: false,
                pinnedToMain: true,
                messages: [
                    {
                        id: "mf1",
                        type: "text",
                        author: "Mara",
                        body: "Dinner tomorrow at 19:00?",
                        time: "18:40",
                        outgoing: false,
                        reactions: []
                    },
                    {
                        id: "mf2",
                        type: "poll",
                        author: "You",
                        time: "18:43",
                        outgoing: true,
                        question: "What should we bring?",
                        options: [
                            { id: "o1", label: "Dessert", votes: 4 },
                            { id: "o2", label: "Salad", votes: 2 },
                            { id: "o3", label: "Drinks", votes: 3 }
                        ],
                        totalVotes: 9,
                        votedOptionId: null,
                        reactions: [
                            { emoji: "\uD83D\uDD25", count: 1, mine: false }
                        ]
                    }
                ]
            },
            {
                id: "instagram-design",
                title: "Design Collab",
                subtitle: "Instagram DM",
                homeSpaceId: "instagram",
                accent: "orchid",
                avatar: "DC",
                lastMessage: "The new story card looks more Apple-like now.",
                order: 84,
                unread: 0,
                muted: false,
                pinnedToMain: true,
                messages: [
                    {
                        id: "id1",
                        type: "embed",
                        author: "Mina",
                        time: "18:05",
                        outgoing: false,
                        source: "Instagram",
                        title: "Launch teaser reel",
                        description: "Inline reel style preview for product launch.",
                        link: "instagram.com/reel/mockup",
                        reactions: [
                            { emoji: "\u2764\uFE0F", count: 3, mine: false },
                            { emoji: "\uD83D\uDD25", count: 1, mine: false }
                        ]
                    },
                    {
                        id: "id2",
                        type: "video",
                        author: "You",
                        time: "18:12",
                        outgoing: true,
                        title: "Motion pass v2",
                        body: "Softer transitions and tighter spacing.",
                        reactions: []
                    }
                ]
            },
            {
                id: "whatsapp-home",
                title: "Home Crew",
                subtitle: "WhatsApp Bridge",
                homeSpaceId: "whatsapp",
                accent: "emerald",
                avatar: "HC",
                lastMessage: "I dropped the trip video in here.",
                order: 81,
                unread: 0,
                muted: false,
                pinnedToMain: false,
                messages: [
                    {
                        id: "wh1",
                        type: "video",
                        author: "Nils",
                        time: "17:58",
                        outgoing: false,
                        title: "Weekend trip recap",
                        body: "I dropped the trip video in here.",
                        reactions: [
                            { emoji: "\uD83D\uDE02", count: 2, mine: false }
                        ]
                    },
                    {
                        id: "wh2",
                        type: "file",
                        author: "You",
                        time: "18:02",
                        outgoing: true,
                        fileName: "packing-list.pdf",
                        fileMeta: "PDF / 1.8 MB",
                        reactions: []
                    }
                ]
            },
            {
                id: "telegram-makers",
                title: "Makers Board",
                subtitle: "Telegram Group",
                homeSpaceId: "telegram",
                accent: "violet",
                avatar: "MB",
                lastMessage: "Can we vote on the release window?",
                order: 79,
                unread: 3,
                muted: false,
                pinnedToMain: false,
                messages: [
                    {
                        id: "tg1",
                        type: "text",
                        author: "Avery",
                        time: "17:50",
                        outgoing: false,
                        body: "Telegram-style group tools are a good benchmark for folders, bots and polls.",
                        forwardedFrom: "Release Notes",
                        reactions: []
                    },
                    {
                        id: "tg2",
                        type: "poll",
                        author: "Avery",
                        time: "17:54",
                        outgoing: false,
                        question: "Can we vote on the release window?",
                        options: [
                            { id: "o1", label: "This Friday", votes: 6 },
                            { id: "o2", label: "Next Monday", votes: 8 }
                        ],
                        totalVotes: 14,
                        votedOptionId: "o2",
                        reactions: []
                    }
                ]
            },
            {
                id: "discord-shipping",
                title: "Shipping Room",
                subtitle: "Discord Server",
                homeSpaceId: "discord",
                accent: "indigo",
                avatar: "SR",
                lastMessage: "Deployment notes attached.",
                order: 73,
                unread: 0,
                muted: true,
                pinnedToMain: false,
                messages: [
                    {
                        id: "dc1",
                        type: "file",
                        author: "Rey",
                        time: "16:48",
                        outgoing: false,
                        fileName: "deployment-notes.md",
                        fileMeta: "Markdown / 54 KB",
                        reactions: [
                            { emoji: "\uD83D\uDC4D", count: 1, mine: false }
                        ]
                    }
                ]
            },
            {
                id: "slack-product",
                title: "Product Pod",
                subtitle: "Slack Channel",
                homeSpaceId: "slack",
                accent: "orchid",
                avatar: "PP",
                lastMessage: "Dropped the design system walkthrough.",
                order: 71,
                unread: 0,
                muted: false,
                pinnedToMain: false,
                messages: [
                    {
                        id: "sp1",
                        type: "embed",
                        author: "Iris",
                        time: "16:35",
                        outgoing: false,
                        source: "YouTube",
                        title: "Design system walkthrough",
                        description: "Inline video card for a long-form explainer.",
                        link: "youtube.com/watch?v=mock-preview",
                        reactions: [
                            { emoji: "\uD83D\uDC4D", count: 5, mine: false }
                        ]
                    }
                ]
            },
            {
                id: "sms-bank",
                title: "Bank Alerts",
                subtitle: "SMS",
                homeSpaceId: "sms",
                accent: "slate",
                avatar: "BK",
                lastMessage: "Your one time code is 482911.",
                order: 55,
                unread: 0,
                muted: false,
                pinnedToMain: false,
                messages: [
                    {
                        id: "sm1",
                        type: "text",
                        author: "Bank",
                        time: "Yesterday",
                        outgoing: false,
                        body: "Your one time code is 482911.",
                        reactions: []
                    }
                ]
            }
        ],
        calls: [
            { id: "c1", threadId: "signal-lena", type: "Voice", status: "Incoming", time: "Today 18:12", note: "Missed once, called back on Signal bridge" },
            { id: "c2", threadId: "instagram-design", type: "Video", status: "Outgoing", time: "Today 16:30", note: "Walkthrough of the campaign draft" },
            { id: "c3", threadId: "telegram-makers", type: "Call Link", status: "Upcoming", time: "Tomorrow 09:00", note: "Release planning room" }
        ],
        calendarProviders: [
            { id: "apple", title: "Apple Calendar", api: "EventKit", account: "iPhone local", connected: true, accent: "ocean" },
            { id: "google", title: "Google Calendar", api: "Google Calendar API", account: "lou@gmail.com", connected: true, accent: "emerald" },
            { id: "outlook", title: "Outlook", api: "Microsoft Graph", account: "Not connected", connected: false, accent: "indigo" }
        ],
        calendarEvents: [
            { id: "ev1", threadId: "matrix-family", title: "Family dinner", note: "Dinner at Mara's place.", start: "Tomorrow 19:00", sync: ["Apple Calendar", "Google Calendar"] },
            { id: "ev2", threadId: "instagram-design", title: "Campaign review", note: "Review reels and story cards.", start: "Wed 10:30", sync: ["Apple Calendar", "Outlook"] }
        ],
        settingsSections: [
            {
                title: "Organization",
                rows: [
                    { key: "chatFolders", label: "Chat folders", description: "Create filters for bridge spaces, unread chats and groups", kind: "action", actionLabel: "Manage" },
                    { key: "archiveMuted", label: "Keep muted chats archived", description: "Move low-priority conversations out of the main list", kind: "toggle" },
                    { key: "swipeAction", label: "Default swipe action", description: "Choose the main quick action for chat list rows", kind: "select", options: ["Pin", "Archive", "Mute"] },
                    { key: "mainSync", label: "Sync Main favorites", description: "Keep your curated Main space aligned across devices", kind: "toggle" }
                ]
            },
            {
                title: "Appearance",
                rows: [
                    { key: "compactMode", label: "Compact chat density", description: "Tighter rows and cards for heavy chat users", kind: "toggle" },
                    { key: "reduceMotion", label: "Reduce motion", description: "Lower animation intensity for calmer navigation", kind: "toggle" },
                    { key: "inlineAutoplay", label: "Inline media preview", description: "Show richer link and video cards directly in chats", kind: "toggle" },
                    { key: "showAvatars", label: "Show avatars in lists", description: "Keep chat and call lists visually easier to scan", kind: "toggle" }
                ]
            },
            {
                title: "Notifications",
                rows: [
                    { key: "notificationsEnabled", label: "Allow notifications", description: "Master notification permission for messages and calls", kind: "toggle" },
                    { key: "reactionNotifications", label: "Reaction notifications", description: "Alert on emoji reactions to your messages", kind: "toggle" },
                    { key: "mentionsOnly", label: "Mentions only in busy spaces", description: "Reduce noise in large bridged communities", kind: "toggle" },
                    { key: "quietHours", label: "Quiet hours", description: "Silence notifications overnight", kind: "select", options: ["Off", "22:00-07:00", "00:00-07:00"] },
                    { key: "messagePreview", label: "Notification previews", description: "Control how much message text is shown on the lock screen", kind: "select", options: ["Full", "Sender only", "Hidden"] },
                    { key: "badges", label: "App icon badges", description: "Show unread count on the home screen icon", kind: "toggle" }
                ]
            },
            {
                title: "Privacy and Security",
                rows: [
                    { key: "appLock", label: "App lock", description: "Require Face ID, Touch ID or passcode", kind: "toggle" },
                    { key: "chatLock", label: "Chat lock", description: "Hide and protect sensitive conversations", kind: "toggle" },
                    { key: "readReceipts", label: "Read receipts", description: "Control if others see that you read a message", kind: "toggle" },
                    { key: "typingIndicators", label: "Typing indicators", description: "Show live typing state in supported spaces", kind: "toggle" },
                    { key: "disappearingDefault", label: "Default disappearing timer", description: "Use a default lifetime for new chats", kind: "select", options: ["Off", "24h", "7d", "90d"] },
                    { key: "linkPreviewMode", label: "Link previews", description: "Control when link metadata is fetched", kind: "select", options: ["Always", "Wi-Fi only", "Never"] },
                    { key: "strictAccountMode", label: "Strict account mode", description: "Lock down calls, attachments and unknown senders", kind: "toggle" }
                ]
            },
            {
                title: "Media and Data",
                rows: [
                    { key: "autoDownload", label: "Auto-download media", description: "Choose when photos, videos and files download", kind: "select", options: ["Wi-Fi only", "Wi-Fi + Cellular", "Manual"] },
                    { key: "saveToPhotos", label: "Save media to Photos", description: "Store incoming photos and videos automatically", kind: "toggle" },
                    { key: "storageManager", label: "Manage storage", description: "Review large files and media categories", kind: "action", actionLabel: "Open" },
                    { key: "lowDataCalls", label: "Low data call mode", description: "Prefer lower bandwidth for voice and video calls", kind: "toggle" },
                    { key: "uploadQuality", label: "Media upload quality", description: "Balance file size, speed and detail when sending media", kind: "select", options: ["Original", "High", "Data saver"] },
                    { key: "autoPlayVideo", label: "Auto-play inline video", description: "Start short previews automatically inside chats", kind: "toggle" }
                ]
            },
            {
                title: "Devices and Accessibility",
                rows: [
                    { key: "linkedDevices", label: "Linked devices", description: "Review connected computers and tablets", kind: "action", actionLabel: "2 linked" },
                    { key: "dynamicType", label: "Text size", description: "Scale chat text for readability", kind: "select", options: ["Standard", "Large", "Extra Large"] },
                    { key: "highContrast", label: "High contrast", description: "Boost separation for text and controls", kind: "toggle" },
                    { key: "voiceTranscripts", label: "Voice note transcripts", description: "Generate readable text for audio notes", kind: "toggle" },
                    { key: "haptics", label: "Haptic feedback", description: "Add subtle taps to reactions, sends and navigation", kind: "toggle" }
                ]
            }
        ]
    }
};
