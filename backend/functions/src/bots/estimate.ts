import { type Card, rankOf, type Suit, suitOf } from "../engine/index.js";
import { WIN_RATES } from "./calibration.js";

// Trick estimates from simulated games (see `calibration.ts`), for the search bots: how the
// other players are likely to bid, and whether a guessed hand fits a player's bid.

/** Groups of round sizes (cards per player) that the win rates are recorded for. */
export const ROUND_BUCKETS = [2, 5, 10, 20] as const;

/** Index into `ROUND_BUCKETS` for a round of `round` cards. */
export function roundBucket(round: number): number {
  const index = ROUND_BUCKETS.findIndex((max) => round <= max);
  return index === -1 ? ROUND_BUCKETS.length - 1 : index;
}

/** What a card is, for looking up its win rate: trump, a plain card with or without a trump. */
export type CardKind = "wizard" | "jester" | "trump" | "side" | "noTrump";

export function cardKind(card: Card, trump: Suit | null): CardKind {
  if (card[0] === "W") return "wizard";
  if (card[0] === "J") return "jester";
  if (trump === null) return "noTrump";
  return suitOf(card) === trump ? "trump" : "side";
}

/** How often `card` won the trick it was played to, in simulated rounds like this one. */
export function winRate(
  card: Card,
  trump: Suit | null,
  playerCount: number,
  round: number,
): number {
  const rates = WIN_RATES[playerCount - 3]?.[roundBucket(round)];
  if (!rates) return 0;
  const kind = cardKind(card, trump);
  if (kind === "wizard" || kind === "jester") return rates[kind];
  return rates[kind][(rankOf(card) as number) - 2] ?? 0;
}

/** The tricks a hand is expected to win. */
export function estimateTricks(
  hand: readonly Card[],
  trump: Suit | null,
  playerCount: number,
  round: number,
): number {
  return hand.reduce((sum, card) => sum + winRate(card, trump, playerCount, round), 0);
}

/**
 * The bid a player makes with `hand` in the simulations: the expected tricks, rounded, avoiding
 * `forbidden` towards the side the estimate leans to.
 */
export function estimateBid(
  hand: readonly Card[],
  trump: Suit | null,
  playerCount: number,
  round: number,
  forbidden: number | null,
): number {
  const expected = estimateTricks(hand, trump, playerCount, round);
  const bid = Math.max(0, Math.min(round, Math.round(expected)));
  if (bid !== forbidden) return bid;
  const up = bid + 1 <= round && (expected >= bid || bid === 0);
  return up ? bid + 1 : bid - 1;
}
