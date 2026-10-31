import { type Card, forbiddenLastBid, type RandomInt } from "../engine/index.js";
import { estimateBid, estimateTricks } from "./estimate.js";
import { sampleDeal } from "./knowledge.js";
import {
  cloneSim,
  fastRandom,
  playCard,
  playOut,
  type RoundSim,
  scoreOf,
  strength,
} from "./sim.js";
import type { BotView } from "./view.js";

// The Medium and Hard bots: Monte Carlo search over random deals of the hidden cards
// (determinization). For each candidate move, the same deals are played to the end of the round
// with the rollout policy (`sim.ts`), and the move with the best average round score wins.
//
// Only the rest of the current round is simulated: rounds are scored on their own and dealt
// afresh, so later rounds don't depend on this move. (A variant with one bid for the whole game
// would have to simulate the remaining game instead.)
//
// Known weakness, accepted: in each deal the search plays as if it knew the hidden cards
// ("strategy fusion"), so it slightly overrates moves that need guessing right.

export interface SearchBudget {
  /** Deals per candidate card while playing. */
  playDeals: number;
  /** Deals per bid that survives the first, cheaper look at all bids. */
  bidDeals: number;
  /** Deal opponents hands that fit their bids. */
  fitBids: boolean;
  /** Stop and decide with what has been simulated so far after this long. */
  maxMillis: number;
}

export interface SearchOptions {
  /** The clock for `maxMillis`; replaceable in tests. */
  now?: () => number;
}

/** Bids further below the best one than this, after the first look, get no more deals. */
const BID_CUTOFF = 15;
/** At most this many bids get the full budget. */
const BID_FINALISTS = 3;

/** The card to play, by simulation. */
export function searchPlay(
  view: BotView,
  budget: SearchBudget,
  randomInt: RandomInt,
  options: SearchOptions = {},
): Card {
  const candidates = view.legalCards;
  if (candidates.length === 1) return candidates[0] as Card;
  const now = options.now ?? (() => performance.now());
  const deadline = now() + budget.maxMillis;
  const random = fastRandom(randomInt(2 ** 31));
  const totals = candidates.map(() => 0);

  for (let deal = 0; deal < budget.playDeals; deal++) {
    if (deal > 0 && now() > deadline) break;
    const sim = playingSim(view, sampleDeal(view, budget, random));
    candidates.forEach((card, i) => {
      const copy = cloneSim(sim);
      playCard(copy, card);
      playOut(copy);
      totals[i] = (totals[i] as number) + scoreOf(copy, view.seat);
    });
  }
  return pickCard(view, candidates, totals);
}

/**
 * The best total wins. Ties (common with few deals): keep the highest card in hand, then play the
 * weaker card.
 */
export function pickCard(view: BotView, candidates: Card[], totals: number[]): Card {
  const trump = view.trumpSuit;
  const highest = Math.max(...view.hand.map((card) => strength(card, trump)));
  const order = candidates
    .map((card, i) => ({ card, total: totals[i] as number }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        Number(strength(a.card, trump) === highest) - Number(strength(b.card, trump) === highest) ||
        strength(a.card, trump) - strength(b.card, trump),
    );
  return (order[0] as { card: Card }).card;
}

/** The rest of the round from the bot's view, with `hands` as the guess at the hidden cards. */
function playingSim(view: BotView, hands: Card[][]): RoundSim {
  const tricksPlayed = view.tricksWon.reduce((sum, won) => sum + won, 0);
  return {
    playerCount: view.playerCount,
    trump: view.trumpSuit,
    hands,
    bids: view.bids.map((bid) => bid ?? 0),
    tricksWon: [...view.tricksWon],
    trick: [...view.trick.cards],
    leader: view.trick.leader,
    tricksLeft: view.round - tricksPlayed,
  };
}

/**
 * The bid, by simulation: each allowed bid is valued by its average round score, so the risk of
 * missing counts, not just the likely number of tricks. Every bid first gets a few deals; only
 * the close calls get the full budget (successive halving), on fresh deals: the first deals
 * picked the finalists, and counting them again favours a bid that got lucky there (with few
 * deals, mostly a high bid that happened to come off). All finalists see the same deals.
 */
export function searchBid(
  view: BotView,
  budget: SearchBudget,
  randomInt: RandomInt,
  options: SearchOptions = {},
): number {
  const candidates = Array.from({ length: view.round + 1 }, (_, bid) => bid).filter(
    (bid) => bid !== view.forbiddenBid,
  );
  const now = options.now ?? (() => performance.now());
  const deadline = now() + budget.maxMillis;
  const random = fastRandom(randomInt(2 ** 31));
  const deals: Card[][][] = [];
  const dealAt = (index: number) => {
    while (deals.length <= index) deals.push(sampleDeal(view, budget, random));
    return deals[index] as Card[][];
  };

  const totals = new Map(candidates.map((bid) => [bid, 0]));
  const counts = new Map(candidates.map((bid) => [bid, 0]));
  const average = (bid: number) =>
    (totals.get(bid) as number) / Math.max(1, counts.get(bid) as number);
  /** Deals `first` to `first + count - 1` for each of `bids`; stops early at the deadline. */
  const simulate = (bids: number[], first: number, count: number) => {
    for (let deal = first; deal < first + count; deal++) {
      if (deal > first && now() > deadline) return;
      for (const bid of bids) {
        const sim = biddingSim(view, dealAt(deal), bid);
        playOut(sim);
        totals.set(bid, (totals.get(bid) as number) + scoreOf(sim, view.seat));
        counts.set(bid, (counts.get(bid) as number) + 1);
      }
    }
  };

  // First look: a third of the budget for every bid.
  const firstLook = Math.max(4, Math.ceil(budget.bidDeals / 3));
  simulate(candidates, 0, firstLook);
  const ranked = [...candidates].sort((a, b) => average(b) - average(a));
  const best = average(ranked[0] as number);
  const finalists = ranked
    .filter((bid) => average(bid) >= best - BID_CUTOFF)
    .slice(0, BID_FINALISTS);
  // Then the full budget for the close calls, on fresh deals (unless the time is up).
  if (finalists.length > 1 && now() <= deadline) {
    for (const bid of finalists) {
      totals.set(bid, 0);
      counts.set(bid, 0);
    }
    simulate(finalists, firstLook, budget.bidDeals);
  }

  // Ties go to the bid closest to the hand's estimate.
  const expected = estimateTricks(view.hand, view.trumpSuit, view.playerCount, view.round);
  return finalists.sort(
    (a, b) => average(b) - average(a) || Math.abs(a - expected) - Math.abs(b - expected),
  )[0] as number;
}

/**
 * A round about to be played from the bot's bidding view, with `hands` as the guess at the hidden
 * cards and `bid` as the bot's bid. Players who haven't bid yet bid like `estimateBid`.
 */
function biddingSim(view: BotView, hands: Card[][], bid: number): RoundSim {
  const n = view.playerCount;
  const bids = [...view.bids];
  bids[view.seat] = bid;
  // Bidding goes round from the dealer's left and ends with the dealer.
  for (let i = 1; i <= n; i++) {
    const seat = (view.dealer + i) % n;
    if (bids[seat] !== null && bids[seat] !== undefined) continue;
    const others = bids.filter((b, s): b is number => s !== seat && b !== null && b !== undefined);
    const forbidden =
      view.noEvenBids && seat === view.dealer ? forbiddenLastBid(others, view.round) : null;
    bids[seat] = estimateBid(hands[seat] as Card[], view.trumpSuit, n, view.round, forbidden);
  }
  return {
    playerCount: n,
    trump: view.trumpSuit,
    hands: hands.map((hand) => [...hand]),
    bids: bids as number[],
    tricksWon: Array<number>(n).fill(0),
    trick: [],
    leader: (view.dealer + 1) % n,
    tricksLeft: view.round,
  };
}
