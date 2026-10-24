import SwiftUI

struct GameRoute: Hashable {
    let gameId: String
}

struct HomeView: View {
    @Environment(Session.self) private var session
    @Environment(Router.self) private var router
    @State private var model: HomeModel
    @State private var path: [GameRoute] = []
    @State private var isJoining = false
    @State private var joinKey: String?
    @State private var isEditingName = false
    @State private var isCreating = false
    @State private var errorMessage: String?

    init(uid: String) {
        _model = State(initialValue: HomeModel(uid: uid))
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    Button {
                        Task { await createRoom() }
                    } label: {
                        Label("New game", systemImage: "plus.circle")
                    }
                    .disabled(isCreating)

                    Button {
                        joinKey = nil
                        isJoining = true
                    } label: {
                        Label("Join with key", systemImage: "key")
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }

                gameSection("Your turn", games: model.myTurnGames)
                gameSection("Other games", games: model.otherActiveGames)
                gameSection("Finished", games: model.finishedGames)

                if model.loadFailed {
                    Text("Could not load your games.")
                        .foregroundStyle(.secondary)
                } else if model.isLoaded && model.games.isEmpty {
                    Text("No games yet. Start a new game and invite your friends with the room key.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Jesters")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isEditingName = true
                    } label: {
                        Label(session.displayName, systemImage: "person.crop.circle")
                            .labelStyle(.titleAndIcon)
                    }
                }
            }
            .navigationDestination(for: GameRoute.self) { route in
                GameView(gameId: route.gameId, uid: model.uid)
            }
            .sheet(isPresented: $isJoining) {
                JoinSheet(initialKey: joinKey) { gameId in
                    path.append(GameRoute(gameId: gameId))
                }
            }
            .sheet(isPresented: $isEditingName) {
                NavigationStack {
                    NameView(isFirstLaunch: false)
                }
            }
            .task { await model.observe() }
            .onChange(of: router.openGameId, initial: true) { _, gameId in
                guard let gameId else { return }
                router.openGameId = nil
                path = [GameRoute(gameId: gameId)]
            }
            .onChange(of: router.joinKey, initial: true) { _, key in
                guard let key else { return }
                router.joinKey = nil
                joinKey = key
                isJoining = true
            }
        }
    }

    @ViewBuilder
    private func gameSection(_ title: LocalizedStringKey, games: [Identified<GameDoc>]) -> some View {
        if !games.isEmpty {
            Section(title) {
                ForEach(games) { game in
                    NavigationLink(value: GameRoute(gameId: game.id)) {
                        GameRow(game: game.value, uid: model.uid)
                    }
                }
            }
        }
    }

    private func createRoom() async {
        isCreating = true
        defer { isCreating = false }
        do {
            let room = try await API.createRoom(name: session.displayName)
            errorMessage = nil
            path.append(GameRoute(gameId: room.gameId))
            await PushService.requestAuthorization()
        } catch {
            errorMessage = APIError.message(for: error)
        }
    }
}

struct GameRow: View {
    let game: GameDoc
    let uid: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(game.players.map(\.name).formatted(.list(type: .and)))
                .font(.headline)
                .lineLimit(1)
            Text(statusText)
                .font(.subheadline)
                .foregroundStyle(game.isMyTurn(uid) ? Color.accentColor : .secondary)
        }
    }

    private var statusText: String {
        switch game.status {
        case .lobby:
            return String(localized: "In the lobby · key \(game.roomKey)")
        case .choosingTrump, .bidding, .playing:
            let round = game.round?.number ?? 0
            if game.isMyTurn(uid) {
                return String(localized: "Your turn · round \(round)")
            }
            let name = game.turnSeat.map(game.name(atSeat:)) ?? "?"
            return String(localized: "Waiting for \(name) · round \(round)")
        case .finished:
            let winners = game.leaders.map(game.name(atSeat:)).formatted(.list(type: .and))
            return String(localized: "Finished · winner: \(winners)")
        case .abandoned:
            return String(localized: "Ended early")
        }
    }
}
