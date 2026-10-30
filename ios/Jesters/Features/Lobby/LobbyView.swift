import SwiftUI

struct LobbyView: View {
    let model: GameModel
    let game: GameDoc
    @AppStorage("botLevel") private var botLevel: BotLevel = .medium

    private var isHost: Bool {
        game.hostUid == model.uid
    }

    private var canStart: Bool {
        game.players.count >= 3 && !model.isSending
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Text("Room key")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(game.roomKey)
                        .font(.system(size: 40, weight: .bold, design: .monospaced))
                        .textSelection(.enabled)
                        .accessibilityLabel(game.roomKey.map(String.init).joined(separator: " "))
                    ShareLink(item: String(localized: "Join my Jesters game with the room key \(game.roomKey)")) {
                        Label("Invite players", systemImage: "square.and.arrow.up")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            Section {
                ForEach(game.players, id: \.uid) { player in
                    HStack {
                        Text(player.name)
                        Spacer()
                        if player.uid == game.hostUid {
                            Text("Host").foregroundStyle(.secondary)
                        }
                        if player.uid == model.uid {
                            Text("You").foregroundStyle(.secondary)
                        }
                        if let level = player.botLevel {
                            Text("Bot (\(level.name))").foregroundStyle(.secondary)
                        }
                    }
                    .swipeActions {
                        if isHost && player.uid != model.uid {
                            Button("Remove", role: .destructive) {
                                Task { await model.remove(player.uid) }
                            }
                        }
                    }
                }
                if isHost && game.players.count < 6 {
                    Picker("Bot level", selection: $botLevel) {
                        ForEach(BotLevel.allCases, id: \.self) { level in
                            Text(level.name).tag(level)
                        }
                    }
                    .pickerStyle(.segmented)
                    Button {
                        Task { await model.addBot(level: botLevel) }
                    } label: {
                        Label("Add bot", systemImage: "cpu")
                    }
                    .disabled(model.isSending)
                }
            } header: {
                Text("Players (\(game.players.count) of 6)")
            } footer: {
                if !isHost {
                    Text("Waiting for the host to start the game.")
                } else if game.players.count < 3 {
                    Text("At least 3 players are needed. Invite friends or add bots.")
                } else if game.players.contains(where: \.isBot) {
                    Text("Easy bots play by simple rules; Medium and Hard ones think ahead.")
                }
            }

            Section {
                if isHost {
                    Toggle("No even bids", isOn: Binding(
                        get: { game.settings.noEvenBids },
                        set: { enabled in Task { await model.setNoEvenBids(enabled) } }
                    ))
                    .disabled(model.isSending)
                } else {
                    LabeledContent("No even bids", value: game.settings.noEvenBids ? String(localized: "On") : String(localized: "Off"))
                }
            } footer: {
                Text("With this rule, the dealer may not bid so that the total of all bids equals the number of cards.")
            }

            if isHost {
                Section {
                    Button("Start game") {
                        Task { await model.start() }
                    }
                    .disabled(!canStart)
                }
            }

            if let errorMessage = model.errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Lobby")
        .leaveGameMenu(model: model, isRunning: false)
    }
}
