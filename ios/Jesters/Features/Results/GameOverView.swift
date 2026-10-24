import SwiftUI

struct GameOverView: View {
    let game: GameDoc
    let uid: String

    private var standings: [(seat: Int, total: Int)] {
        game.totals.enumerated()
            .map { (seat: $0.offset, total: $0.element) }
            .sorted { $0.total > $1.total }
    }

    var body: some View {
        List {
            Section {
                if game.expired == true {
                    Text("This game was closed after 14 days without a move.")
                } else if game.status == .abandoned {
                    let name = game.abandonedBy.flatMap(game.name(of:)) ?? "?"
                    Text("\(name) left, so the game ended early.")
                } else {
                    let winners = game.leaders.map(game.name(atSeat:)).formatted(.list(type: .and))
                    Text("Winner: \(winners)")
                        .font(.title2.bold())
                }
            }

            Section("Standings") {
                ForEach(standings, id: \.seat) { entry in
                    HStack {
                        Text(game.name(atSeat: entry.seat))
                            .fontWeight(game.players[safe: entry.seat]?.uid == uid ? .bold : .regular)
                        Spacer()
                        Text(entry.total, format: .number).monospacedDigit()
                    }
                }
            }

            Section {
                NavigationLink("Score sheet") {
                    ScoreSheetView(game: game)
                        .navigationTitle("Scores")
                }
            }
        }
        .navigationTitle(game.status == .abandoned ? LocalizedStringKey("Game ended") : LocalizedStringKey("Game over"))
    }
}
