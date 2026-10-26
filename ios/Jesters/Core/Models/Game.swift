import Foundation

// Mirrors the Firestore documents written by the backend (backend/functions/src/game/model.ts).
// Arrays described "by seat" are indexed by seat, the index in `players`.

enum GameStatus: String, Codable, Sendable {
    case lobby, choosingTrump, bidding, playing, finished, abandoned

    var isRunning: Bool {
        self == .choosingTrump || self == .bidding || self == .playing
    }
}

struct Player: Codable, Sendable, Hashable {
    let uid: String
    let name: String
    /// The bot level for computer players (the server makes their moves), `nil` for people.
    var bot: String? = nil

    var isBot: Bool {
        bot != nil
    }
}

extension Player {
    /// The backend stores an empty name once a player has deleted their data.
    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let name = try container.decode(String.self, forKey: .name)
        self.init(
            uid: try container.decode(String.self, forKey: .uid),
            name: name.isEmpty ? String(localized: "Former player") : name,
            bot: try container.decodeIfPresent(String.self, forKey: .bot)
        )
    }
}

struct GameSettings: Codable, Sendable, Hashable {
    var noEvenBids: Bool
}

struct PublicRound: Codable, Sendable, Hashable {
    let number: Int
    let totalRounds: Int
    let dealerSeat: Int
    let trumpCard: Card?
    let trumpSuit: Suit?
    /// By seat; `nil` until that player has bid.
    let bids: [Int?]
    let tricksWon: [Int]
    let handSizes: [Int]
}

struct PublicTrick: Codable, Sendable, Hashable {
    let leaderSeat: Int
    /// In play order, starting with the leader.
    let cards: [Card]
}

struct LastTrick: Codable, Sendable, Hashable {
    let leaderSeat: Int
    let cards: [Card]
    let winnerSeat: Int
}

struct RoundResult: Codable, Sendable, Hashable {
    let round: Int
    let bids: [Int]
    let won: [Int]
    let deltas: [Int]
    let totals: [Int]
}

/// `games/{gameId}`
struct GameDoc: Codable, Sendable, Hashable {
    let status: GameStatus
    let roomKey: String
    let hostUid: String
    let settings: GameSettings
    let players: [Player]
    let playerUids: [String]
    let active: Bool
    let version: Int
    let round: PublicRound?
    let trick: PublicTrick?
    let lastTrick: LastTrick?
    let turnSeat: Int?
    let turnUid: String?
    let results: [RoundResult]
    let abandonedBy: String?
    /// Closed automatically after a long time without a move.
    let expired: Bool?
    let updatedAt: Date?

    func seat(of uid: String) -> Int? {
        playerUids.firstIndex(of: uid)
    }

    func name(atSeat seat: Int) -> String {
        players.indices.contains(seat) ? players[seat].name : "?"
    }

    func name(of uid: String) -> String? {
        players.first { $0.uid == uid }?.name
    }

    func isMyTurn(_ uid: String) -> Bool {
        active && turnUid == uid
    }

    /// The last completed trick, while it belongs to the current round. A new round starts with an
    /// empty table: the server keeps the previous round's last trick, but it is not shown.
    var lastTrickOfRound: LastTrick? {
        let tricksPlayed = round?.tricksWon.reduce(0, +) ?? 0
        return tricksPlayed > 0 ? lastTrick : nil
    }

    /// Current total score by seat.
    var totals: [Int] {
        results.last?.totals ?? Array(repeating: 0, count: players.count)
    }

    /// Seats with the highest total.
    var leaders: [Int] {
        guard let best = totals.max() else { return [] }
        return totals.indices.filter { totals[$0] == best }
    }
}

/// `games/{gameId}/hands/{uid}`, readable only by that player.
struct HandDoc: Codable, Sendable, Hashable {
    let cards: [Card]
    /// Cards that may be played now; empty unless it is this player's turn to play.
    let legalCards: [Card]
    /// The bid this player may not make now ("no even bids"), or `nil`.
    let forbiddenBid: Int?
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
