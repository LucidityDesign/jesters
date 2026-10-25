import { type Card, createDeck, type RandomInt, shuffle, type Suit, SUITS } from "./cards.js";
import {
  deal,
  DECK_SIZE,
  forbiddenLastBid,
  MAX_PLAYERS,
  MIN_PLAYERS,
  totalRounds,
  trumpFromCard,
} from "./round.js";
import { roundScore } from "./scoring.js";
import { legalCards, trickWinner } from "./trick.js";

// Players are identified by seat (0…playerCount-1), in clockwise order.
// Mapping seats to user ids is the API layer's job.

export type Phase = "choosingTrump" | "bidding" | "playing" | "finished";

export interface Settings {
  /** The dealer may not bid so that the total of all bids equals the number of tricks. */
  noEvenBids: boolean;
}

export const DEFAULT_SETTINGS: Settings = { noEvenBids: true };

export interface Trick {
  leader: number;
  /** In play order, starting with the leader. */
  cards: Card[];
}

export interface CompletedTrick extends Trick {
  winner: number;
}

export interface RoundResult {
  round: number;
  /** All arrays are indexed by seat. */
  bids: number[];
  won: number[];
  deltas: number[];
  totals: number[];
}

export interface GameState {
  playerCount: number;
  settings: Settings;
  phase: Phase;
  /** 1-based; also the number of cards dealt to each player. */
  round: number;
  totalRounds: number;
  dealer: number;
  /** Seat whose action is expected; `null` once the game is finished. */
  turn: number | null;
  hands: Card[][];
  /** Undealt cards (secret). The first one is `trumpCard` when there is one. */
  deck: Card[];
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  bids: (number | null)[];
  tricksWon: number[];
  trick: Trick;
  /** The most recently completed trick, possibly from the previous round. */
  lastTrick: CompletedTrick | null;
  results: RoundResult[];
}

export type Action =
  | { type: "chooseTrump"; seat: number; suit: Suit }
  | { type: "bid"; seat: number; bid: number }
  | { type: "play"; seat: number; card: Card };

export type EngineError =
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "INVALID_SUIT"
  | "INVALID_BID"
  | "BID_SUM_NOT_ALLOWED"
  | "CARD_NOT_IN_HAND"
  | "MUST_FOLLOW_SUIT";

export type Result = { ok: true; state: GameState } | { ok: false; error: EngineError };

export interface NewGameOptions {
  playerCount: number;
  settings?: Settings;
  randomInt: RandomInt;
  /** For tests: the first dealer instead of a random one. */
  dealer?: number;
  /** For tests: the shuffled deck for round 1. */
  deck?: Card[];
}

export function createGame(options: NewGameOptions): GameState {
  const { playerCount, randomInt } = options;
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new RangeError(`playerCount must be ${MIN_PLAYERS}–${MAX_PLAYERS}, got ${playerCount}`);
  }
  const initial: GameState = {
    playerCount,
    settings: options.settings ?? DEFAULT_SETTINGS,
    phase: "bidding",
    round: 0,
    totalRounds: totalRounds(playerCount),
    dealer: 0,
    turn: null,
    hands: [],
    deck: [],
    trumpCard: null,
    trumpSuit: null,
    bids: [],
    tricksWon: [],
    trick: { leader: 0, cards: [] },
    lastTrick: null,
    results: [],
  };
  const dealer = options.dealer ?? randomInt(playerCount);
  const deck = options.deck ?? shuffle(createDeck(), randomInt);
  return startRound(initial, 1, dealer, deck);
}

/** Deals round `round` from a shuffled `deck`. Returns a new state. */
export function startRound(
  state: GameState,
  round: number,
  dealer: number,
  deck: readonly Card[],
): GameState {
  if (deck.length !== DECK_SIZE) {
    throw new RangeError(`deck must have ${DECK_SIZE} cards, got ${deck.length}`);
  }
  const n = state.playerCount;
  const { hands, rest } = deal(deck, n, dealer, round);
  const trumpCard = rest[0] ?? null;
  const trump = trumpFromCard(trumpCard);
  const firstBidder = (dealer + 1) % n;
  return {
    ...state,
    phase: trump.kind === "dealerChooses" ? "choosingTrump" : "bidding",
    round,
    dealer,
    turn: trump.kind === "dealerChooses" ? dealer : firstBidder,
    hands,
    deck: rest,
    trumpCard,
    trumpSuit: trump.kind === "suit" ? trump.suit : null,
    bids: Array<number | null>(n).fill(null),
    tricksWon: Array<number>(n).fill(0),
    trick: { leader: firstBidder, cards: [] },
  };
}

/** Applies `action` and returns the new state, or the reason it is not allowed. Never mutates `state`. */
export function reduce(state: GameState, action: Action, randomInt: RandomInt): Result {
  if (action.seat !== state.turn) {
    return { ok: false, error: state.phase === "finished" ? "WRONG_PHASE" : "NOT_YOUR_TURN" };
  }
  switch (action.type) {
    case "chooseTrump":
      return chooseTrump(state, action.suit);
    case "bid":
      return placeBid(state, action.seat, action.bid);
    case "play":
      return playCard(state, action.seat, action.card, randomInt);
  }
}

function chooseTrump(state: GameState, suit: Suit): Result {
  if (state.phase !== "choosingTrump") return { ok: false, error: "WRONG_PHASE" };
  if (!SUITS.includes(suit)) return { ok: false, error: "INVALID_SUIT" };
  return {
    ok: true,
    state: { ...state, trumpSuit: suit, phase: "bidding", turn: next(state, state.dealer) },
  };
}

function placeBid(state: GameState, seat: number, bid: number): Result {
  if (state.phase !== "bidding") return { ok: false, error: "WRONG_PHASE" };
  if (!Number.isInteger(bid) || bid < 0 || bid > state.round) {
    return { ok: false, error: "INVALID_BID" };
  }
  if (bid === forbiddenBid(state, seat)) return { ok: false, error: "BID_SUM_NOT_ALLOWED" };

  const bids = state.bids.with(seat, bid);
  // The dealer bids last.
  if (seat === state.dealer) {
    const leader = next(state, state.dealer);
    return {
      ok: true,
      state: { ...state, bids, phase: "playing", turn: leader, trick: { leader, cards: [] } },
    };
  }
  return { ok: true, state: { ...state, bids, turn: next(state, seat) } };
}

function playCard(state: GameState, seat: number, card: Card, randomInt: RandomInt): Result {
  if (state.phase !== "playing") return { ok: false, error: "WRONG_PHASE" };
  const hand = state.hands[seat] as Card[];
  if (!hand.includes(card)) return { ok: false, error: "CARD_NOT_IN_HAND" };
  if (!legalCards(hand, state.trick.cards).includes(card)) {
    return { ok: false, error: "MUST_FOLLOW_SUIT" };
  }

  const hands = state.hands.with(
    seat,
    hand.filter((c) => c !== card),
  );
  const trick = { ...state.trick, cards: [...state.trick.cards, card] };
  if (trick.cards.length < state.playerCount) {
    return { ok: true, state: { ...state, hands, trick, turn: next(state, seat) } };
  }

  const winner = (trick.leader + trickWinner(trick.cards, state.trumpSuit)) % state.playerCount;
  const tricksWon = state.tricksWon.with(winner, (state.tricksWon[winner] as number) + 1);
  const afterTrick: GameState = {
    ...state,
    hands,
    tricksWon,
    lastTrick: { ...trick, winner },
    trick: { leader: winner, cards: [] },
    turn: winner,
  };
  const roundOver = hands.every((h) => h.length === 0);
  return { ok: true, state: roundOver ? finishRound(afterTrick, randomInt) : afterTrick };
}

function finishRound(state: GameState, randomInt: RandomInt): GameState {
  const bids = state.bids as number[];
  const won = state.tricksWon;
  const deltas = bids.map((bid, seat) => roundScore(bid, won[seat] as number));
  const previous = state.results.at(-1)?.totals ?? Array<number>(state.playerCount).fill(0);
  const totals = deltas.map((delta, seat) => (previous[seat] as number) + delta);
  const results = [...state.results, { round: state.round, bids, won, deltas, totals }];

  if (state.round === state.totalRounds) {
    return { ...state, results, phase: "finished", turn: null, deck: [] };
  }
  return startRound(
    { ...state, results },
    state.round + 1,
    next(state, state.dealer),
    shuffle(createDeck(), randomInt),
  );
}

function next(state: GameState, seat: number): number {
  return (seat + 1) % state.playerCount;
}

/** The bid `seat` may not make right now because of the "no even bids" rule, or `null`. */
export function forbiddenBid(state: GameState, seat: number): number | null {
  if (!state.settings.noEvenBids || state.phase !== "bidding" || seat !== state.dealer) {
    return null;
  }
  const others = state.bids.filter((bid, s): bid is number => s !== seat && bid !== null);
  return forbiddenLastBid(others, state.round);
}

/** Cards `seat` may play right now (empty when it is not their turn to play). */
export function legalCardsFor(state: GameState, seat: number): Card[] {
  if (state.phase !== "playing" || state.turn !== seat) return [];
  return legalCards(state.hands[seat] as Card[], state.trick.cards);
}
