import { describe, expect, it } from "vitest";
import { seededRandom } from "../../test/helpers.js";
import { type Card, createGame, type GameState, reduce } from "../engine/index.js";
import { minimumBid } from "./floor.js";
import { type BotLevel, botAction } from "./index.js";
import { type BotView, viewFor } from "./view.js";

function biddingView(hand: Card[], options: Partial<BotView> = {}): BotView {
  return {
    seat: 0,
    playerCount: 3,
    phase: "bidding",
    round: hand.length,
    dealer: 2,
    hand,
    trumpCard: "H2",
    trumpSuit: "H",
    bids: [null, null, null],
    tricksWon: [0, 0, 0],
    trick: { leader: 1, cards: [] },
    roundTricks: [],
    noEvenBids: true,
    legalCards: [],
    forbiddenBid: null,
    results: [],
    aggression: 0,
    ...options,
  };
}

describe("the minimum bid", () => {
  it("counts Wizards and trumps above 11", () => {
    expect(minimumBid(biddingView(["W1", "H12", "H13", "H14", "H11", "S14", "J1"]))).toBe(4);
    // Without trump, only the Wizards.
    expect(minimumBid(biddingView(["W1", "H14"], { trumpSuit: null }))).toBe(1);
  });

  it("moves up when that bid isn't allowed, or down at the top", () => {
    expect(minimumBid(biddingView(["W1", "C3"], { forbiddenBid: 1 }))).toBe(2);
    expect(minimumBid(biddingView(["W1", "H14"], { forbiddenBid: 2 }))).toBe(1);
  });

  // Hard enforces it the same way as Medium (both search) and takes much longer.
  it("is kept by the bots, whatever the hand", { timeout: 60_000 }, () => {
    const levels: BotLevel[] = ["easy", "medium"];
    let checked = 0;
    for (const [index, level] of levels.entries()) {
      for (let seed = 1; seed <= 3; seed++) {
        const randomInt = seededRandom(100 * index + seed);
        let state: GameState = createGame({ playerCount: 4, randomInt });
        // The first rounds of a game, every bid checked; the Easy bot plays the cards.
        while (state.phase !== "finished" && state.round <= 6) {
          const decider = state.phase === "bidding" ? level : "easy";
          const action = botAction(state, decider, 0.2 * (seed - 2), randomInt);
          if (action.type === "bid") {
            const view = viewFor(state);
            expect(action.bid).toBeGreaterThanOrEqual(minimumBid(view));
            if (minimumBid(view) > 0) checked++;
          }
          const result = reduce(state, action, randomInt);
          if (!result.ok) throw new Error(result.error);
          state = result.state;
        }
      }
    }
    // Enough bids where the rule mattered.
    expect(checked).toBeGreaterThan(20);
  });
});
