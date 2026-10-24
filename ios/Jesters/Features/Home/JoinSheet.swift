import SwiftUI

struct JoinSheet: View {
    var initialKey: String?
    let onJoined: (String) -> Void

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var isJoining = false
    @State private var errorMessage: String?

    private var normalizedKey: String {
        key.uppercased().filter { !$0.isWhitespace && $0 != "-" }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Room key", text: $key)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .font(.title2.monospaced())
                        .submitLabel(.join)
                        .onSubmit { Task { await join() } }
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    } else {
                        Text("Ask the host for the 6-character room key.")
                    }
                }
            }
            .navigationTitle("Join game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Join") {
                        Task { await join() }
                    }
                    .disabled(normalizedKey.count != 6 || isJoining)
                }
            }
        }
        .presentationDetents([.medium])
        .onAppear {
            if let initialKey, key.isEmpty { key = initialKey }
        }
    }

    private func join() async {
        guard normalizedKey.count == 6, !isJoining else { return }
        isJoining = true
        defer { isJoining = false }
        do {
            let gameId = try await API.joinRoom(key: normalizedKey, name: session.displayName)
            dismiss()
            onJoined(gameId)
            await PushService.requestAuthorization()
        } catch {
            errorMessage = APIError.message(for: error)
        }
    }
}
