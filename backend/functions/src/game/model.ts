import type { Timestamp } from "firebase-admin/firestore";
import {
  type Card,
  type CompletedTrick,
  forbiddenBid,
  type GameState,
  legalCardsFor,
  type RoundResult,
  type Settings,
  type Suit,
} from "../engine/index.js";

// Firestore document shapes. Arrays named by seat are indexed by seat (= index in `players`).

export type GameStatus = "lobby" | GameState["phase"] | "abandoned";

export interface Player {
  uid: string;
  name: string;
}

export interface PublicRound {
  number: number;
  totalRounds: number;
  dealerSeat: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  bids: (number | null)[];
  tricksWon: number[];
  handSizes: number[];
}

export interface PublicTrick {
  leaderSeat: number;
  cards: Card[];
}

export interface PublicLastTrick extends PublicTrick {
  winnerSeat: number;
}

/** The fields of `games/{gameId}` that are derived from the engine state. */
export interface PublicPlay {
  status: GameStatus;
  round: PublicRound | null;
  trick: PublicTrick | null;
  lastTrick: PublicLastTrick | null;
  turnSeat: number | null;
  turnUid: string | null;
  results: RoundResult[];
}

/** `games/{gameId}`: readable by the players of the game. */
export interface GameDoc extends PublicPlay {
  roomKey: string;
  hostUid: string;
  settings: Settings;
  players: Player[];
  playerUids: string[];
  /** False once finished or abandoned. Used for "my active games" queries. */
  active: boolean;
  /** Incremented on every change; clients may send it to detect stale views. */
  version: number;
  abandonedBy?: string;
  /** Set when the game was closed automatically after a long time without a move. */
  expired?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** When the current player's turn started (for reminders). */
  turnSince: Timestamp | null;
  /** When the last turn reminder was sent (see notify/reminders.ts). */
  lastReminderAt?: Timestamp;
}

/** `games/{gameId}/hands/{uid}`: readable only by that player. */
export interface HandDoc {
  cards: Card[];
  /** Cards that may be played now; empty when it is not this player's turn to play. */
  legalCards: Card[];
  /** The bid this player may not make now ("no even bids"), or null. */
  forbiddenBid: number | null;
}

/** `games/{gameId}/secret/state`: not readable by clients. */
export interface SecretDoc {
  /** Engine `GameState` as JSON (Firestore cannot store nested arrays). */
  state: string;
  schema: 1;
}

export function lobbyPlay(): PublicPlay {
  return {
    status: "lobby",
    round: null,
    trick: null,
    lastTrick: null,
    turnSeat: null,
    turnUid: null,
    results: [],
  };
}

export function publicPlay(state: GameState, playerUids: readonly string[]): PublicPlay {
  return {
    status: state.phase,
    round: {
      number: state.round,
      totalRounds: state.totalRounds,
      dealerSeat: state.dealer,
      trumpCard: state.trumpCard,
      trumpSuit: state.trumpSuit,
      bids: state.bids,
      tricksWon: state.tricksWon,
      handSizes: state.hands.map((hand) => hand.length),
    },
    trick: { leaderSeat: state.trick.leader, cards: state.trick.cards },
    lastTrick: state.lastTrick === null ? null : lastTrick(state.lastTrick),
    turnSeat: state.turn,
    turnUid: state.turn === null ? null : (playerUids[state.turn] ?? null),
    results: state.results,
  };
}

function lastTrick(trick: CompletedTrick): PublicLastTrick {
  return { leaderSeat: trick.leader, cards: trick.cards, winnerSeat: trick.winner };
}

export function handDoc(state: GameState, seat: number): HandDoc {
  return {
    cards: state.hands[seat] ?? [],
    legalCards: legalCardsFor(state, seat),
    forbiddenBid: state.turn === seat ? forbiddenBid(state, seat) : null,
  };
}

export function secretDoc(state: GameState): SecretDoc {
  return { state: JSON.stringify(state), schema: 1 };
}

export function stateFromSecret(doc: SecretDoc): GameState {
  return JSON.parse(doc.state) as GameState;
}
