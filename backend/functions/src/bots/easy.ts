import {
  type Card,
  isJester,
  isWizard,
  rankOf,
  SUITS,
  type Suit,
  suitOf,
  trickWinner,
} from "../engine/index.js";
import type { BotView } from "./view.js";

// The easy bot: simple rules of thumb, no card counting. It bids what its strong cards
// should win, given what the others have bid, then tries to take tricks while it needs them and
// to lose them otherwise. Its aggression (-0.1 to 0.1) makes it bid higher or lower and take
// tricks with stronger or cheaper cards; while playing, the total of the bids shifts it.

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

/**
 * How much the other players' bids crowd this bot's uncertain cards: below 1 when they have bid
 * more than their share of the tricks, above 1 when less. Players yet to bid count with their
 * share.
 */
export function bidPressure(view: BotView): number {
  const share = view.round / view.playerCount;
  const others = view.bids.filter((_, seat) => seat !== view.seat);
  const claimed = others.reduce<number>((sum, bid) => sum + (bid ?? share), 0);
  const ratio = claimed / (share * others.length);
  return Math.min(1.5, Math.max(0.5, 1 - 0.8 * (ratio - 1)));
}

/** How many tricks the hand should win, given the bids so far. */
export function expectedTricks(view: BotView): number {
  // Tuned in simulations: without it the bot underbids at 3 players and overbids at 6.
  const scale = 1.2 * Math.sqrt(3 / view.playerCount) * bidPressure(view);
  return view.hand.reduce((sum, card) => {
    const chance = winChance(card, view.trumpSuit, view.playerCount);
    // Wizards and Jesters are certain; only the other cards depend on the table.
    return sum + (chance === 0 || chance === 1 ? chance : Math.min(1, chance * scale));
  }, 0);
}

export function bid(view: BotView): number {
  const expected = expectedTricks(view) * (1 + view.aggression) + view.aggression;
  const wanted = Math.max(0, Math.min(view.round, Math.round(expected)));
  if (wanted !== view.forbiddenBid) return wanted;
  // Not allowed: move towards what the hand is closer to, staying in 0…round.
  const up = wanted + 1 <= view.round && (expected >= wanted || wanted === 0);
  return up ? wanted + 1 : wanted - 1;
}

/** How strong `card` is in the current trick, for picking the weakest or strongest one. */
export function strength(card: Card, view: BotView): number {
  if (isWizard(card)) return 100;
  if (isJester(card)) return 0;
  const rank = rankOf(card) as number;
  if (suitOf(card) === view.trumpSuit) return 50 + rank;
  return rank;
}

export function wouldWinNow(card: Card, view: BotView): boolean {
  const cards = [...view.trick.cards, card];
  return trickWinner(cards, view.trumpSuit) === cards.length - 1;
}

/**
 * The bot's aggression while playing, shifted by the table: more bids than cards means tricks
 * are fought over (more aggressive), fewer means spare tricks to go round (more cautious). A
 * round bid a third over or under its cards shifts it by 0.1.
 */
export function playingAggression(view: BotView): number {
  const totalBids = view.bids.reduce<number>((sum, bid) => sum + (bid ?? 0), 0);
  return view.aggression + (0.3 * (totalBids - view.round)) / view.round;
}

export function play(view: BotView): Card {
  const byStrength = [...view.legalCards].sort((a, b) => strength(a, view) - strength(b, view));
  const weakest = byStrength[0] as Card;
  const strongest = byStrength.at(-1) as Card;
  const needsTricks = (view.bids[view.seat] ?? 0) > (view.tricksWon[view.seat] ?? 0);
  const leading = view.trick.cards.length === 0;
  const playingLast = view.trick.cards.length === view.playerCount - 1;
  // A Jester is the safest way to lose a trick later, worth more than any card but a Wizard
  // (tested in simulations): when a trick is lost anyway, give up the weakest other card.
  const discard = byStrength.find((card) => !isJester(card) && !isWizard(card));

  if (needsTricks) {
    if (leading) return strongest;
    const winners = byStrength.filter((card) => wouldWinNow(card, view));
    if (winners.length === 0) return discard ?? weakest;
    // Last to play: the cheapest winner is enough. Otherwise a later player may still beat it:
    // aggressive bots play a stronger card to be sure, cautious ones keep their strong cards.
    if (playingLast) return winners[0] as Card;
    const pick = Math.min(1, Math.max(0, 0.5 + 5 * playingAggression(view)));
    return winners[Math.round(pick * (winners.length - 1))] as Card;
  }
  if (leading) {
    // A low card of a side suit rarely wins; keep the Jester for a trick that is harder to lose.
    const low = byStrength.find(
      (card) => !isJester(card) && suitOf(card) !== view.trumpSuit && (rankOf(card) ?? 99) <= 5,
    );
    return low ?? weakest;
  }
  // Get rid of the strongest card that still loses; if every card wins, the weakest.
  return byStrength.findLast((card) => !wouldWinNow(card, view)) ?? weakest;
}
