import UIKit
import UserNotifications

/// Keeps the player's FCM token in their profile, so the backend can send "your turn" notifications.
@MainActor
final class PushService {
    static let shared = PushService()

    private var uid: String?
    private var token: String?

    func setUser(_ uid: String) {
        self.uid = uid
        saveToken()
    }

    func setToken(_ token: String?) {
        self.token = token
        saveToken()
    }

    private func saveToken() {
        guard let uid, let token else { return }
        Task {
            try? await API.saveFCMToken(uid: uid, token: token)
        }
    }

    /// Asks for permission once the player has a game to be notified about.
    static func requestAuthorization() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }
}
