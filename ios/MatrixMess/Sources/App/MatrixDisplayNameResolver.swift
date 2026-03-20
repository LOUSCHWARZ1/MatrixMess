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
    private static let noiseFragments = [
        "mautrix",
        "bridge",
        "double puppeting",
        "relay bot",
        "appservice",
        "(telegram)",
        "(whatsapp)",
        "(signal)",
        "(instagram)"
    ]

    static func sanitizedDisplayName(_ raw: String?, fallbackUserID: String? = nil) -> String {
        let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleaned = cleanCandidate(trimmed)
        if !cleaned.isEmpty, !looksLikeRawMatrixIdentifier(cleaned) {
            return cleaned
        }

        if let fallbackUserID {
            let friendly = userFacingName(from: fallbackUserID)
            if !friendly.isEmpty {
                return friendly
            }
        }

        if !cleaned.isEmpty {
            return userFacingName(from: cleaned)
        }

        if !trimmed.isEmpty {
            return userFacingName(from: trimmed)
        }

        return "Unbekannt"
    }

    static func userFacingName(from identifier: String) -> String {
        let trimmed = cleanCandidate(identifier)
        if trimmed.hasPrefix("!") {
            return "Unbenannter Chat"
        }

        let local = matrixLocalpart(from: identifier)
        guard !local.isEmpty else {
            return cleanCandidate(identifier)
        }

        let normalizedLocal = cleanCandidate(local)
        for prefix in bridgePrefixes where normalizedLocal.lowercased().hasPrefix(prefix) {
            let suffix = String(normalizedLocal.dropFirst(prefix.count))
            if suffix.allSatisfy(\.isNumber) {
                return "+\(suffix)"
            }
            let decodedSuffix = suffix.replacingOccurrences(of: "_", with: " ")
            return cleanCandidate(decodedSuffix)
        }

        if normalizedLocal.allSatisfy(\.isNumber), normalizedLocal.count >= 7 {
            return "+\(normalizedLocal)"
        }

        let decoded = normalizedLocal
            .replacingOccurrences(of: ".", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .replacingOccurrences(of: "-", with: " ")
        return cleanCandidate(decoded)
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

    private static func cleanCandidate(_ value: String) -> String {
        guard !value.isEmpty else { return "" }

        var cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        cleaned = cleaned.replacingOccurrences(of: "%20", with: " ")
        cleaned = cleaned.replacingOccurrences(of: "+", with: " ")
        cleaned = cleaned.removingPercentEncoding ?? cleaned
        cleaned = cleaned.replacingOccurrences(of: "\"", with: "")
        cleaned = cleaned.replacingOccurrences(of: "(", with: " ")
        cleaned = cleaned.replacingOccurrences(of: ")", with: " ")
        cleaned = cleaned.replacingOccurrences(of: "[", with: " ")
        cleaned = cleaned.replacingOccurrences(of: "]", with: " ")

        let lowered = cleaned.lowercased()
        if let atIndex = lowered.firstIndex(of: "@"), let colonIndex = lowered.firstIndex(of: ":"),
           atIndex < colonIndex, lowered.distance(from: atIndex, to: colonIndex) > 2 {
            cleaned = String(cleaned[..<atIndex]).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        for fragment in noiseFragments {
            cleaned = cleaned.replacingOccurrences(of: fragment, with: "", options: .caseInsensitive)
        }

        cleaned = cleaned.replacingOccurrences(of: "  ", with: " ")
        return collapseWhitespace(cleaned)
    }

    private static func collapseWhitespace(_ value: String) -> String {
        value
            .split(whereSeparator: \.isWhitespace)
            .map(String.init)
            .joined(separator: " ")
    }
}
