import { type Card, isJester, isWizard, parseCard, type Suit, suitOf } from "./cards.js";

/**
 * The suit players must follow, given the cards played so far (in play order).
 * `null` if any card may be played: nothing led yet, only Jesters so far,
 * or a Wizard was the first non-Jester card.
 */
export function ledSuit(trick: readonly Card[]): Suit | null {
  for (const card of trick) {
    if (isJester(card)) continue;
    return suitOf(card);
  }
  return null;
}

/**
 * Cards from `hand` that may be played to `trick`. A player holding the led suit must follow it;
 * Wizards and Jesters may always be played.
 */
export function legalCards(hand: readonly Card[], trick: readonly Card[]): Card[] {
  const led = ledSuit(trick);
  if (led === null || !hand.some((card) => suitOf(card) === led)) {
    return [...hand];
  }
  return hand.filter((card) => suitOf(card) === led || isWizard(card) || isJester(card));
}

/**
 * Index (in play order) of the card that wins a complete trick:
 * the first Wizard, else the highest trump, else the highest card of the led suit;
 * if only Jesters were played, the first Jester.
 */
export function trickWinner(trick: readonly Card[], trump: Suit | null): number {
  if (trick.length === 0) {
    throw new Error("trickWinner: empty trick");
  }
  const firstWizard = trick.findIndex(isWizard);
  if (firstWizard !== -1) return firstWizard;

  const led = ledSuit(trick);
  if (led === null) return 0; // only Jesters

  const highestOf = (suit: Suit): number => {
    let best = -1;
    let bestRank = 0;
    trick.forEach((card, index) => {
      const parsed = parseCard(card);
      if (parsed.kind === "suit" && parsed.suit === suit && parsed.rank > bestRank) {
        best = index;
        bestRank = parsed.rank;
      }
    });
    return best;
  };

  if (trump !== null) {
    const bestTrump = highestOf(trump);
    if (bestTrump !== -1) return bestTrump;
  }
  return highestOf(led);
}
