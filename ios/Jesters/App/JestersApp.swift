import SwiftUI

@main
struct JestersApp: App {
    @State private var session: Session

    init() {
        Backend.configure()
        _session = State(initialValue: Session())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
        }
    }
}
