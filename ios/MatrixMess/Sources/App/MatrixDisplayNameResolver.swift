import Foundation

enum MatrixDisplayNameResolver {
    private static let bridgePrefixes = [
        "signal_",
        "whatsapp_",
        "instagram_",
        "telegram_",
        "messenger_",
        "discord_",
        "slack_",
        "imessage_",
        "meta_",
        "gmessages_",
        "sms_"
    ]

    static func sanitizedDisplayName(_ raw: String?, fallbackUserID: String? = nil) -> String {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !trimmed.isEmpty, !looksLikeRawMatrixIdentifier(trimmed) {
            return collapseWhitespace(trimmed)
        }

        if let fallbackUserID {
            let friendly = userFacingName(from: fallbackUserID)
            if !friendly.isEmpty {
                return friendly
            }
        }

        if !trimmed.isEmpty {
            return userFacingName(from: trimmed)
        }

        return "Unbekannt"
    }

    static func userFacingName(from identifier: String) -> String {
        let trimmed = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("!") {
            return "Unbenannter Chat"
        }

        let local = matrixLocalpart(from: identifier)
        guard !local.isEmpty else {
            return collapseWhitespace(identifier)
        }

        for prefix in bridgePrefixes where local.lowercased().hasPrefix(prefix) {
            let suffix = String(local.dropFirst(prefix.count))
            if suffix.allSatisfy(\.isNumber) {
                return "+\(suffix)"
            }
            let decodedSuffix = suffix.replacingOccurrences(of: "_", with: " ")
            return collapseWhitespace(decodedSuffix)
        }

        let decoded = local
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
        return collapseWhitespace(decoded)
    }

    static func extractNameFromTopic(_ topic: String) -> String? {
        let trimmedTopic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTopic.isEmpty else { return nil }

        let patterns = [
            "private chat with ",
            "chat with ",
            "dm with ",
            "direktnachricht mit "
        ]
        let lower = trimmedTopic.lowercased()
        for pattern in patterns {
            if let range = lower.range(of: pattern) {
                let name = String(trimmedTopic[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty {
                    return sanitizedDisplayName(name)
                }
            }
        }
        return nil
    }

    private static func looksLikeRawMatrixIdentifier(_ value: String) -> Bool {
        value.hasPrefix("@") || value.hasPrefix("!") || value.hasPrefix("#")
    }

    private static func matrixLocalpart(from identifier: String) -> String {
        var local = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        if local.hasPrefix("@") || local.hasPrefix("!") || local.hasPrefix("#") {
            local.removeFirst()
        }

        if let colon = local.firstIndex(of: ":") {
            local = String(local[..<colon])
        }
        return local
    }

    private static func collapseWhitespace(_ value: String) -> String {
        value
            .split(whereSeparator: \.isWhitespace)
            .map(String.init)
            .joined(separator: " ")
    }
}
