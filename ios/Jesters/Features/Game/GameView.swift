import SwiftUI

/// Shows the lobby, the table or the result, depending on the game's state.
struct GameView: View {
    @State private var model: GameModel

    init(gameId: String, uid: String) {
        _model = State(initialValue: GameModel(gameId: gameId, uid: uid))
    }

    var body: some View {
        ZStack {
            if let game = model.game {
                switch game.status {
                case .lobby:
                    LobbyView(model: model, game: game)
                case .choosingTrump, .bidding, .playing:
                    TableView(model: model, game: game)
                case .finished, .abandoned:
                    GameOverView(game: game, uid: model.uid)
                }
            } else if model.isGone {
                ContentUnavailableView(
                    "Game not available",
                    systemImage: "questionmark.circle",
                    description: Text("This game was deleted or you are no longer part of it.")
                )
            } else {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.observe() }
    }
}

/// Toolbar menu with "Leave game" and a confirmation, shared by the lobby and the table.
struct LeaveGameMenu: ViewModifier {
    let model: GameModel
    let isRunning: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var isConfirming = false

    func body(content: Content) -> some View {
        content
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Leave game", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                            isConfirming = true
                        }
                    } label: {
                        Label("More", systemImage: "ellipsis.circle")
                    }
                }
            }
            .confirmationDialog(
                isRunning
                    ? LocalizedStringKey("Leave and end the game for everyone?")
                    : LocalizedStringKey("Leave this game?"),
                isPresented: $isConfirming,
                titleVisibility: .visible
            ) {
                Button("Leave game", role: .destructive) {
                    Task {
                        if await model.leave() { dismiss() }
                    }
                }
            }
    }
}

extension View {
    func leaveGameMenu(model: GameModel, isRunning: Bool) -> some View {
        modifier(LeaveGameMenu(model: model, isRunning: isRunning))
    }
}
