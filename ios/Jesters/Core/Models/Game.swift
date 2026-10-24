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
