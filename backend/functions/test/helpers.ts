import { type Card, createDeck, type RandomInt, SUITS, type Suit } from "../src/engine/cards.js";
import {
  type Action,
  createGame,
  forbiddenBid,
  type GameState,
  legalCardsFor,
  reduce,
  type Settings,
  startRound,
} from "../src/engine/game.js";

/** Deterministic RandomInt (mulberry32) for reproducible tests. */
export function seededRandom(seed: number): RandomInt {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const float = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(float * maxExclusive);
  };
}

/**
 * A full 60-card deck that deals `hands` (indexed by seat) when `dealer` deals,
 * with `trumpCard` face up next. The remaining cards follow in default order.
 */
export function stackedDeck(dealer: number, hands: Card[][], trumpCard: Card | null): Card[] {
  const n = hands.length;
  const top: Card[] = [];
  for (let i = 0; i < n; i++) {
    top.push(...(hands[(dealer + 1 + i) % n] as Card[]));
  }
  if (trumpCard !== null) top.push(trumpCard);
  if (new Set(top).size !== top.length) throw new Error("stackedDeck: duplicate cards");
  return [...top, ...createDeck().filter((card) => !top.includes(card))];
}

export interface GameWithOptions {
  /** Hands by seat; all must have `round` cards. The player count is `hands.length`. */
  hands: Card[][];
  trumpCard: Card | null;
  dealer?: number;
  round?: number;
  settings?: Settings;
  seed?: number;
}

/** A game at the start of `round` with the given hands and trump card. */
export function gameWith(options: GameWithOptions): GameState {
  const dealer = options.dealer ?? 0;
  const round = options.round ?? options.hands[0]?.length ?? 1;
  const deck = stackedDeck(dealer, options.hands, options.trumpCard);
  const randomInt = seededRandom(options.seed ?? 1);
  const game = createGame({
    playerCount: options.hands.length,
    settings: options.settings,
    randomInt,
    dealer,
    deck,
  });
  return round === 1 ? game : startRound(game, round, dealer, deck);
}

/** A random allowed action for whoever's turn it is. */
export function randomAction(state: GameState, randomInt: RandomInt): Action {
  const seat = state.turn;
  if (seat === null) throw new Error("randomAction: game is finished");
  switch (state.phase) {
    case "choosingTrump":
      return { type: "chooseTrump", seat, suit: SUITS[randomInt(SUITS.length)] as Suit };
    case "bidding": {
      const forbidden = forbiddenBid(state, seat);
      const bids = Array.from({ length: state.round + 1 }, (_, bid) => bid).filter(
        (bid) => bid !== forbidden,
      );
      return { type: "bid", seat, bid: bids[randomInt(bids.length)] as number };
    }
    case "playing": {
      const legal = legalCardsFor(state, seat);
      return { type: "play", seat, card: legal[randomInt(legal.length)] as Card };
    }
    case "finished":
      throw new Error("randomAction: game is finished");
  }
}

/** Applies random allowed actions until `done` returns true. Fails on any rejected action. */
export function playRandomly(
  state: GameState,
  randomInt: RandomInt,
  done: (state: GameState) => boolean,
): GameState {
  let current = state;
  while (!done(current)) {
    const result = reduce(current, randomAction(current, randomInt), randomInt);
    if (!result.ok) throw new Error(`playRandomly: action rejected with ${result.error}`);
    current = result.state;
  }
  return current;
}
