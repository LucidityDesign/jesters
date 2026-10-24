import SwiftUI

/// Placeholder home screen for M0: verifies sign-in and the backend connection.
struct HomeView: View {
    private enum Status: Equatable {
        case idle
        case checking
        case connected(uid: String)
        case failed(String)
    }

    @State private var status = Status.idle

    var body: some View {
        VStack(spacing: 24) {
            Text("Jesters")
                .font(.largeTitle.bold())

            statusText
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Test connection") {
                Task { await checkConnection() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(status == .checking)
        }
        .padding()
    }

    @ViewBuilder
    private var statusText: some View {
        switch status {
        case .idle:
            Text("Not connected yet")
        case .checking:
            Text("Connecting…")
        case .connected(let uid):
            Text("Connected as \(uid)")
        case .failed(let message):
            Text("Connection failed: \(message)")
        }
    }

    private func checkConnection() async {
        status = .checking
        do {
            _ = try await API.signInAsGuest()
            let response = try await API.ping(message: "hello")
            status = .connected(uid: response.uid)
        } catch {
            status = .failed(error.localizedDescription)
        }
    }
}

#Preview {
    HomeView()
}
