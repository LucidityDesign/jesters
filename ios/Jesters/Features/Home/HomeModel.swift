import FirebaseFirestore
import Observation

/// The player's games, live from Firestore.
@Observable
@MainActor
final class HomeModel {
    let uid: String
    private(set) var games: [Identified<GameDoc>] = []
    private(set) var isLoaded = false
    private(set) var loadFailed = false

    init(uid: String) {
        self.uid = uid
    }

    func observe() async {
        let query = Firestore.firestore().collection("games")
            .whereField("playerUids", arrayContains: uid)
            .order(by: "updatedAt", descending: true)
            .limit(to: 50)
        do {
            for try await games in query.values(GameDoc.self) {
                self.games = games
                isLoaded = true
                loadFailed = false
            }
        } catch {
            loadFailed = true
        }
    }

    var myTurnGames: [Identified<GameDoc>] {
        games.filter { $0.value.isMyTurn(uid) }
    }

    var otherActiveGames: [Identified<GameDoc>] {
        games.filter { $0.value.active && !$0.value.isMyTurn(uid) }
    }

    var finishedGames: [Identified<GameDoc>] {
        games.filter { !$0.value.active }
    }
}
