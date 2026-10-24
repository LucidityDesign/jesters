import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions

struct RoomResponse: Decodable, Sendable {
    let gameId: String
    let roomKey: String
}

private struct GameIdResponse: Decodable, Sendable {
    let gameId: String
}

private struct OKResponse: Decodable, Sendable {}

private struct VersionResponse: Decodable, Sendable {
    let version: Int
}

private struct CreateRoomRequest: Encodable, Sendable {
    let name: String
}

private struct JoinRoomRequest: Encodable, Sendable {
    let roomKey: String
    let name: String
}

private struct GameRequest: Encodable, Sendable {
    let gameId: String
}

private struct SettingsRequest: Encodable, Sendable {
    let gameId: String
    let noEvenBids: Bool
}

private struct RemovePlayerRequest: Encodable, Sendable {
    let gameId: String
    let uid: String
}

struct ChooseTrumpRequest: Encodable, Sendable {
    let gameId: String
    let version: Int?
    let suit: Suit
}

struct PlaceBidRequest: Encodable, Sendable {
    let gameId: String
    let version: Int?
    let bid: Int
}

struct PlayCardRequest: Encodable, Sendable {
    let gameId: String
    let version: Int?
    let card: Card
}

/// Calls to Firebase Auth, the user profile and the Cloud Functions backend.
enum API {
    /// Signs in as an anonymous guest unless already signed in. Returns the user id.
    static func signInAsGuest() async throws -> String {
        if let user = Auth.auth().currentUser {
            return user.uid
        }
        return try await Auth.auth().signInAnonymously().user.uid
    }

    /// Stores the name, time zone and language, used for reminders at sensible local times.
    static func saveProfile(uid: String, displayName: String) async throws {
        let profile: [String: Any] = [
            "displayName": displayName,
            "timeZone": TimeZone.current.identifier,
            "locale": Locale.current.identifier(.bcp47),
        ]
        try await Firestore.firestore().collection("users").document(uid).setData(profile, merge: true)
    }

    static func createRoom(name: String) async throws -> RoomResponse {
        try await call("createRoom", CreateRoomRequest(name: name))
    }

    /// Returns the game id.
    static func joinRoom(key: String, name: String) async throws -> String {
        let response: GameIdResponse = try await call("joinRoom", JoinRoomRequest(roomKey: key, name: name))
        return response.gameId
    }

    static func updateSettings(gameId: String, noEvenBids: Bool) async throws {
        let _: OKResponse = try await call("updateSettings", SettingsRequest(gameId: gameId, noEvenBids: noEvenBids))
    }

    static func startGame(gameId: String) async throws {
        let _: OKResponse = try await call("startGame", GameRequest(gameId: gameId))
    }

    static func removePlayer(gameId: String, uid: String) async throws {
        let _: OKResponse = try await call("removePlayer", RemovePlayerRequest(gameId: gameId, uid: uid))
    }

    static func leaveGame(gameId: String) async throws {
        let _: OKResponse = try await call("leaveGame", GameRequest(gameId: gameId))
    }

    static func chooseTrump(_ request: ChooseTrumpRequest) async throws {
        let _: VersionResponse = try await call("chooseTrump", request)
    }

    static func placeBid(_ request: PlaceBidRequest) async throws {
        let _: VersionResponse = try await call("placeBid", request)
    }

    static func playCard(_ request: PlayCardRequest) async throws {
        let _: VersionResponse = try await call("playCard", request)
    }

    private static func call<Request: Encodable & Sendable, Response: Decodable & Sendable>(
        _ name: String,
        _ request: Request
    ) async throws -> Response {
        let callable = Backend.functions().httpsCallable(name, requestAs: Request.self, responseAs: Response.self)
        return try await callable.call(request)
    }
}
