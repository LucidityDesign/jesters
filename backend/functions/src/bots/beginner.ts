import {
  type Card,
  isJester,
  isWizard,
  rankOf,
  type Suit,
  suitOf,
  SUITS,
  trickWinner,
} from "../engine/index.js";
import type { BotView } from "./view.js";

// The beginner bot: simple rules of thumb, no card counting. It bids what its strong cards
// should win, then tries to take tricks while it needs them and to lose them otherwise.

/** Picks the suit it holds the most of (ties: the higher ranks). */
export function chooseTrump(view: BotView): Suit {
  const weight = (suit: Suit) =>
    view.hand
      .filter((card) => suitOf(card) === suit)
      .reduce((sum, card) => sum + 100 + (rankOf(card) ?? 0), 0);
  return SUITS.reduce((best, suit) => (weight(suit) > weight(best) ? suit : best));
}

/** Roughly how likely `card` is to win a trick when the bot holds it. */
export function winChance(card: Card, trump: Suit | null, playerCount: number): number {
  if (isWizard(card)) return 1;
  if (isJester(card)) return 0;
  const rank = rankOf(card) as number;
  // More players at the table means more cards that can beat this one.
  const crowd = 3 / playerCount;
  if (suitOf(card) === trump) {
    if (rank >= 12) return 0.9;
    if (rank >= 9) return 0.55 * crowd;
    return 0.25 * crowd;
  }
  if (rank === 14) return (trump === null ? 0.8 : 0.6) * crowd;
  if (rank === 13) return (trump === null ? 0.45 : 0.3) * crowd;
  return 0;
}

export function bid(view: BotView): number {
  const expected = view.hand.reduce(
    (sum, card) => sum + winChance(card, view.trumpSuit, view.playerCount),
    0,
  );
  const wanted = Math.min(view.round, Math.round(expected));
  if (wanted !== view.forbiddenBid) return wanted;
  // Not allowed: move towards what the hand is closer to, staying in 0…round.
  const up = wanted + 1 <= view.round && (expected >= wanted || wanted === 0);
  return up ? wanted + 1 : wanted - 1;
}

/** How strong `card` is in the current trick, for picking the weakest or strongest one. */
function strength(card: Card, view: BotView): number {
  if (isWizard(card)) return 100;
  if (isJester(card)) return 0;
  const rank = rankOf(card) as number;
  if (suitOf(card) === view.trumpSuit) return 50 + rank;
  return rank;
}

function wouldWinNow(card: Card, view: BotView): boolean {
  const cards = [...view.trick.cards, card];
  return trickWinner(cards, view.trumpSuit) === cards.length - 1;
}

export function play(view: BotView): Card {
  const byStrength = [...view.legalCards].sort((a, b) => strength(a, view) - strength(b, view));
  const weakest = byStrength[0] as Card;
  const strongest = byStrength.at(-1) as Card;
  const needsTricks = (view.bids[view.seat] ?? 0) > (view.tricksWon[view.seat] ?? 0);
  const leading = view.trick.cards.length === 0;

  if (needsTricks) {
    if (leading) return strongest;
    // The cheapest card that takes the trick so far, else throw away the weakest.
    return byStrength.find((card) => wouldWinNow(card, view)) ?? weakest;
  }
  if (leading) return weakest;
  // Get rid of the strongest card that still loses; if every card wins, the weakest.
  return byStrength.findLast((card) => !wouldWinNow(card, view)) ?? weakest;
}
