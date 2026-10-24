import SwiftUI

@main
struct JestersApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session: Session

    init() {
        Backend.configure()
        _session = State(initialValue: Session())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(Router.shared)
                .onOpenURL { url in Router.shared.handle(url) }
        }
    }
}
