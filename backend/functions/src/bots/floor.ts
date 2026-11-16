import { type Card, rankOf, suitOf } from "../engine/index.js";
import type { BotView } from "./view.js";

// A house rule for every bot: Wizards and high trumps (Queen, King, Ace) are always bid as tricks,
// whatever the simulations or rules of thumb say.

/** Whether a bot always counts `card` as a trick in its bid: a Wizard, or a trump above 11. */
export function alwaysBid(card: Card, view: BotView): boolean {
  if (card[0] === "W") return true;
  return view.trumpSuit !== null && suitOf(card) === view.trumpSuit && (rankOf(card) ?? 0) > 11;
}

/**
 * The lowest bid a bot may make: one trick per Wizard and high trump in its hand (at most the
 * round's cards). If that bid isn't allowed ("no even bids"), the next one up, or down at the top.
 */
export function minimumBid(view: BotView): number {
  const floor = Math.min(view.round, view.hand.filter((card) => alwaysBid(card, view)).length);
  if (floor !== view.forbiddenBid) return floor;
  return floor + 1 <= view.round ? floor + 1 : floor - 1;
}

/** `bid`, raised to `minimumBid` if it is lower. */
export function atLeastMinimum(bid: number, view: BotView): number {
  return Math.max(bid, minimumBid(view));
}
