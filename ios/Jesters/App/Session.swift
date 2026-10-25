import Foundation
import Observation

/// The signed-in guest and their display name.
@Observable
@MainActor
final class Session {
    private static let nameKey = "displayName"

    private(set) var uid: String?
    private(set) var displayName: String
    private(set) var signInFailed = false

    init() {
        displayName = UserDefaults.standard.string(forKey: Self.nameKey) ?? ""
    }

    var hasName: Bool {
        !displayName.isEmpty
    }

    func signIn() async {
        signInFailed = false
        do {
            let uid = try await API.signInAsGuest()
            self.uid = uid
            PushService.shared.setUser(uid)
            await saveProfile()
        } catch {
            signInFailed = true
        }
    }

    func setDisplayName(_ name: String) async {
        displayName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        UserDefaults.standard.set(displayName, forKey: Self.nameKey)
        await saveProfile()
    }

    /// Deletes everything stored about this guest, then starts over as a new guest.
    func deleteMyData() async throws {
        try await API.deleteMyData()
        uid = nil
        displayName = ""
        UserDefaults.standard.removeObject(forKey: Self.nameKey)
        await signIn()
    }

    private func saveProfile() async {
        guard let uid, hasName else { return }
        // Best effort: the profile only feeds reminders, so a failure must not block playing.
        try? await API.saveProfile(uid: uid, displayName: displayName)
    }
}
