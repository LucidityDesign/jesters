import FirebaseAuth
import FirebaseCore
import FirebaseFirestore
import FirebaseFunctions
import Foundation

/// Firebase setup shared by all services.
enum Backend {
    /// Must match the region in `backend/functions/src/setup.ts`.
    static let region = "europe-west3"
    static let emulatorHost = "127.0.0.1"

    /// Connects to the real Firebase project when `GoogleService-Info.plist` is bundled,
    /// otherwise to the local emulators using the `demo-jesters` project.
    /// The launch argument `-useFirebaseEmulator YES` (set in the Debug scheme) forces the emulators.
    static func configure() {
        let hasConfigFile = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil
        if hasConfigFile {
            FirebaseApp.configure()
        } else {
            FirebaseApp.configure(options: demoOptions())
        }
        if !hasConfigFile || UserDefaults.standard.bool(forKey: "useFirebaseEmulator") {
            connectToEmulators()
        }
    }

    static func functions() -> Functions {
        Functions.functions(region: region)
    }

    private static func demoOptions() -> FirebaseOptions {
        let options = FirebaseOptions(
            googleAppID: "1:000000000000:ios:0000000000000000",
            gcmSenderID: "000000000000"
        )
        options.projectID = "demo-jesters"
        options.apiKey = "demo-api-key"
        return options
    }

    private static func connectToEmulators() {
        Auth.auth().useEmulator(withHost: emulatorHost, port: 9099)

        let settings = Firestore.firestore().settings
        settings.host = "\(emulatorHost):8080"
        settings.isSSLEnabled = false
        settings.cacheSettings = MemoryCacheSettings()
        Firestore.firestore().settings = settings

        functions().useEmulator(withHost: emulatorHost, port: 5001)
    }
}
