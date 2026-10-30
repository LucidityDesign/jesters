import {
  type Card,
  createDeck,
  forbiddenLastBid,
  type RandomInt,
  shuffle,
  type Suit,
  SUITS,
  suitOf,
  totalRounds,
} from "../engine/index.js";
import type { WinRates } from "./calibration.js";
import { bid as easyBid } from "./easy.js";
import { cardKind, ROUND_BUCKETS, roundBucket } from "./estimate.js";
import { playCard, rolloutCard, type RoundSim, winnerIndex } from "./sim.js";
import type { BotView } from "./view.js";

// Measures how often each kind of card wins its trick, for `calibration.ts`: deals random rounds,
// lets everyone bid like the Easy bot and play with the rollout policy, and counts. Run with
// `pnpm simulate calibrate`, which writes the table.

interface Tally {
  wins: number;
  plays: number;
}

type Tallies = Record<"wizard" | "jester", Tally> & Record<"trump" | "side" | "noTrump", Tally[]>;

function emptyTallies(): Tallies {
  const ranks = () => Array.from({ length: 13 }, () => ({ wins: 0, plays: 0 }));
  return {
    wizard: { wins: 0, plays: 0 },
    jester: { wins: 0, plays: 0 },
    trump: ranks(),
    side: ranks(),
    noTrump: ranks(),
  };
}

/** A bidding view for `seat`, enough for the Easy bot's `bid`. */
function biddingView(
  sim: RoundSim,
  seat: number,
  round: number,
  dealer: number,
  bids: (number | null)[],
): BotView {
  const others = bids.filter((b, s): b is number => s !== seat && b !== null);
  return {
    seat,
    playerCount: sim.playerCount,
    phase: "bidding",
    round,
    dealer,
    hand: sim.hands[seat] as Card[],
    trumpCard: null,
    trumpSuit: sim.trump,
    bids,
    tricksWon: sim.tricksWon,
    trick: { leader: (dealer + 1) % sim.playerCount, cards: [] },
    roundTricks: [],
    noEvenBids: true,
    legalCards: [],
    forbiddenBid: seat === dealer ? forbiddenLastBid(others, round) : null,
    results: [],
    aggression: 0,
  };
}

/** Plays `deals` random rounds of every size for every player count and returns the win rates. */
export function calibrate(deals: number, randomInt: RandomInt): WinRates[][] {
  return [3, 4, 5, 6].map((playerCount) => {
    const tallies = ROUND_BUCKETS.map(() => emptyTallies());
    const lastRound = totalRounds(playerCount);
    for (let round = 1; round <= lastRound; round++) {
      const bucket = tallies[roundBucket(round)] as Tallies;
      for (let d = 0; d < deals; d++) playRound(playerCount, round, lastRound, bucket, randomInt);
    }
    return tallies.map(rates);
  });
}

function playRound(
  playerCount: number,
  round: number,
  lastRound: number,
  tallies: Tallies,
  randomInt: RandomInt,
) {
  const deck = shuffle(createDeck(), randomInt);
  const hands = Array.from({ length: playerCount }, (_, seat) =>
    deck.slice(seat * round, (seat + 1) * round),
  );
  const trumpCard = round < lastRound ? (deck[playerCount * round] as Card) : null;
  let trump: Suit | null = null;
  if (trumpCard?.[0] === "W") trump = SUITS[randomInt(4)] as Suit;
  else if (trumpCard && trumpCard[0] !== "J") trump = suitOf(trumpCard);

  const dealer = randomInt(playerCount);
  const sim: RoundSim = {
    playerCount,
    trump,
    hands,
    bids: [],
    tricksWon: Array<number>(playerCount).fill(0),
    trick: [],
    leader: (dealer + 1) % playerCount,
    tricksLeft: round,
  };
  const bids: (number | null)[] = Array<number | null>(playerCount).fill(null);
  for (let i = 1; i <= playerCount; i++) {
    const seat = (dealer + i) % playerCount;
    bids[seat] = easyBid(biddingView(sim, seat, round, dealer, bids));
  }
  sim.bids = bids as number[];

  while (sim.tricksLeft > 0) {
    const cards: Card[] = [];
    for (let i = 0; i < playerCount; i++) {
      const card = rolloutCard(sim);
      cards.push(card);
      playCard(sim, card);
    }
    const winner = winnerIndex(cards, trump);
    cards.forEach((card, i) => {
      const kind = cardKind(card, trump);
      const tally =
        kind === "wizard" || kind === "jester"
          ? tallies[kind]
          : (tallies[kind][Number(card.slice(1)) - 2] as Tally);
      tally.plays++;
      if (i === winner) tally.wins++;
    });
  }
}

function rates(tallies: Tallies): WinRates {
  const rate = ({ wins, plays }: Tally) =>
    plays === 0 ? 0 : Math.round((wins / plays) * 1000) / 1000;
  return {
    wizard: rate(tallies.wizard),
    jester: rate(tallies.jester),
    trump: tallies.trump.map(rate),
    side: tallies.side.map(rate),
    noTrump: tallies.noTrump.map(rate),
  };
}
