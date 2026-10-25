import Foundation
import Testing
@testable import Jesters

struct CardTests {
    @Test(arguments: ["H2", "D10", "C13", "S14", "W1", "W4", "J1", "J4"])
    func parsesValidCodes(code: String) throws {
        let card = try #require(Card(code: code))
        #expect(card.code == code)
    }

    @Test(arguments: ["", "H", "H1", "H15", "H02", "W0", "W5", "J5", "X3", "h2"])
    func rejectsInvalidCodes(code: String) {
        #expect(Card(code: code) == nil)
    }

    @Test func parsesKinds() throws {
        #expect(try #require(Card(code: "H14")).kind == .regular(.hearts, rank: 14))
        #expect(try #require(Card(code: "W2")).kind == .wizard)
        #expect(try #require(Card(code: "J3")).kind == .jester)
        #expect(try #require(Card(code: "W2")).suit == nil)
    }

    @Test func sortsHands() {
        let cards = ["J1", "D2", "H14", "W3", "S10", "H2", "C12"].compactMap(Card.init(code:))
        #expect(Card.sortedHand(cards).map(\.code) == ["W3", "H14", "H2", "S10", "D2", "C12", "J1"])
    }

    @Test func encodesAsCode() throws {
        let card = try #require(Card(code: "S12"))
        let data = try JSONEncoder().encode([card])
        #expect(String(decoding: data, as: UTF8.self) == #"["S12"]"#)
        #expect(try JSONDecoder().decode([Card].self, from: data) == [card])
    }

    @Test func rejectsInvalidCardsWhenDecoding() {
        #expect(throws: DecodingError.self) {
            try JSONDecoder().decode([Card].self, from: Data(#"["H1"]"#.utf8))
        }
    }
}
