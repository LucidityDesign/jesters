import SwiftUI

/// Rounds × players: running total, with bid / tricks won below.
struct ScoreSheetView: View {
    let game: GameDoc

    var body: some View {
        if game.results.isEmpty {
            ContentUnavailableView("No scores yet", systemImage: "list.number", description: Text("Scores appear after the first round."))
        } else {
            ScrollView([.horizontal, .vertical]) {
                VStack(alignment: .leading) {
                Grid(alignment: .trailing, horizontalSpacing: 20, verticalSpacing: 10) {
                    GridRow {
                        Text("Round").bold()
                        ForEach(game.players, id: \.uid) { player in
                            Text(player.name).bold().lineLimit(1)
                        }
                    }
                    Divider()
                    ForEach(game.results, id: \.round) { result in
                        GridRow {
                            Text(result.round, format: .number)
                            ForEach(game.players.indices, id: \.self) { seat in
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(result.totals[safe: seat] ?? 0, format: .number)
                                        .monospacedDigit()
                                    Text(verbatim: "\(result.bids[safe: seat] ?? 0)/\(result.won[safe: seat] ?? 0)")
                                        .font(.caption)
                                        .foregroundStyle((result.deltas[safe: seat] ?? 0) > 0 ? Color.green : Color.red)
                                }
                            }
                        }
                    }
                }
                .padding()
                Text("Small numbers: bid / tricks won")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                }
            }
        }
    }
}
