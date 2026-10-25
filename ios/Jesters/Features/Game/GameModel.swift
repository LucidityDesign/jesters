import FirebaseFirestore
import Observation

/// One game: the public game document and the player's own hand, live from Firestore, plus actions.
@Observable
@MainActor
final class GameModel {
    let gameId: String
    let uid: String

    private(set) var game: GameDoc?
    private(set) var hand: HandDoc?
    /// The game was deleted or the player was removed from it.
    private(set) var isGone = false
    private(set) var isSending = false
    var errorMessage: String?

    init(gameId: String, uid: String) {
        self.gameId = gameId
        self.uid = uid
    }

    func observe() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.observeGame() }
            group.addTask { await self.observeHand() }
        }
    }

    private func observeGame() async {
        let reference = Firestore.firestore().collection("games").document(gameId)
        do {
            for try await game in reference.values(GameDoc.self) {
                self.game = game
                isGone = game == nil
            }
        } catch {
            // Reading fails once the player is no longer part of the game.
            game = nil
            isGone = true
        }
    }

    private func observeHand() async {
        let reference = Firestore.firestore().document("games/\(gameId)/hands/\(uid)")
        do {
            for try await hand in reference.values(HandDoc.self) {
                self.hand = hand
            }
        } catch {
            // Access problems are reported by the game listener.
        }
    }

    // MARK: Lobby

    func setNoEvenBids(_ enabled: Bool) async {
        await send { try await API.updateSettings(gameId: self.gameId, noEvenBids: enabled) }
    }

    func start() async {
        await send { try await API.startGame(gameId: self.gameId) }
    }

    func remove(_ playerUid: String) async {
        await send { try await API.removePlayer(gameId: self.gameId, uid: playerUid) }
    }

    /// Returns whether leaving worked.
    func leave() async -> Bool {
        await send { try await API.leaveGame(gameId: self.gameId) }
    }

    // MARK: Playing

    func chooseTrump(_ suit: Suit) async {
        let request = ChooseTrumpRequest(gameId: gameId, version: game?.version, suit: suit)
        await send { try await API.chooseTrump(request) }
    }

    func bid(_ bid: Int) async {
        let request = PlaceBidRequest(gameId: gameId, version: game?.version, bid: bid)
        await send { try await API.placeBid(request) }
    }

    func play(_ card: Card) async {
        let request = PlayCardRequest(gameId: gameId, version: game?.version, card: card)
        await send { try await API.playCard(request) }
    }

    @discardableResult
    private func send(_ action: () async throws -> Void) async -> Bool {
        guard !isSending else { return false }
        isSending = true
        defer { isSending = false }
        do {
            try await action()
            errorMessage = nil
            return true
        } catch {
            errorMessage = APIError.message(for: error)
            return false
        }
    }
}
