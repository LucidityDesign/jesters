import SwiftUI

@main
struct JestersApp: App {
    init() {
        Backend.configure()
    }

    var body: some Scene {
        WindowGroup {
            HomeView()
        }
    }
}
