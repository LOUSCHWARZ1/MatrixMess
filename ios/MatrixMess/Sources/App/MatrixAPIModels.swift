import Foundation

enum MatrixJSONValue: Codable, Hashable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case object([String: MatrixJSONValue])
    case array([MatrixJSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .int(value)
        } else if let value = try? container.decode(Double.self) {
            self = .double(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: MatrixJSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([MatrixJSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }

    var stringValue: String? {
        switch self {
        case .string(let value):
            return value
        case .int(let value):
            return String(value)
        case .double(let value):
            return String(value)
        default:
            return nil
        }
    }

    var boolValue: Bool? {
        switch self {
        case .bool(let value):
            return value
        default:
            return nil
        }
    }

    var objectValue: [String: MatrixJSONValue]? {
        switch self {
        case .object(let value):
            return value
        default:
            return nil
        }
    }

    var arrayValue: [MatrixJSONValue]? {
        switch self {
        case .array(let value):
            return value
        default:
            return nil
        }
    }
}

struct MatrixErrorResponse: Decodable {
    let errcode: String?
    let error: String?
}

struct MatrixLoginRequest: Encodable {
    struct Identifier: Encodable {
        let type = "m.id.user"
        let user: String
    }

    let type = "m.login.password"
    let identifier: Identifier
    let password: String
    let initialDeviceDisplayName: String?
}

struct MatrixLoginResponse: Decodable {
    let accessToken: String
    let userID: String
    let deviceID: String?
    let refreshToken: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case userID = "user_id"
        case deviceID = "device_id"
        case refreshToken = "refresh_token"
    }
}

struct MatrixWhoAmIResponse: Decodable {
    let userID: String

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
    }
}

struct MatrixSyncResponse: Decodable {
    struct Rooms: Decodable {
        let join: [String: JoinedRoom]?
        let invite: [String: InvitedRoom]?
        let leave: [String: LeftRoom]?
    }

    struct JoinedRoom: Decodable {
        struct Timeline: Decodable {
            let events: [MatrixTimelineEvent]
            let limited: Bool?
            let prevBatch: String?

            enum CodingKeys: String, CodingKey {
                case events
                case limited
                case prevBatch = "prev_batch"
            }
        }

        struct State: Decodable {
            let events: [MatrixTimelineEvent]
        }

        struct UnreadNotifications: Decodable {
            let notificationCount: Int?
            let highlightCount: Int?

            enum CodingKeys: String, CodingKey {
                case notificationCount = "notification_count"
                case highlightCount = "highlight_count"
            }
        }

        struct Ephemeral: Decodable {
            let events: [MatrixEphemeralEvent]
        }

        let timeline: Timeline?
        let state: State?
        let unreadNotifications: UnreadNotifications?
        let ephemeral: Ephemeral?

        enum CodingKeys: String, CodingKey {
            case timeline
            case state
            case unreadNotifications = "unread_notifications"
            case ephemeral
        }
    }

    struct InvitedRoom: Decodable {
        struct InviteState: Decodable {
            let events: [MatrixTimelineEvent]
        }

        let inviteState: InviteState?

        enum CodingKeys: String, CodingKey {
            case inviteState = "invite_state"
        }
    }

    struct LeftRoom: Decodable {}

    let nextBatch: String
    let rooms: Rooms?

    enum CodingKeys: String, CodingKey {
        case nextBatch = "next_batch"
        case rooms
    }
}

struct MatrixTimelineEvent: Decodable {
    let eventID: String?
    let type: String
    let sender: String?
    let roomID: String?
    let stateKey: String?
    let originServerTS: Int64?
    let redacts: String?
    let content: [String: MatrixJSONValue]?

    enum CodingKeys: String, CodingKey {
        case eventID = "event_id"
        case type
        case sender
        case roomID = "room_id"
        case stateKey = "state_key"
        case originServerTS = "origin_server_ts"
        case redacts
        case content
    }
}

struct MatrixEphemeralEvent: Decodable {
    let type: String
    let content: [String: MatrixJSONValue]?
}

struct MatrixTypingRequest: Encodable {
    let typing: Bool
    let timeout: Int
}

struct MatrixSendMessageRequest: Encodable {
    let msgtype = "m.text"
    let body: String
}

struct MatrixSendEventResponse: Decodable {
    let eventID: String

    enum CodingKeys: String, CodingKey {
        case eventID = "event_id"
    }
}

struct MatrixReactionRequest: Encodable {
    struct RelatesTo: Encodable {
        let relType = "m.annotation"
        let eventID: String
        let key: String

        enum CodingKeys: String, CodingKey {
            case relType = "rel_type"
            case eventID = "event_id"
            case key
        }
    }

    let mRelatesTo: RelatesTo

    enum CodingKeys: String, CodingKey {
        case mRelatesTo = "m.relates_to"
    }
}

struct MatrixEditMessageRequest: Encodable {
    struct NewContent: Encodable {
        let msgtype = "m.text"
        let body: String
    }

    struct RelatesTo: Encodable {
        let relType = "m.replace"
        let eventID: String

        enum CodingKeys: String, CodingKey {
            case relType = "rel_type"
            case eventID = "event_id"
        }
    }

    let msgtype = "m.text"
    let body: String
    let mNewContent: NewContent
    let mRelatesTo: RelatesTo

    enum CodingKeys: String, CodingKey {
        case msgtype
        case body
        case mNewContent = "m.new_content"
        case mRelatesTo = "m.relates_to"
    }
}

struct MatrixRedactionRequest: Encodable {
    let reason: String?
}

struct MatrixReadMarkersRequest: Encodable {
    let fullyRead: String
    let read: String

    enum CodingKeys: String, CodingKey {
        case fullyRead = "m.fully_read"
        case read = "m.read"
    }
}

struct MatrixSendMediaMessageRequest: Encodable {
    struct Info: Encodable {
        let mimetype: String
        let size: Int
    }

    let msgtype: String
    let body: String
    let filename: String
    let url: String
    let info: Info
}

struct MatrixWorkspace {
    let session: MatrixSession
    let spaces: [ChatSpace]
    let threadsByID: [String: ChatThread]
    let messagesByThreadID: [String: [ChatMessage]]
    let mainPinnedThreadIDs: [String]
    /// Maps room-IDs to the list of user-IDs currently typing in that room.
    let typingUsersByThreadID: [String: [String]]
}
