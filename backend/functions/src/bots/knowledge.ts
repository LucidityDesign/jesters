import {
  type Card,
  type CompletedTrick,
  createDeck,
  ledSuit,
  type RandomInt,
  type Suit,
  shuffle,
  suitOf,
} from "../engine/index.js";
import { estimateTricks } from "./estimate.js";
import { type RoundSim, rolloutCard, winsNow } from "./sim.js";
import type { BotView } from "./view.js";

// What a bot can work out about the hidden cards from the table, and random deals of them that
// fit it (determinization). Only public information goes in: the bot's own hand, the trump card,
// the cards played, who failed to follow suit, and the bids.

/** Cards the bot hasn't seen: not in its hand, not the trump card, not played this round. */
export function unseenCards(view: BotView): Card[] {
  const seen = new Set<Card>([
    ...view.hand,
    ...view.roundTricks.flatMap((trick) => trick.cards),
    ...view.trick.cards,
  ]);
  if (view.trumpCard) seen.add(view.trumpCard);
  return createDeck().filter((card) => !seen.has(card));
}

/** How many cards each seat holds now. */
export function handSizes(view: BotView): number[] {
  // From the tricks won rather than `roundTricks`, which older games only have in part.
  const tricksPlayed = view.tricksWon.reduce((sum, won) => sum + won, 0);
  const sizes = Array<number>(view.playerCount).fill(view.round - tricksPlayed);
  view.trick.cards.forEach((_, i) => {
    const seat = (view.trick.leader + i) % view.playerCount;
    sizes[seat] = (sizes[seat] as number) - 1;
  });
  return sizes;
}

/**
 * The suits each seat can't hold any more: those they didn't follow with a plain card. (Wizards and
 * Jesters may always be played, so they say nothing.)
 */
export function knownVoids(view: BotView): Set<Suit>[] {
  const voids = Array.from({ length: view.playerCount }, () => new Set<Suit>());
  for (const trick of [...view.roundTricks, view.trick]) {
    trick.cards.forEach((card, i) => {
      const led = ledSuit(trick.cards.slice(0, i));
      const suit = suitOf(card);
      if (led !== null && suit !== null && suit !== led) {
        voids[(trick.leader + i) % view.playerCount]?.add(led);
      }
    });
  }
  return voids;
}

export interface DealOptions {
  /** Prefer deals in which each opponent's hand fits their bid (the Hard bot). */
  fitBids: boolean;
  /**
   * Also prefer deals in which the others' earlier plays this round make sense (see `playMisfit`):
   * how much one play that doesn't counts against a deal, next to bids that don't fit by a trick.
   * 0 or unset: plays only tell which suits a player has run out of.
   */
  fitPlays?: number;
}

/** One card another player played this round, with what they knew when they played it. */
interface PastPlay {
  seat: number;
  card: Card;
  /** The cards already in the trick. */
  before: Card[];
  leader: number;
  tricksWon: number[];
  tricksLeft: number;
  /** The cards this seat played from this one on, so its hand back then is its hand now plus these. */
  playedSince: Card[];
}

/**
 * The others' plays this round that followed a card already in the trick (leads say too little).
 * Empty when the round's earlier tricks are missing (games from older versions).
 */
function pastPlays(view: BotView): PastPlay[] {
  const completed = view.tricksWon.reduce((sum, won) => sum + won, 0);
  if (view.roundTricks.length !== completed) return [];
  const n = view.playerCount;
  const tricks = [...view.roundTricks, view.trick];
  const plays: PastPlay[] = [];
  const tricksWon = Array<number>(n).fill(0);
  tricks.forEach((trick, t) => {
    trick.cards.forEach((card, i) => {
      const seat = (trick.leader + i) % n;
      if (seat === view.seat || i === 0) return;
      const playedSince = tricks
        .slice(t)
        .flatMap((later, laterIndex) =>
          later.cards.filter(
            (_, j) => (later.leader + j) % n === seat && (laterIndex > 0 || j >= i),
          ),
        );
      plays.push({
        seat,
        card,
        before: trick.cards.slice(0, i),
        leader: trick.leader,
        tricksWon: [...tricksWon],
        tricksLeft: view.round - t,
        playedSince,
      });
    });
    const winner = (trick as Partial<CompletedTrick>).winner;
    if (winner !== undefined) tricksWon[winner] = (tricksWon[winner] as number) + 1;
  });
  return plays;
}

/**
 * How many of the others' plays this round the rollout policy (`sim.ts`) would not have made with
 * the hands in `hands`: it would have taken the trick where they let it go, or the other way round.
 * A deal in which a player who still needed tricks ducked while holding a cheap winner is less
 * likely than one in which they had none.
 */
export function playMisfit(view: BotView, hands: Card[][], plays = pastPlays(view)): number {
  let misfit = 0;
  for (const play of plays) {
    const hand = [...(hands[play.seat] as Card[]), ...play.playedSince];
    const sim: RoundSim = {
      playerCount: view.playerCount,
      trump: view.trumpSuit,
      hands: Array.from({ length: view.playerCount }, (_, seat) =>
        seat === play.seat ? hand : [],
      ),
      bids: view.bids as number[],
      tricksWon: play.tricksWon,
      trick: play.before,
      leader: play.leader,
      tricksLeft: play.tricksLeft,
    };
    const expected = rolloutCard(sim);
    if (
      winsNow(play.before, expected, view.trumpSuit) !==
      winsNow(play.before, play.card, view.trumpSuit)
    ) {
      misfit++;
    }
  }
  return misfit;
}

/**
 * One guess at everyone's hand, by seat (the bot's own hand as it is), consistent with what the
 * table has shown. Constraints that no deal satisfies are dropped (bids first, then voids), so
 * there is always a deal.
 */
export function sampleDeal(view: BotView, options: DealOptions, randomInt: RandomInt): Card[][] {
  const unseen = unseenCards(view);
  const sizes = handSizes(view);
  const voids = knownVoids(view);
  const opponents = sizes
    .map((_, seat) => seat)
    .filter((seat) => seat !== view.seat)
    // The most constrained players first, so they still find cards that fit.
    .sort((a, b) => (voids[b] as Set<Suit>).size - (voids[a] as Set<Suit>).size);

  const dealOnce = (respectVoids: boolean): Card[][] | null => {
    const pool = shuffle(unseen, randomInt);
    const hands: Card[][] = sizes.map(() => []);
    hands[view.seat] = [...view.hand];
    for (const seat of opponents) {
      const hand = hands[seat] as Card[];
      const blocked = voids[seat] as Set<Suit>;
      for (let i = 0; i < pool.length && hand.length < (sizes[seat] as number); ) {
        const card = pool[i] as Card;
        const suit = suitOf(card);
        if (respectVoids && suit !== null && blocked.has(suit)) {
          i++;
        } else {
          hand.push(card);
          pool.splice(i, 1);
        }
      }
      if (hand.length < (sizes[seat] as number)) return null;
    }
    return hands;
  };

  const consistent = () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const hands = dealOnce(true);
      if (hands) return hands;
    }
    return dealOnce(false) as Card[][];
  };

  if (!options.fitBids) return consistent();
  // Keep the deal whose hands fit the bids (and plays) best; the tolerance for bids widens as
  // attempts fail.
  const playWeight = options.fitPlays ?? 0;
  const plays = playWeight > 0 ? pastPlays(view) : [];
  const misfitOf = (hands: Card[][], extraTolerance: number) =>
    bidMisfit(view, hands, extraTolerance) +
    (plays.length > 0 ? playWeight * playMisfit(view, hands, plays) : 0);
  let best = consistent();
  let bestMisfit = misfitOf(best, 0);
  for (let attempt = 1; attempt < 30 && bestMisfit > 0; attempt++) {
    const hands = consistent();
    const misfit = misfitOf(hands, Math.floor(attempt / 10) * 0.5);
    if (misfit < bestMisfit) {
      best = hands;
      bestMisfit = misfit;
    }
  }
  return best;
}

/** How far the dealt hands are from what their owners bid, beyond a tolerance of 1.5 tricks. */
function bidMisfit(view: BotView, hands: Card[][], extraTolerance: number): number {
  let misfit = 0;
  hands.forEach((hand, seat) => {
    const bid = view.bids[seat];
    if (seat === view.seat || bid === null || bid === undefined) return;
    const stillNeeded = bid - (view.tricksWon[seat] ?? 0);
    const expected = estimateTricks(hand, view.trumpSuit, view.playerCount, view.round);
    misfit += Math.max(0, Math.abs(expected - stillNeeded) - 1.5 - extraTolerance);
  });
  return misfit;
}
