import SwiftUI

struct RootView: View {
    @Environment(Session.self) private var session

    var body: some View {
        ZStack {
            if !session.hasName {
                NavigationStack {
                    NameView(isFirstLaunch: true)
                }
            } else if let uid = session.uid {
                HomeView(uid: uid)
            } else if session.signInFailed {
                ContentUnavailableView {
                    Label("No connection", systemImage: "wifi.slash")
                } description: {
                    Text("Could not connect to the server. Check your internet connection.")
                } actions: {
                    Button("Try again") {
                        Task { await session.signIn() }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .task { await session.signIn() }
    }
}
