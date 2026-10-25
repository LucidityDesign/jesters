import SwiftUI

/// Asks for the display name on first launch. Later it is the profile screen: change the name,
/// read the privacy policy or delete all data.
struct NameView: View {
    let isFirstLaunch: Bool

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var isConfirmingDelete = false
    @State private var isDeleting = false
    @State private var deleteError: String?

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

            if !isFirstLaunch {
                privacySection
            }
        }
        .navigationTitle(isFirstLaunch ? LocalizedStringKey("Welcome to Jesters") : LocalizedStringKey("Profile"))
        .toolbar {
            if !isFirstLaunch {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .onAppear { name = session.displayName }
        .confirmationDialog("Delete all your data?", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("Delete my data", role: .destructive) {
                Task { await deleteMyData() }
            }
        } message: {
            Text("Your running games end for everyone. This can't be undone.")
        }
    }

    private var privacySection: some View {
        Section {
            if let url = AppInfo.privacyPolicyURL {
                Link("Privacy policy", destination: url)
            }
            Button("Delete my data", role: .destructive) {
                isConfirmingDelete = true
            }
            .disabled(isDeleting)
            if let deleteError {
                Text(deleteError)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Privacy")
        } footer: {
            Text("Deleting your data ends your running games, removes your name from finished games and deletes your guest account. You then start over as a new guest.")
        }
    }

    private func deleteMyData() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await session.deleteMyData()
            deleteError = nil
        } catch {
            deleteError = APIError.message(for: error)
        }
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
