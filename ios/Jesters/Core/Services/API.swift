import FirebaseAuth
import FirebaseFunctions

struct PingRequest: Encodable, Sendable {
    let message: String?
}

struct PingResponse: Decodable, Sendable, Equatable {
    let ok: Bool
    let uid: String
    let echo: String?
}

/// Calls to the Cloud Functions backend.
enum API {
    /// Signs in as an anonymous guest unless already signed in. Returns the user id.
    static func signInAsGuest() async throws -> String {
        if let user = Auth.auth().currentUser {
            return user.uid
        }
        return try await Auth.auth().signInAnonymously().user.uid
    }

    /// Smoke test for the app ↔ backend wiring. Removed once real actions exist.
    static func ping(message: String? = nil) async throws -> PingResponse {
        let callable = Backend.functions().httpsCallable(
            "ping",
            requestAs: PingRequest.self,
            responseAs: PingResponse.self
        )
        return try await callable.call(PingRequest(message: message))
    }
}
