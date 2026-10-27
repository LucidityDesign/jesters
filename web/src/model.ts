// Mirrors the Firestore documents written by the backend (backend/functions/src/game/model.ts).
// Arrays described "by seat" are indexed by seat, the index in `players`.

export type Suit = "H" | "S" | "D" | "C";
export const SUITS: readonly Suit[] = ["H", "S", "D", "C"];

/** A card in the server's compact encoding: "H14" (ace of hearts), "W1" (Wizard), "J1" (Jester). */
export type Card = string;

export type GameStatus =
  "lobby" | "choosingTrump" | "bidding" | "playing" | "finished" | "abandoned";

export interface Player {
  uid: string;
  /** Empty once the player has deleted their data. */
  name: string;
  /** Set for computer players; the server makes their moves. */
  bot?: "beginner";
}

export interface PublicRound {
  number: number;
  totalRounds: number;
  dealerSeat: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  /** By seat; null until that player has bid. */
  bids: (number | null)[];
  tricksWon: number[];
  handSizes: number[];
}

export interface PublicTrick {
  leaderSeat: number;
  /** In play order, starting with the leader. */
  cards: Card[];
}

export interface LastTrick extends PublicTrick {
  winnerSeat: number;
}

export interface RoundResult {
  round: number;
  bids: number[];
  won: number[];
  deltas: number[];
  totals: number[];
}

/** `games/{gameId}` */
export interface GameDoc {
  status: GameStatus;
  roomKey: string;
  hostUid: string;
  settings: { noEvenBids: boolean };
  players: Player[];
  playerUids: string[];
  active: boolean;
  version: number;
  round: PublicRound | null;
  trick: PublicTrick | null;
  lastTrick: LastTrick | null;
  turnSeat: number | null;
  turnUid: string | null;
  results: RoundResult[];
  abandonedBy?: string;
  /** Closed automatically after a long time without a move. */
  expired?: boolean;
}

/** `games/{gameId}/hands/{uid}`, readable only by that player. */
export interface HandDoc {
  cards: Card[];
  /** Cards that may be played now; empty unless it is this player's turn to play. */
  legalCards: Card[];
  /** The bid this player may not make now ("no even bids"), or null. */
  forbiddenBid: number | null;
}

export function isRunning(status: GameStatus): boolean {
  return status === "choosingTrump" || status === "bidding" || status === "playing";
}

export function isMyTurn(game: GameDoc, uid: string): boolean {
  return game.active && game.turnUid === uid;
}

/**
 * The last completed trick, while it belongs to the current round. A new round starts with an
 * empty table: the server keeps the previous round's last trick, but it is not shown.
 */
export function lastTrickOfRound(game: GameDoc): LastTrick | null {
  const tricksPlayed = game.round?.tricksWon.reduce((sum, won) => sum + won, 0) ?? 0;
  return tricksPlayed > 0 ? game.lastTrick : null;
}

/** How the player did in a round. */
export interface RoundSummary {
  round: number;
  bid: number;
  won: number;
  points: number;
}

/** How `uid` did in the most recently scored round, or null before the first one. */
export function lastRoundSummary(game: GameDoc, uid: string): RoundSummary | null {
  const seat = game.playerUids.indexOf(uid);
  const result = game.results.at(-1);
  if (seat === -1 || !result) return null;
  return {
    round: result.round,
    bid: result.bids[seat] ?? 0,
    won: result.won[seat] ?? 0,
    points: result.deltas[seat] ?? 0,
  };
}

/** Current total score by seat. */
export function totals(game: GameDoc): number[] {
  return game.results.at(-1)?.totals ?? game.players.map(() => 0);
}

/** Seats with the highest total. */
export function leaders(game: GameDoc): number[] {
  const scores = totals(game);
  const best = Math.max(...scores);
  return scores.flatMap((score, seat) => (score === best ? [seat] : []));
}

export type CardKind =
  { type: "regular"; suit: Suit; rank: number } | { type: "wizard" } | { type: "jester" };

type RegularKind = Extract<CardKind, { type: "regular" }>;

export function cardKind(card: Card): CardKind {
  const letter = card[0];
  if (letter === "W") return { type: "wizard" };
  if (letter === "J") return { type: "jester" };
  return { type: "regular", suit: letter as Suit, rank: Number(card.slice(1)) };
}

/**
 * Index (in play order) of the card taking the trick so far: the first Wizard, else the highest
 * trump, else the highest card of the led suit; with only Jesters, the first one. As in the
 * backend's `trickWinner`. `null` for an empty trick.
 */
export function trickLeader(cards: readonly Card[], trump: Suit | null): number | null {
  if (cards.length === 0) return null;
  const kinds = cards.map(cardKind);
  const firstWizard = kinds.findIndex((kind) => kind.type === "wizard");
  if (firstWizard !== -1) return firstWizard;
  const led = kinds.find((kind): kind is RegularKind => kind.type === "regular")?.suit;
  if (led === undefined) return 0;
  const highestOf = (suit: Suit): number =>
    kinds.reduce(
      (best, kind, index) =>
        kind.type === "regular" &&
        kind.suit === suit &&
        (best === -1 || kind.rank > (kinds[best] as RegularKind).rank)
          ? index
          : best,
      -1,
    );
  const bestTrump = trump === null ? -1 : highestOf(trump);
  return bestTrump !== -1 ? bestTrump : highestOf(led);
}

/** Wizards first, then the suits by rank (highest first), Jesters last. */
export function sortHand(cards: readonly Card[]): Card[] {
  const key = (card: Card): number[] => {
    const kind = cardKind(card);
    switch (kind.type) {
      case "wizard":
        return [0, 0, Number(card.slice(1))];
      case "regular":
        return [1, SUITS.indexOf(kind.suit), -kind.rank];
      case "jester":
        return [2, 0, Number(card.slice(1))];
    }
  };
  return [...cards].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < ka.length; i++) {
      const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
