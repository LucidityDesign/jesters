import { describe, expect, it } from "vitest";
import { gameWith, seededRandom } from "../../test/helpers.js";
import { type GameState, reduce } from "../engine/index.js";
import { handDoc } from "../game/model.js";
import { blindWinChance } from "./blind.js";
import { BOT_LEVELS, botAction } from "./index.js";
import { viewFor } from "./view.js";

const blind = { noEvenBids: true, blindFirstRound: true };
const random = seededRandom(3);

/** Round 1 with Hearts as trump; Bob (seat 1) bids first. */
function round1(hands: GameState["hands"], settings = blind): GameState {
  return gameWith({ hands, trumpCard: "H2", settings });
}

describe("blind first round", () => {
  it("shows each player the others' cards but not their own", () => {
    const game = round1([["S9"], ["W1"], ["C3"]]);
    expect(handDoc(game, 0)).toMatchObject({
      cards: [],
      legalCards: [],
      hiddenCards: 1,
      othersCards: [null, "W1", "C3"],
    });
    expect(JSON.stringify(handDoc(game, 0))).not.toContain("S9");
    // Without the rule, the first round is played as usual.
    const open = round1([["S9"], ["W1"], ["C3"]], { noEvenBids: true, blindFirstRound: false });
    expect(handDoc(open, 0)).toMatchObject({ cards: ["S9"] });
    expect(handDoc(open, 0).othersCards).toBeUndefined();
  });

  it("keeps a bot from seeing its own card", () => {
    // Bob (seat 1) bids first.
    const view = viewFor(round1([["S9"], ["H14"], ["C3"]]));
    expect(view.seat).toBe(1);
    expect(view.hand).toEqual([]);
    expect(view.othersCards).toEqual(["S9", null, "C3"]);
  });

  it("judges the chance of taking the trick from the others' cards", () => {
    // Bob leads, so only a Wizard of his own beats Carol's: 3 of the 57 cards he can't see.
    expect(blindWinChance(viewFor(round1([["S9"], ["C3"], ["W1"]])), "H")).toBeCloseTo(3 / 57);
    // Against two Jesters, almost every card wins.
    expect(blindWinChance(viewFor(round1([["J1"], ["S9"], ["J2"]])), "H")).toBeGreaterThan(0.9);
  });

  it("bids by that chance at every level, and plays the unseen card", () => {
    for (const level of BOT_LEVELS) {
      let state = round1([["S9"], ["C5"], ["W1"]]);
      // Bob (seat 1) sees Carol's Wizard: he won't take the trick.
      expect(botAction(state, level, 0, random)).toEqual({ type: "bid", seat: 1, bid: 0 });
      for (const bid of [0, 1, 1]) {
        const result = reduce(state, { type: "bid", seat: state.turn as number, bid }, random);
        if (!result.ok) throw new Error(result.error);
        state = result.state;
      }
      expect(botAction(state, level, 0, random)).toEqual({ type: "play", seat: 1, card: "C5" });
    }
  });
});
