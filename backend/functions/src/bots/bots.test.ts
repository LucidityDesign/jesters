import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gameWith, playRandomly, seededRandom } from "../../test/helpers.js";
import { type Card, createGame, type GameState, reduce } from "../engine/index.js";
import { bid, chooseTrump, play } from "./beginner.js";
import { botAction, type BotLevel, playBots } from "./index.js";
import { type BotView, viewFor } from "./view.js";

/** A view in the playing phase with the given hand and trick, for testing `play`. */
function playingView(options: {
  hand: Card[];
  trick?: Card[];
  trump?: BotView["trumpSuit"];
  bid: number;
  won?: number;
}): BotView {
  return {
    seat: 0,
    playerCount: 3,
    phase: "playing",
    round: options.hand.length,
    dealer: 2,
    hand: options.hand,
    trumpCard: null,
    trumpSuit: options.trump ?? null,
    bids: [options.bid, 0, 0],
    tricksWon: [options.won ?? 0, 0, 0],
    trick: { leader: 1, cards: options.trick ?? [] },
    legalCards: options.hand,
    forbiddenBid: null,
    results: [],
  };
}

describe("viewFor", () => {
  it("shows only the bot's own hand", () => {
    const state = gameWith({ hands: [["H2"], ["S3"], ["C4"]], trumpCard: "D5" });
    const view = viewFor(state);
    expect(view.seat).toBe(1);
    expect(view.hand).toEqual(["S3"]);
    expect(JSON.stringify(view)).not.toMatch(/H2|C4/);
    expect(view).not.toHaveProperty("hands");
    expect(view).not.toHaveProperty("deck");
  });

  it("refuses finished games", () => {
    const state = playRandomly(
      createGame({ playerCount: 3, randomInt: seededRandom(1) }),
      seededRandom(2),
      (s) => s.phase === "finished",
    );
    expect(() => viewFor(state)).toThrow();
  });
});

describe("the beginner bot", () => {
  it("picks its longest suit as trump", () => {
    const state = gameWith({
      hands: [
        ["H2", "S3", "S9", "C4"],
        ["H3", "H4", "H5", "H6"],
        ["D2", "D3", "D4", "D5"],
      ],
      trumpCard: "W1",
    });
    expect(chooseTrump(viewFor(state))).toBe("S");
  });

  it("bids its strong cards", () => {
    const strong = gameWith({
      hands: [
        ["H2", "H3", "D2"],
        ["W1", "S14", "H4"],
        ["D3", "D4", "C5"],
      ],
      trumpCard: "S2",
    });
    expect(bid(viewFor(strong))).toBe(2);

    const weak = gameWith({
      hands: [
        ["H2", "H3", "D2"],
        ["J1", "C3", "H4"],
        ["D3", "D4", "C5"],
      ],
      trumpCard: "S2",
    });
    expect(bid(viewFor(weak))).toBe(0);
  });

  it("avoids the forbidden bid", () => {
    const view: BotView = {
      ...playingView({ hand: ["W1"], bid: 0 }),
      phase: "bidding",
      forbiddenBid: 1,
    };
    expect(bid(view)).toBe(0);
    expect(bid({ ...view, hand: ["J1"], forbiddenBid: 0 })).toBe(1);
  });

  it("takes tricks it needs with the cheapest winning card", () => {
    expect(play(playingView({ hand: ["H9", "H14", "W1"], trick: ["H10"], bid: 1 }))).toBe("H14");
    expect(play(playingView({ hand: ["H9", "H14", "W1"], bid: 1 }))).toBe("W1");
    // Nothing wins: throw away the weakest card.
    expect(play(playingView({ hand: ["H2", "C9"], trick: ["W2"], bid: 1 }))).toBe("H2");
  });

  it("loses tricks it doesn't need, dropping its strongest losing card", () => {
    expect(play(playingView({ hand: ["H9", "H12", "H14"], trick: ["H13"], bid: 0 }))).toBe("H12");
    expect(play(playingView({ hand: ["J1", "S5", "C9"], trump: "S", bid: 1, won: 1 }))).toBe("J1");
    // Every card wins: play the weakest.
    expect(play(playingView({ hand: ["H9", "W1"], trick: ["H2"], bid: 0 }))).toBe("H9");
  });
});

function playWholeGame(levels: (BotLevel | null)[], seed: number, noEvenBids: boolean): GameState {
  const randomInt = seededRandom(seed);
  let state = createGame({ playerCount: levels.length, settings: { noEvenBids }, randomInt });
  for (;;) {
    state = playBots(state, levels, randomInt);
    if (state.phase === "finished") return state;
    expect(levels[state.turn as number]).toBeNull();
    // People play randomly.
    const turn = state.turn;
    state = playRandomly(state, randomInt, (s) => s.turn !== turn || s.phase === "finished");
  }
}

describe("playBots", () => {
  it("plays whole games with legal moves only", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<BotLevel | null>("beginner", null), {
          minLength: 3,
          maxLength: 6,
        }),
        fc.integer(),
        fc.boolean(),
        (levels, seed, noEvenBids) => {
          expect(playWholeGame(levels, seed, noEvenBids).results).toHaveLength(60 / levels.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("stops at a person's turn", () => {
    const state = createGame({ playerCount: 3, randomInt: seededRandom(3), dealer: 0 });
    // Seat 1 bids first.
    expect(playBots(state, [null, null, "beginner"], seededRandom(4))).toBe(state);
    const after = playBots(state, ["beginner", "beginner", null], seededRandom(4));
    expect(after.turn).toBe(2);
    expect(after.bids[1]).not.toBeNull();
  });

  it("beats random play", () => {
    let wins = 0;
    for (let seed = 0; seed < 40; seed++) {
      const randomInt = seededRandom(seed);
      let state = createGame({ playerCount: 3, randomInt });
      const levels: (BotLevel | null)[] = ["beginner", null, null];
      while (state.phase !== "finished") {
        state = playBots(state, levels, randomInt);
        if (state.phase === "finished") break;
        const turn = state.turn;
        state = playRandomly(state, randomInt, (s) => s.turn !== turn || s.phase === "finished");
      }
      const totals = state.results.at(-1)?.totals as number[];
      if ((totals[0] as number) >= Math.max(...totals)) wins++;
    }
    // A random player would win about a third of these.
    expect(wins).toBeGreaterThan(30);
  });

  it("makes moves the rules accept", () => {
    const randomInt = seededRandom(9);
    const state = createGame({ playerCount: 4, randomInt });
    expect(reduce(state, botAction(state, "beginner"), randomInt).ok).toBe(true);
  });
});
