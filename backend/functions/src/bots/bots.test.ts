import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gameWith, playRandomly, seededRandom } from "../../test/helpers.js";
import { type Card, createGame, type GameState, reduce } from "../engine/index.js";
import { bid, bidPressure, chooseTrump, play, playingAggression } from "./easy.js";
import { type BotLevel, botAction, playBots } from "./index.js";
import { type BotView, viewFor } from "./view.js";

/** A view in the playing phase with the given hand and trick, for testing `play`. */
function playingView(options: {
  hand: Card[];
  trick?: Card[];
  trump?: BotView["trumpSuit"];
  bid: number;
  won?: number;
  playerCount?: number;
  aggression?: number;
}): BotView {
  const playerCount = options.playerCount ?? 3;
  return {
    seat: 0,
    playerCount,
    phase: "playing",
    round: options.hand.length,
    dealer: 2,
    hand: options.hand,
    trumpCard: null,
    trumpSuit: options.trump ?? null,
    bids: [options.bid, ...Array<number>(playerCount - 1).fill(0)],
    tricksWon: [options.won ?? 0, ...Array<number>(playerCount - 1).fill(0)],
    trick: { leader: 1, cards: options.trick ?? [] },
    roundTricks: [],
    noEvenBids: true,
    legalCards: options.hand,
    forbiddenBid: null,
    results: [],
    aggression: options.aggression ?? 0,
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

describe("the easy bot", () => {
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

  it("bids lower when the others have claimed many tricks, higher when few", () => {
    const view = (bids: (number | null)[]): BotView => ({
      ...playingView({ hand: ["H14", "H13", "D14", "C13", "D2"], bid: 0 }),
      phase: "bidding",
      bids,
    });
    const neutral = bidPressure(view([null, null, null]));
    expect(neutral).toBe(1);
    expect(bidPressure(view([null, 4, 4]))).toBeLessThan(neutral);
    expect(bidPressure(view([null, 0, 0]))).toBeGreaterThan(neutral);
    expect(bid(view([null, 4, 4]))).toBeLessThan(bid(view([null, 0, 0])));
  });

  it("bids higher the more aggressive it is", () => {
    const view = (aggression: number): BotView => ({
      ...playingView({ hand: ["H14", "D14", "C13", "S9", "H2"], bid: 0, aggression }),
      phase: "bidding",
      bids: [null, null, null],
    });
    expect(bid(view(-0.1))).toBeLessThan(bid(view(0.1)));
    expect(bid(view(0))).toBeGreaterThanOrEqual(bid(view(-0.1)));
    expect(bid(view(0))).toBeLessThanOrEqual(bid(view(0.1)));
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

  it("takes tricks it needs, with the cheapest winning card when playing last", () => {
    const last = { trick: ["H10", "C2"] as Card[], bid: 1 };
    expect(play(playingView({ hand: ["H9", "H14", "W1"], ...last }))).toBe("H14");
    expect(play(playingView({ hand: ["H9", "H14", "W1"], bid: 1 }))).toBe("W1");
    // Nothing wins: throw away the weakest card.
    expect(play(playingView({ hand: ["H2", "C9"], trick: ["W2"], bid: 1 }))).toBe("H2");
  });

  it("takes tricks with stronger cards the more aggressive it is, unless playing last", () => {
    // The bids add up to the cards, so the table doesn't shift the aggression.
    const view = (aggression: number, trick: Card[] = ["H10"]): BotView => ({
      ...playingView({ hand: ["H11", "H12", "H14"], trick, bid: 1, playerCount: 4, aggression }),
      bids: [1, 1, 1, 0],
    });
    expect(play(view(-0.1))).toBe("H11");
    expect(play(view(0))).toBe("H12");
    expect(play(view(0.1))).toBe("H14");
    expect(play(view(0.1, ["H10", "C2", "C3"]))).toBe("H11");
  });

  it("plays more aggressively when the bids exceed the cards, more cautiously when they don't", () => {
    const view = (others: number[]): BotView => {
      const base = playingView({
        hand: ["H11", "H12", "H14"],
        trick: ["H10"],
        bid: 1,
        playerCount: 4,
      });
      return { ...base, round: 3, bids: [1, ...others] };
    };
    expect(playingAggression(view([1, 0, 1]))).toBe(0);
    expect(play(view([1, 0, 1]))).toBe("H12");
    expect(playingAggression(view([2, 1, 1]))).toBeCloseTo(0.2);
    expect(play(view([2, 1, 1]))).toBe("H14");
    expect(playingAggression(view([0, 0, 0]))).toBeCloseTo(-0.2);
    expect(play(view([0, 0, 0]))).toBe("H11");
  });

  it("keeps its Jester for later when another card can lose the trick", () => {
    // Can't win and still needs tricks: drop the weakest card but a Jester or Wizard.
    expect(play(playingView({ hand: ["J1", "H3", "S14"], trick: ["W1"], bid: 1 }))).toBe("H3");
    expect(play(playingView({ hand: ["J1", "S14"], trick: ["W1"], trump: "S", bid: 1 }))).toBe(
      "S14",
    );
    expect(play(playingView({ hand: ["J1", "W2"], trick: ["W1"], bid: 1 }))).toBe("J1");
    // Leading without needing tricks: a low side-suit card, else the Jester.
    expect(play(playingView({ hand: ["J1", "C12", "H3"], bid: 0 }))).toBe("H3");
    expect(play(playingView({ hand: ["J1", "S3", "C12"], trump: "S", bid: 0 }))).toBe("J1");
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
  const aggression = levels.map(() => (randomInt(21) - 10) / 100);
  let state = createGame({ playerCount: levels.length, settings: { noEvenBids }, randomInt });
  for (;;) {
    state = playBots(state, levels, randomInt, aggression);
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
        fc.array(fc.constantFrom<BotLevel | null>("easy", null), {
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
    expect(playBots(state, [null, null, "easy"], seededRandom(4))).toBe(state);
    const after = playBots(state, ["easy", "easy", null], seededRandom(4));
    expect(after.turn).toBe(2);
    expect(after.bids[1]).not.toBeNull();
  });

  it("beats random play", () => {
    let wins = 0;
    for (let seed = 0; seed < 40; seed++) {
      const randomInt = seededRandom(seed);
      let state = createGame({ playerCount: 3, randomInt });
      const levels: (BotLevel | null)[] = ["easy", null, null];
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
    expect(reduce(state, botAction(state, "easy"), randomInt).ok).toBe(true);
  });
});
