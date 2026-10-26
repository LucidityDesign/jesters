// Computer players. Pure like the rules engine: no Firebase or I/O imports in this directory.
import {
  type Action,
  type Card,
  type GameState,
  type RandomInt,
  reduce,
  type Suit,
} from "../engine/index.js";
import * as beginner from "./beginner.js";
import { type BotView, viewFor } from "./view.js";

export type { BotView } from "./view.js";

export const BOT_LEVELS = ["beginner"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

/** How a bot decides. Each level is one strategy; it only sees its own `BotView`. */
export interface Strategy {
  chooseTrump(view: BotView): Suit;
  bid(view: BotView): number;
  play(view: BotView): Card;
}

const STRATEGIES: Record<BotLevel, Strategy> = { beginner };

/** The move of the bot whose turn it is. */
export function botAction(state: GameState, level: BotLevel): Action {
  const view = viewFor(state);
  const strategy = STRATEGIES[level];
  switch (view.phase) {
    case "choosingTrump":
      return { type: "chooseTrump", seat: view.seat, suit: strategy.chooseTrump(view) };
    case "bidding":
      return { type: "bid", seat: view.seat, bid: strategy.bid(view) };
    case "playing":
      return { type: "play", seat: view.seat, card: strategy.play(view) };
  }
}

/**
 * Lets the bots move until it is a person's turn or the game is over. `levels` is indexed by seat,
 * `null` for people.
 */
export function playBots(
  state: GameState,
  levels: readonly (BotLevel | null)[],
  randomInt: RandomInt,
): GameState {
  let current = state;
  for (;;) {
    const level = current.turn === null ? null : (levels[current.turn] ?? null);
    if (level === null) return current;
    const result = reduce(current, botAction(current, level), randomInt);
    if (!result.ok)
      throw new Error(`The ${level} bot made a move the rules reject: ${result.error}`);
    current = result.state;
  }
}
