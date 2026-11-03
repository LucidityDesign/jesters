import type { Timestamp } from "firebase-admin/firestore";
import { type BotLevel, normalizeLevel } from "../bots/index.js";
import {
  type Card,
  type CompletedTrick,
  forbiddenBid,
  type GameState,
  legalCardsFor,
  type RandomInt,
  type RoundResult,
  reduce,
  type Settings,
  type Suit,
} from "../engine/index.js";

// Firestore document shapes. Arrays named by seat are indexed by seat (= index in `players`).

export type GameStatus = "lobby" | GameState["phase"] | "abandoned";

export interface Player {
  uid: string;
  /** Empty once the player has deleted their data. */
  name: string;
  /** Set for computer players, which the server moves for. Older games may hold `"beginner"` (= easy). */
  bot?: BotLevel | "beginner";
  /** A bot's temperament, -0.1 (cautious) to 0.1 (aggressive): how high it bids and how it plays. */
  aggression?: number;
  /** Set for a person who left the running game: a bot plays their seat until the end. */
  left?: boolean;
}

/**
 * A person's auto-play: a bot plays for them until they take over, until `until`, or through
 * round `untilRound`.
 */
export interface AutoPlay {
  until?: Timestamp;
  untilRound?: number;
}

/**
 * How long a person's turn may wait before the others are asked whether a bot should make that
 * move (see `letBotMove`).
 */
export const STALL_MS = 30 * 60 * 1000;

/** Points a person loses for each stalled move the others hand to a bot, if the host chose so. */
export const STALL_PENALTY = 5;

/** The rules of a game: the engine's, plus the table's own. */
export interface GameSettings extends Settings {
  /** Whether a person loses `STALL_PENALTY` points for each stalled move handed to a bot. */
  stallPenalty?: boolean;
}

/** The bot level that plays for people on auto-play (or who left). People can't choose it. */
export const AUTO_PLAY_LEVEL: BotLevel = "medium";

/**
 * Whether `uid`'s auto-play covers a turn that began at `at` (ms) in round `round`. The turn's
 * start decides, so a turn either is played by the bot or notifies the person, never neither.
 */
export function autoPlays(
  game: Partial<Pick<GameDoc, "autoPlay">>,
  uid: string,
  round: number,
  at: number,
): boolean {
  const auto = game.autoPlay?.[uid];
  if (!auto) return false;
  if (auto.until && at >= auto.until.toMillis()) return false;
  return auto.untilRound === undefined || round <= auto.untilRound;
}

/**
 * The level of the bot that moves now in a running game: a computer player's, or the one playing
 * for a person on auto-play. `null` when a person is to move.
 */
export function botToMove(
  game: Pick<GameDoc, "active" | "players" | "turnSeat"> &
    Partial<Pick<GameDoc, "autoPlay" | "round" | "updatedAt" | "version" | "botMoveVersion">>,
): BotLevel | null {
  if (!game.active || game.turnSeat === null) return null;
  const player = game.players[game.turnSeat];
  if (!player) return null;
  if (player.bot) return normalizeLevel(player.bot) ?? "easy";
  // A person who left, or whose stalled turn the others handed to a bot.
  if (player.left) return AUTO_PLAY_LEVEL;
  if (game.botMoveVersion !== undefined && game.botMoveVersion === game.version) {
    return AUTO_PLAY_LEVEL;
  }
  const turnBegan = game.updatedAt?.toMillis() ?? Date.now();
  return autoPlays(game, player.uid, game.round?.number ?? 1, turnBegan) ? AUTO_PLAY_LEVEL : null;
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
  settings: GameSettings;
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
  /** When each person last made a move here, by uid (see notify/messages.ts). */
  lastMoveAt?: Record<string, Timestamp>;
  /** People who let a bot play for them, by uid (see `setAutoPlay`). */
  autoPlay?: Record<string, AutoPlay>;
  /** The rounds in which a bot moved for a person on auto-play, by uid (for the score sheet). */
  autoPlayedRounds?: Record<string, number[]>;
  /** The new game for playing again, once someone started it after this one (see `playAgain`). */
  rematch?: Rematch;
  /** Points lost for stalled moves, by uid and then by round (see `letBotMove`). */
  stallPenalties?: Record<string, Record<string, number>>;
  /** The version whose waiting move another player handed to a bot (see `letBotMove`). */
  botMoveVersion?: number;
  /** The version whose stalled turn the others were asked about (see `askAboutStalledTurns`). */
  stallAskedVersion?: number;
}

export interface Rematch {
  gameId: string;
  /** Who started it, the new game's host. */
  hostUid: string;
  /** Who went to the new game from this one, the host first. */
  uids: string[];
}

/** `games/{gameId}/hands/{uid}`: readable only by that player. */
export interface HandDoc {
  cards: Card[];
  /** Cards that may be played now; empty when it is not this player's turn to play. */
  legalCards: Card[];
  /** The bid this player may not make now ("no even bids"), or null. */
  forbiddenBid: number | null;
  /** The bid this player queued for the current round before their turn, or null. */
  queuedBid?: QueuedBid | null;
}

/**
 * A bid a person chose before their turn, placed for them as soon as it is their turn. `rejected`
 * once the rules ruled it out then ("no even bids"): the person has to bid again themselves.
 */
export interface QueuedBid {
  round: number;
  bid: number;
  rejected?: true;
}

/** `games/{gameId}/secret/state`: not readable by clients. */
export interface SecretDoc {
  /** Engine `GameState` as JSON (Firestore cannot store nested arrays). */
  state: string;
  schema: 1;
  /** Bids queued by uid, kept secret until they are placed. */
  queuedBids?: Record<string, QueuedBid>;
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

export function handDoc(state: GameState, seat: number, queued?: QueuedBid): HandDoc {
  return {
    cards: state.hands[seat] ?? [],
    legalCards: legalCardsFor(state, seat),
    forbiddenBid: state.turn === seat ? forbiddenBid(state, seat) : null,
    queuedBid: queued ?? null,
  };
}

/** Whether `seat` may still queue a bid: bidding (or the trump choice before it) and no bid yet. */
export function canQueueBid(state: GameState, seat: number): boolean {
  return (
    (state.phase === "bidding" || state.phase === "choosingTrump") && state.bids[seat] === null
  );
}

/**
 * Places the queued bids of whoever's turn it is, one after another, until it is the turn of
 * someone without one. A queued bid the rules rule out is kept as `rejected` and stops there: that
 * person bids again themselves. Drops queued bids that no longer apply (placed, or an old round).
 */
export function applyQueuedBids(
  state: GameState,
  playerUids: readonly string[],
  queued: Readonly<Record<string, QueuedBid>>,
  random: RandomInt,
): { state: GameState; queued: Record<string, QueuedBid> } {
  const keep = (s: GameState) =>
    Object.fromEntries(
      Object.entries(queued).filter(([uid, q]) => {
        const seat = playerUids.indexOf(uid);
        return seat >= 0 && q.round === s.round && canQueueBid(s, seat);
      }),
    );
  let next = state;
  let left = keep(next);
  while (next.phase === "bidding" && next.turn !== null) {
    const uid = playerUids[next.turn];
    const q = uid === undefined ? undefined : left[uid];
    if (uid === undefined || !q || q.rejected) break;
    const result = reduce(next, { type: "bid", seat: next.turn, bid: q.bid }, random);
    if (!result.ok) {
      left = { ...left, [uid]: { ...q, rejected: true } };
      break;
    }
    next = result.state;
    left = keep(next);
  }
  return { state: next, queued: left };
}

export function secretDoc(state: GameState): SecretDoc {
  return { state: JSON.stringify(state), schema: 1 };
}

export function stateFromSecret(doc: SecretDoc): GameState {
  const state = JSON.parse(doc.state) as GameState;
  // Games saved before the engine kept the round's tricks start their history late.
  return { ...state, roundTricks: state.roundTricks ?? [] };
}

/** The points `uid` lost for stalled moves, in rounds up to `round` (all rounds by default). */
export function penaltyOf(
  game: Pick<GameDoc, "stallPenalties">,
  uid: string,
  round = Number.POSITIVE_INFINITY,
): number {
  return Object.entries(game.stallPenalties?.[uid] ?? {})
    .filter(([r]) => Number(r) <= round)
    .reduce((sum, [, points]) => sum + points, 0);
}

/** Each seat's score: the last round's totals, less the points lost for stalled moves. */
export function finalTotals(
  game: Pick<GameDoc, "results" | "players" | "stallPenalties">,
): number[] {
  const totals = game.results.at(-1)?.totals ?? [];
  return game.players.map((player, seat) => (totals[seat] ?? 0) - penaltyOf(game, player.uid));
}
