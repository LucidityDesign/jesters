/** Hearts, diamonds, clubs, spades. */
export const SUITS = ["H", "D", "C", "S"] as const;
export type Suit = (typeof SUITS)[number];

export const MIN_RANK = 2;
/** Ace. */
export const MAX_RANK = 14;
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/**
 * Compact card encoding, also used in Firestore and by the app:
 * `"H14"` = ace of hearts, `"S2"` = two of spades, `"W1"`–`"W4"` = Wizards, `"J1"`–`"J4"` = Jesters.
 */
export type Card = `${Suit}${Rank}` | `W${1 | 2 | 3 | 4}` | `J${1 | 2 | 3 | 4}`;

export type ParsedCard =
  { kind: "suit"; suit: Suit; rank: Rank } | { kind: "wizard" } | { kind: "jester" };

const CARD_PATTERN = /^(?:[HDCS](?:[2-9]|1[0-4])|[WJ][1-4])$/;

export function isCard(value: unknown): value is Card {
  return typeof value === "string" && CARD_PATTERN.test(value);
}

export function parseCard(card: Card): ParsedCard {
  const prefix = card[0];
  if (prefix === "W") return { kind: "wizard" };
  if (prefix === "J") return { kind: "jester" };
  return { kind: "suit", suit: prefix as Suit, rank: Number(card.slice(1)) as Rank };
}

export function isWizard(card: Card): boolean {
  return card[0] === "W";
}

export function isJester(card: Card): boolean {
  return card[0] === "J";
}

/** The suit of a regular card; `null` for Wizards and Jesters. */
export function suitOf(card: Card): Suit | null {
  const parsed = parseCard(card);
  return parsed.kind === "suit" ? parsed.suit : null;
}

/** The rank of a regular card; `null` for Wizards and Jesters. */
export function rankOf(card: Card): Rank | null {
  const parsed = parseCard(card);
  return parsed.kind === "suit" ? parsed.rank : null;
}

/** All 60 cards in a fixed order. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= MAX_RANK; rank++) {
      deck.push(`${suit}${rank as Rank}`);
    }
  }
  for (const n of [1, 2, 3, 4] as const) {
    deck.push(`W${n}`, `J${n}`);
  }
  return deck;
}

/** Returns an integer in `[0, maxExclusive)`. In production this is `crypto.randomInt`. */
export type RandomInt = (maxExclusive: number) => number;

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}
