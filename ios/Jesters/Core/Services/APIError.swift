import FirebaseFunctions
import Foundation

/// Turns backend errors into messages for the player.
enum APIError {
    /// The machine-readable reason the backend sends in `HttpsError.details.reason`.
    static func reason(of error: Error) -> String? {
        let nsError = error as NSError
        guard nsError.domain == FunctionsErrorDomain,
              let details = nsError.userInfo[FunctionsErrorDetailsKey] as? [String: Any] else { return nil }
        return details["reason"] as? String
    }

    static func message(for error: Error) -> String {
        if let reason = reason(of: error) {
            return message(forReason: reason)
        }
        let nsError = error as NSError
        if nsError.domain == FunctionsErrorDomain, nsError.code == FunctionsErrorCode.unavailable.rawValue {
            return String(localized: "No connection to the server. Please try again.")
        }
        return String(localized: "Something went wrong. Please try again.")
    }

    static func message(forReason reason: String) -> String {
        switch reason {
        case "ROOM_NOT_FOUND": String(localized: "There is no game with this key.")
        case "GAME_NOT_FOUND": String(localized: "This game no longer exists.")
        case "NOT_IN_GAME": String(localized: "You are not part of this game.")
        case "NOT_HOST": String(localized: "Only the host can do that.")
        case "ALREADY_STARTED": String(localized: "This game has already started.")
        case "ROOM_FULL": String(localized: "This game is full.")
        case "NOT_ENOUGH_PLAYERS": String(localized: "At least 3 players are needed.")
        case "GAME_OVER": String(localized: "This game is over.")
        case "STALE_VERSION": String(localized: "The game changed in the meantime. Please try again.")
        case "TOO_MANY_GAMES": String(localized: "You are in too many games. Finish or leave one first.")
        case "NOT_YOUR_TURN": String(localized: "It's not your turn.")
        case "MUST_FOLLOW_SUIT": String(localized: "You must follow suit.")
        case "BID_SUM_NOT_ALLOWED": String(localized: "The total of all bids must not equal the number of cards.")
        case "INVALID_REQUEST", "INVALID_BID", "INVALID_SUIT": String(localized: "Please check your input.")
        default: String(localized: "Something went wrong. Please try again.")
        }
    }
}
