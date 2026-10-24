import SwiftUI

/// Asks for the display name on first launch; also used to change it later.
struct NameView: View {
    let isFirstLaunch: Bool

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isValid: Bool {
        (1...24).contains(trimmedName.count)
    }

    var body: some View {
        Form {
            Section {
                TextField("Your name", text: $name)
                    .textContentType(.nickname)
                    .submitLabel(.done)
                    .onSubmit(save)
            } footer: {
                Text("You play as a guest. Your games are linked to this device and are lost if you delete the app.")
            }

            Section {
                Button(isFirstLaunch ? LocalizedStringKey("Let's play") : LocalizedStringKey("Save"), action: save)
                    .disabled(!isValid)
            }
        }
        .navigationTitle(isFirstLaunch ? LocalizedStringKey("Welcome to Jesters") : LocalizedStringKey("Your name"))
        .toolbar {
            if !isFirstLaunch {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .onAppear { name = session.displayName }
    }

    private func save() {
        guard isValid else { return }
        let name = trimmedName
        Task {
            await session.setDisplayName(name)
            if !isFirstLaunch { dismiss() }
        }
    }
}
