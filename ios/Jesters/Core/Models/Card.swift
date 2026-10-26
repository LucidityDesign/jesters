import SwiftUI

enum Suit: String, Codable, Sendable, CaseIterable {
    case hearts = "H"
    case spades = "S"
    case diamonds = "D"
    case clubs = "C"

    var symbol: String {
        switch self {
        case .hearts: "♥︎"
        case .spades: "♠︎"
        case .diamonds: "♦︎"
        case .clubs: "♣︎"
        }
    }

    /// Four-color deck, so suits also differ by color.
    var color: Color {
        switch self {
        case .hearts: .red
        case .spades: .blue
        case .diamonds: .orange
        case .clubs: .green
        }
    }

    var name: String {
        switch self {
        case .hearts: String(localized: "Hearts")
        case .spades: String(localized: "Spades")
        case .diamonds: String(localized: "Diamonds")
        case .clubs: String(localized: "Clubs")
        }
    }
}

/// A card in the server's compact encoding: `"H14"` (ace of hearts), `"W1"` (Wizard), `"J1"` (Jester).
struct Card: Hashable, Sendable, Identifiable {
    enum Kind: Hashable, Sendable {
        case regular(Suit, rank: Int)
        case wizard
        case jester
    }

    let code: String
    let kind: Kind

    var id: String { code }

    init?(code: String) {
        guard let first = code.first, let number = Int(code.dropFirst()) else { return nil }
        switch first {
        case "W" where (1...4).contains(number):
            kind = .wizard
        case "J" where (1...4).contains(number):
            kind = .jester
        default:
            guard let suit = Suit(rawValue: String(first)), (2...14).contains(number),
                  String(number) == code.dropFirst() else { return nil }
            kind = .regular(suit, rank: number)
        }
        self.code = code
    }

    /// Wizards and Jesters.
    var isSpecial: Bool {
        suit == nil
    }

    var suit: Suit? {
        if case .regular(let suit, _) = kind { suit } else { nil }
    }

    var color: Color {
        switch kind {
        case .regular(let suit, _): suit.color
        case .wizard: .purple
        case .jester: .gray
        }
    }

    /// Short label shown on the card face.
    var rankText: String {
        switch kind {
        case .wizard: String(localized: "card.wizard.short", defaultValue: "W")
        case .jester: String(localized: "card.jester.short", defaultValue: "J")
        case .regular(_, let rank):
            switch rank {
            case 11: String(localized: "card.jack.short", defaultValue: "J")
            case 12: String(localized: "card.queen.short", defaultValue: "Q")
            case 13: String(localized: "card.king.short", defaultValue: "K")
            case 14: String(localized: "card.ace.short", defaultValue: "A")
            default: String(rank)
            }
        }
    }

    /// Full name for VoiceOver, e.g. "Queen of Hearts".
    var accessibilityName: String {
        switch kind {
        case .wizard: return String(localized: "Wizard")
        case .jester: return String(localized: "Jester")
        case .regular(let suit, let rank):
            let rankName = switch rank {
            case 11: String(localized: "Jack")
            case 12: String(localized: "Queen")
            case 13: String(localized: "King")
            case 14: String(localized: "Ace")
            default: String(rank)
            }
            return String(localized: "\(rankName) of \(suit.name)")
        }
    }

    /// Wizards first, then the suits by rank (highest first), Jesters last.
    static func sortedHand(_ cards: [Card]) -> [Card] {
        cards.sorted { $0.sortKey.lexicographicallyPrecedes($1.sortKey) }
    }

    private var sortKey: [Int] {
        switch kind {
        case .wizard: [0, 0, Int(code.dropFirst()) ?? 0]
        case .regular(let suit, let rank): [1, Suit.allCases.firstIndex(of: suit) ?? 0, -rank]
        case .jester: [2, 0, Int(code.dropFirst()) ?? 0]
        }
    }
}

extension Card: Codable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let code = try container.decode(String.self)
        guard let card = Card(code: code) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid card \(code)")
        }
        self = card
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(code)
    }
}
