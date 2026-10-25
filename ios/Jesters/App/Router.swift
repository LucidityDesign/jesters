import Foundation
import Observation

/// Navigation requests from outside the view hierarchy: notification taps and invite links.
@Observable
@MainActor
final class Router {
    static let shared = Router()

    /// A game to open, e.g. after tapping a "your turn" notification.
    var openGameId: String?
    /// A room key to join, from an invite link.
    var joinKey: String?

    func handle(_ url: URL) {
        if let key = Self.roomKey(from: url) {
            joinKey = key
        }
    }

    /// The room key in `jesters://join/K7Q2XM` or `https://<host>/join/K7Q2XM`.
    nonisolated static func roomKey(from url: URL) -> String? {
        let hostPart = url.scheme == "jesters" ? [url.host() ?? ""] : []
        let parts = hostPart + url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, parts[0] == "join" else { return nil }
        let key = parts[1].uppercased()
        let allowed = Set("ABCDEFGHJKMNPQRSTUVWXYZ23456789")
        guard key.count == 6, key.allSatisfy(allowed.contains) else { return nil }
        return key
    }
}
