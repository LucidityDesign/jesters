import SwiftUI

/// The game screen: players, trump, the current trick, whose turn it is, and the player's hand.
struct TableView: View {
    let model: GameModel
    let game: GameDoc

    @State private var selectedCard: Card?
    @State private var isShowingScores = false

    private var isMyTurn: Bool {
        game.isMyTurn(model.uid)
    }

    private var hand: [Card] {
        Card.sortedHand(model.hand?.cards ?? [])
    }

    var body: some View {
        VStack(spacing: 12) {
            PlayersView(game: game, uid: model.uid)
            RoundInfoView(game: game)
            TrickView(game: game)
            Spacer(minLength: 0)
            banner
            actions
            HandView(
                cards: hand,
                legalCards: Set(model.hand?.legalCards ?? []),
                canPlay: isMyTurn && game.status == .playing && !model.isSending,
                selected: $selectedCard
            ) { card in
                Task { await model.play(card) }
            }
        }
        .padding(.vertical)
        .navigationTitle(roundTitle)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isShowingScores = true
                } label: {
                    Label("Scores", systemImage: "list.number")
                }
            }
        }
        .leaveGameMenu(model: model, isRunning: true)
        .sheet(isPresented: $isShowingScores) {
            NavigationStack {
                ScoreSheetView(game: game)
                    .navigationTitle("Scores")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { isShowingScores = false }
                        }
                    }
            }
        }
        .sensoryFeedback(.impact, trigger: isMyTurn) { wasMyTurn, isMyTurn in !wasMyTurn && isMyTurn }
        .onChange(of: isMyTurn) { _, isMyTurn in
            // VoiceOver users don't see the banner change.
            if isMyTurn {
                AccessibilityNotification.Announcement(bannerText).post()
            }
        }
        .onChange(of: game.version) { selectedCard = nil }
    }

    private var roundTitle: Text {
        guard let round = game.round else { return Text(verbatim: "") }
        return Text("Round \(round.number) of \(round.totalRounds)")
    }

    private var banner: some View {
        Text(bannerText)
            .font(.headline)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(10)
            .background(
                isMyTurn ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.1),
                in: RoundedRectangle(cornerRadius: 10)
            )
            .padding(.horizontal)
    }

    private var bannerText: String {
        let name = game.turnSeat.map(game.name(atSeat:)) ?? "?"
        switch game.status {
        case .choosingTrump:
            return isMyTurn
                ? String(localized: "A Wizard was turned up. Choose trump.")
                : String(localized: "Waiting for \(name) to choose trump")
        case .bidding:
            return isMyTurn
                ? String(localized: "How many tricks will you take?")
                : String(localized: "Waiting for \(name) to bid")
        case .playing:
            return isMyTurn
                ? String(localized: "Your turn: tap a card, then tap it again to play")
                : String(localized: "Waiting for \(name) to play")
        case .lobby, .finished, .abandoned:
            return ""
        }
    }

    @ViewBuilder
    private var actions: some View {
        VStack(spacing: 8) {
            if isMyTurn, game.status == .bidding, let round = game.round {
                BidPicker(maxBid: round.number, forbiddenBid: model.hand?.forbiddenBid, isEnabled: !model.isSending) { bid in
                    Task { await model.bid(bid) }
                }
            }
            if isMyTurn, game.status == .choosingTrump {
                TrumpPicker(isEnabled: !model.isSending) { suit in
                    Task { await model.chooseTrump(suit) }
                }
            }
            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
        .padding(.horizontal)
    }
}

/// One row per player: turn marker, name, dealer badge, bid, tricks won and total score.
struct PlayersView: View {
    let game: GameDoc
    let uid: String

    var body: some View {
        VStack(spacing: 6) {
            ForEach(Array(game.players.enumerated()), id: \.element.uid) { seat, player in
                HStack(spacing: 8) {
                    Image(systemName: game.turnSeat == seat ? "circle.fill" : "circle")
                        .font(.caption2)
                        .foregroundStyle(game.turnSeat == seat ? Color.accentColor : Color.secondary)
                        .accessibilityHidden(true)
                    Text(player.name)
                        .fontWeight(player.uid == uid ? .bold : .regular)
                        .lineLimit(1)
                    if player.isBot {
                        Text("Bot")
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .background(.quaternary, in: Capsule())
                    }
                    if game.round?.dealerSeat == seat {
                        Text("Dealer")
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .background(.quaternary, in: Capsule())
                    }
                    Spacer()
                    bidText(seat: seat)
                        .font(.subheadline)
                        .monospacedDigit()
                    Text(game.totals[safe: seat] ?? 0, format: .number)
                        .font(.subheadline.bold())
                        .monospacedDigit()
                        .frame(minWidth: 44, alignment: .trailing)
                        .accessibilityLabel(Text("Score: \(game.totals[safe: seat] ?? 0)"))
                }
                .accessibilityElement(children: .combine)
                .accessibilityValue(game.turnSeat == seat ? Text("Current turn") : Text(verbatim: ""))
            }
        }
        .padding(.horizontal)
    }

    private func bidText(seat: Int) -> Text {
        let won = game.round?.tricksWon[safe: seat] ?? 0
        guard let bid = game.round?.bids[safe: seat] ?? nil else {
            return Text("won \(won)")
        }
        return Text("won \(won) of \(bid)")
    }
}

/// Trump and the total of the bids so far.
struct RoundInfoView: View {
    let game: GameDoc

    var body: some View {
        HStack {
            if let trumpCard = game.round?.trumpCard {
                CardView(card: trumpCard, size: 0.6)
            }
            if let suit = game.round?.trumpSuit {
                Text("Trump: \(Text(suit.symbol).foregroundStyle(suit.color)) \(suit.name)")
            } else if game.status == .choosingTrump {
                Text("Trump: to be chosen")
            } else {
                Text("No trump")
            }
            Spacer()
            if let round = game.round {
                let total = round.bids.compactMap { $0 }.reduce(0, +)
                Text("Bids: \(total) of \(round.number)")
                    .foregroundStyle(.secondary)
            }
        }
        .font(.subheadline)
        .padding(.horizontal)
    }
}

/// The cards of the current trick, or the last trick while the next one has not started.
struct TrickView: View {
    let game: GameDoc

    var body: some View {
        VStack(spacing: 6) {
            if let trick = game.trick, !trick.cards.isEmpty {
                cards(trick.cards, leaderSeat: trick.leaderSeat)
                Text("Current trick").font(.caption).foregroundStyle(.secondary)
            } else if let last = game.lastTrick {
                cards(last.cards, leaderSeat: last.leaderSeat)
                    .opacity(0.6)
                Text("\(game.name(atSeat: last.winnerSeat)) won the last trick")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("No cards played yet")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 120)
    }

    private func cards(_ cards: [Card], leaderSeat: Int) -> some View {
        HStack(spacing: 8) {
            ForEach(Array(cards.enumerated()), id: \.element) { index, card in
                VStack(spacing: 4) {
                    CardView(card: card)
                    Text(game.name(atSeat: (leaderSeat + index) % max(game.players.count, 1)))
                        .font(.caption2)
                        .lineLimit(1)
                        .frame(maxWidth: 56)
                }
            }
        }
    }
}

/// The player's cards. Tap to select, tap again to play.
struct HandView: View {
    let cards: [Card]
    let legalCards: Set<Card>
    let canPlay: Bool
    @Binding var selected: Card?
    let onPlay: (Card) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(cards) { card in
                    let isPlayable = canPlay && legalCards.contains(card)
                    CardView(card: card, isDimmed: canPlay && !isPlayable, isSelected: selected == card)
                        .onTapGesture { tap(card, isPlayable: isPlayable) }
                        .accessibilityAddTraits(isPlayable ? .isButton : [])
                        .accessibilityValue(canPlay && !isPlayable ? Text("Can't be played now") : Text(verbatim: ""))
                        .accessibilityHint(isPlayable ? Text("Double-tap to play") : Text(verbatim: ""))
                        .accessibilityAction {
                            if isPlayable { onPlay(card) }
                        }
                }
            }
            .padding(.top, 16)
            .padding(.horizontal)
        }
        .frame(height: 100)
    }

    private func tap(_ card: Card, isPlayable: Bool) {
        guard isPlayable else { return }
        if selected == card {
            selected = nil
            onPlay(card)
        } else {
            selected = card
        }
    }
}

struct BidPicker: View {
    let maxBid: Int
    let forbiddenBid: Int?
    let isEnabled: Bool
    let onBid: (Int) -> Void

    var body: some View {
        VStack(spacing: 6) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(0...maxBid, id: \.self) { bid in
                        Button {
                            onBid(bid)
                        } label: {
                            Text(bid, format: .number)
                                .frame(minWidth: 28)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!isEnabled || bid == forbiddenBid)
                    }
                }
            }
            if let forbiddenBid {
                Text("You can't bid \(forbiddenBid): the total of all bids must not equal the number of cards.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

struct TrumpPicker: View {
    let isEnabled: Bool
    let onChoose: (Suit) -> Void

    var body: some View {
        HStack {
            ForEach(Suit.allCases, id: \.self) { suit in
                Button {
                    onChoose(suit)
                } label: {
                    Text(suit.symbol)
                        .font(.title)
                        .foregroundStyle(suit.color)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(!isEnabled)
                .accessibilityLabel(suit.name)
            }
        }
    }
}
