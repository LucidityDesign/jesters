// Computer players. Pure like the rules engine: no Firebase or I/O imports in this directory.
import {
  type Action,
  type Card,
  type GameState,
  type RandomInt,
  reduce,
  type Suit,
} from "../engine/index.js";
import * as easy from "./easy.js";
import { type SearchBudget, searchBid, searchPlay } from "./search.js";
import { type BotView, viewFor } from "./view.js";

export type { BotView } from "./view.js";

export const BOT_LEVELS = ["easy", "medium", "hard"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

/** Levels stored by earlier versions, and the level each one plays as now. */
const LEGACY_LEVELS: Record<string, BotLevel> = { beginner: "easy" };

/** The level a stored or requested level plays as, or `null` if there is no such level. */
export function normalizeLevel(level: string): BotLevel | null {
  if ((BOT_LEVELS as readonly string[]).includes(level)) return level as BotLevel;
  return LEGACY_LEVELS[level] ?? null;
}

/** How cautious (negative) or aggressive (positive) a bot can be; each bot gets its own. */
export const AGGRESSION_RANGE = { min: -0.1, max: 0.1 };

/** How a bot decides. Each level is one strategy; it only sees its own `BotView`. */
export interface Strategy {
  chooseTrump(view: BotView, randomInt: RandomInt): Suit;
  bid(view: BotView, randomInt: RandomInt): number;
  play(view: BotView, randomInt: RandomInt): Card;
}

/** How much the search bots simulate per decision. Tuned with `pnpm simulate`. */
export const SEARCH_BUDGETS: Record<Exclude<BotLevel, "easy">, SearchBudget> = {
  medium: { playDeals: 40, bidDeals: 24, fitBids: true, maxMillis: 250 },
  hard: { playDeals: 120, bidDeals: 60, fitBids: true, maxMillis: 600 },
};

function searchStrategy(budget: SearchBudget): Strategy {
  return {
    // A Wizard turned up is rare; the Easy bot's rule (the longest suit) does well enough.
    chooseTrump: (view) => easy.chooseTrump(view),
    bid: (view, randomInt) => searchBid(view, budget, randomInt),
    play: (view, randomInt) => searchPlay(view, budget, randomInt),
  };
}

const STRATEGIES: Record<BotLevel, Strategy> = {
  easy,
  medium: searchStrategy(SEARCH_BUDGETS.medium),
  hard: searchStrategy(SEARCH_BUDGETS.hard),
};

/** The longest a level may think about one move, in ms. */
export function thinkingMillis(level: BotLevel): number {
  return level === "easy" ? 0 : SEARCH_BUDGETS[level].maxMillis;
}

/** The move of the bot whose turn it is. */
export function botAction(
  state: GameState,
  level: BotLevel,
  aggression = 0,
  randomInt: RandomInt = (max) => Math.floor(Math.random() * max),
): Action {
  const view = viewFor(state, aggression);
  const strategy = STRATEGIES[level];
  switch (view.phase) {
    case "choosingTrump":
      return { type: "chooseTrump", seat: view.seat, suit: strategy.chooseTrump(view, randomInt) };
    case "bidding":
      return { type: "bid", seat: view.seat, bid: strategy.bid(view, randomInt) };
    case "playing":
      return { type: "play", seat: view.seat, card: strategy.play(view, randomInt) };
  }
}

/**
 * Lets the bots move until it is a person's turn or the game is over, all at once (for tests and
 * simulations; the server makes one move at a time, see `moveBot`). `levels` is indexed by seat,
 * `null` for people; so is `aggression` (0 where missing).
 */
export function playBots(
  state: GameState,
  levels: readonly (BotLevel | null)[],
  randomInt: RandomInt,
  aggression: readonly number[] = [],
): GameState {
  let current = state;
  for (;;) {
    const level = current.turn === null ? null : (levels[current.turn] ?? null);
    if (level === null) return current;
    const result = reduce(
      current,
      botAction(current, level, aggression[current.turn as number] ?? 0, randomInt),
      randomInt,
    );
    if (!result.ok)
      throw new Error(`The ${level} bot made a move the rules reject: ${result.error}`);
    current = result.state;
  }
}
