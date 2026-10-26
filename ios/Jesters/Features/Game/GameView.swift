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
        .overlay(alignment: .top) {
            if let summary = model.roundSummary {
                RoundToast(summary: summary) { model.roundSummary = nil }
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.default, value: model.roundSummary)
        .task(id: model.roundSummary) {
            guard model.roundSummary != nil else { return }
            try? await Task.sleep(for: .seconds(6))
            model.roundSummary = nil
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.observe() }
    }
}

/// After each round: whether the player made their bid and the points they got.
struct RoundToast: View {
    let summary: RoundSummary
    let close: () -> Void

    private var points: String {
        summary.points > 0 ? "+\(summary.points)" : "\(summary.points)"
    }

    private var title: LocalizedStringKey {
        summary.madeBid ? "You made your bid!" : "You missed your bid"
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: summary.madeBid ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.title2)
                .foregroundStyle(summary.madeBid ? Color.green : Color.red)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text("Round \(summary.round) · Bid \(summary.bid), won \(summary.won)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(points) points")
                .font(.title3.bold())
                .monospacedDigit()
                .foregroundStyle(summary.points >= 0 ? Color.green : Color.red)
            Button("Close", systemImage: "xmark", action: close)
                .labelStyle(.iconOnly)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .shadow(radius: 8, y: 4)
        .padding(.horizontal)
        .accessibilityElement(children: .combine)
        .onAppear {
            let result = summary.madeBid
                ? String(localized: "You made your bid!")
                : String(localized: "You missed your bid")
            AccessibilityNotification.Announcement("\(result), \(String(localized: "\(points) points"))").post()
        }
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
