import { type Card, isJester, isWizard, type Suit, suitOf } from "./cards.js";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const DECK_SIZE = 60;

/** 3 → 20, 4 → 15, 5 → 12, 6 → 10 rounds. */
export function totalRounds(playerCount: number): number {
  return Math.floor(DECK_SIZE / playerCount);
}

export interface Deal {
  /** Indexed by seat. */
  hands: Card[][];
  /** Undealt cards; the first one (if any) is the face-up trump card. */
  rest: Card[];
}

/** Deals `cardsEach` cards to every seat, starting left of the dealer. */
export function deal(
  deck: readonly Card[],
  playerCount: number,
  dealer: number,
  cardsEach: number,
): Deal {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < playerCount; i++) {
    hands[(dealer + 1 + i) % playerCount] = deck.slice(i * cardsEach, (i + 1) * cardsEach);
  }
  return { hands, rest: deck.slice(playerCount * cardsEach) };
}

export type TrumpDecision =
  { kind: "suit"; suit: Suit } | { kind: "none" } | { kind: "dealerChooses" };

/** Trump from the face-up card: its suit; none for a Jester or no card (last round); dealer's choice for a Wizard. */
export function trumpFromCard(card: Card | null): TrumpDecision {
  if (card === null || isJester(card)) return { kind: "none" };
  if (isWizard(card)) return { kind: "dealerChooses" };
  return { kind: "suit", suit: suitOf(card) as Suit };
}

/**
 * With the "no even bids" rule, the bid the last bidder may not make, so that the total of all bids
 * differs from the number of tricks. `null` if no bid is forbidden.
 */
export function forbiddenLastBid(otherBids: readonly number[], tricks: number): number | null {
  const forbidden = tricks - otherBids.reduce((sum, bid) => sum + bid, 0);
  return forbidden >= 0 ? forbidden : null;
}
