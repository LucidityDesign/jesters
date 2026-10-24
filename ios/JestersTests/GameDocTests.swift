import Foundation
import Testing
@testable import Jesters

struct GameDocTests {
    static let json = #"""
    {
      "status": "playing",
      "roomKey": "K7Q2XM",
      "hostUid": "a",
      "settings": { "noEvenBids": true },
      "players": [{ "uid": "a", "name": "Anna" }, { "uid": "b", "name": "Ben" }, { "uid": "c", "name": "Cleo" }],
      "playerUids": ["a", "b", "c"],
      "active": true,
      "version": 12,
      "round": {
        "number": 2, "totalRounds": 20, "dealerSeat": 0, "trumpCard": "S4", "trumpSuit": "S",
        "bids": [0, 1, null], "tricksWon": [1, 0, 0], "handSizes": [1, 2, 2]
      },
      "trick": { "leaderSeat": 1, "cards": ["H2"] },
      "lastTrick": { "leaderSeat": 1, "cards": ["H3", "H9", "H14"], "winnerSeat": 0 },
      "turnSeat": 2,
      "turnUid": "c",
      "results": [{ "round": 1, "bids": [0, 1, 0], "won": [0, 1, 0], "deltas": [20, 30, 20], "totals": [20, 30, 20] }]
    }
    """#

    let game: GameDoc

    init() throws {
        game = try JSONDecoder().decode(GameDoc.self, from: Data(Self.json.utf8))
    }

    @Test func decodesTheServerDocument() {
        #expect(game.status == .playing)
        #expect(game.round?.trumpSuit == .spades)
        #expect(game.round?.bids == [0, 1, nil])
        #expect(game.trick?.cards.map(\.code) == ["H2"])
        #expect(game.lastTrick?.winnerSeat == 0)
        #expect(game.abandonedBy == nil)
    }

    @Test func answersSeatAndTurnQuestions() {
        #expect(game.seat(of: "b") == 1)
        #expect(game.seat(of: "x") == nil)
        #expect(game.name(atSeat: 2) == "Cleo")
        #expect(game.name(atSeat: 7) == "?")
        #expect(game.isMyTurn("c"))
        #expect(!game.isMyTurn("a"))
        #expect(game.status.isRunning)
    }

    @Test func computesTotalsAndLeaders() {
        #expect(game.totals == [20, 30, 20])
        #expect(game.leaders == [1])
    }

    @Test func omitsAMissingVersionWhenEncodingRequests() throws {
        let data = try JSONEncoder().encode(PlaceBidRequest(gameId: "g", version: nil, bid: 2))
        let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["version"] == nil)
        #expect(object["bid"] as? Int == 2)
    }
}
