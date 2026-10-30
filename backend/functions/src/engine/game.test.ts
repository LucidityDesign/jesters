import { describe, expect, it } from "vitest";
import { gameWith, playRandomly, seededRandom } from "../../test/helpers.js";
import { type Card, createDeck } from "./cards.js";
import {
  type Action,
  createGame,
  forbiddenBid,
  type GameState,
  legalCardsFor,
  type Result,
  reduce,
  startRound,
} from "./game.js";
import { deal } from "./round.js";

const rng = seededRandom(1);

function apply(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce((current, action) => {
    const result = reduce(current, action, rng);
    if (!result.ok) throw new Error(`${action.type} by seat ${action.seat}: ${result.error}`);
    return result.state;
  }, state);
}

function rejection(result: Result): string | null {
  return result.ok ? null : result.error;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("createGame", () => {
  it.each([2, 7, 3.5])("rejects %s players", (playerCount) => {
    expect(() => createGame({ playerCount, randomInt: rng })).toThrow(RangeError);
  });

  it("starts round 1 with a random dealer and one card each", () => {
    const game = createGame({ playerCount: 4, randomInt: seededRandom(3) });
    expect(game.round).toBe(1);
    expect(game.totalRounds).toBe(15);
    expect(game.dealer).toBeGreaterThanOrEqual(0);
    expect(game.dealer).toBeLessThan(4);
    expect(game.hands.map((hand) => hand.length)).toEqual([1, 1, 1, 1]);
    expect(game.deck).toHaveLength(56);
    expect(game.settings.noEvenBids).toBe(true);
  });

  it("rejects a deck that is not complete", () => {
    const game = createGame({ playerCount: 3, randomInt: rng });
    expect(() => startRound(game, 2, 0, createDeck().slice(1))).toThrow(RangeError);
  });
});

describe("trump", () => {
  it("uses the suit of the face-up card and starts bidding left of the dealer", () => {
    const game = gameWith({ hands: [["H5"], ["S9"], ["C2"]], trumpCard: "D7" });
    expect(game.trumpCard).toBe("D7");
    expect(game.trumpSuit).toBe("D");
    expect(game.phase).toBe("bidding");
    expect(game.turn).toBe(1);
    expect(game.deck[0]).toBe("D7");
  });

  it("has no trump when a Jester is turned up", () => {
    const game = gameWith({ hands: [["H5"], ["S9"], ["C2"]], trumpCard: "J3" });
    expect(game.trumpSuit).toBeNull();
    expect(game.phase).toBe("bidding");
  });

  it("lets the dealer choose when a Wizard is turned up", () => {
    const game = gameWith({ hands: [["H5"], ["S9"], ["C2"]], trumpCard: "W2", dealer: 2 });
    expect(game.phase).toBe("choosingTrump");
    expect(game.turn).toBe(2);

    expect(rejection(reduce(game, { type: "bid", seat: 0, bid: 0 }, rng))).toBe("NOT_YOUR_TURN");
    expect(rejection(reduce(game, { type: "bid", seat: 2, bid: 0 }, rng))).toBe("WRONG_PHASE");
    expect(rejection(reduce(game, { type: "chooseTrump", seat: 2, suit: "X" as never }, rng))).toBe(
      "INVALID_SUIT",
    );

    const chosen = apply(game, { type: "chooseTrump", seat: 2, suit: "S" });
    expect(chosen.trumpSuit).toBe("S");
    expect(chosen.phase).toBe("bidding");
    expect(chosen.turn).toBe(0);
    expect(rejection(reduce(chosen, { type: "chooseTrump", seat: 0, suit: "H" }, rng))).toBe(
      "WRONG_PHASE",
    );
  });

  it("has no trump in the last round", () => {
    const { hands } = deal(createDeck(), 3, 0, 20);
    const game = gameWith({ hands, trumpCard: null, round: 20 });
    expect(game.trumpCard).toBeNull();
    expect(game.trumpSuit).toBeNull();
    expect(game.deck).toEqual([]);
  });
});

describe("bidding", () => {
  const hands: Card[][] = [
    ["H2", "H3", "H4"],
    ["S2", "S3", "S4"],
    ["C2", "C3", "C4"],
  ];
  const game = gameWith({ hands, trumpCard: "D2" });

  it("goes clockwise from left of the dealer, ending with the dealer", () => {
    expect(rejection(reduce(game, { type: "bid", seat: 2, bid: 1 }, rng))).toBe("NOT_YOUR_TURN");
    const afterTwo = apply(
      game,
      { type: "bid", seat: 1, bid: 2 },
      { type: "bid", seat: 2, bid: 0 },
    );
    expect(afterTwo.turn).toBe(0);
    expect(afterTwo.bids).toEqual([null, 2, 0]);

    const done = apply(afterTwo, { type: "bid", seat: 0, bid: 0 });
    expect(done.bids).toEqual([0, 2, 0]);
    expect(done.phase).toBe("playing");
    expect(done.turn).toBe(1);
    expect(done.trick).toEqual({ leader: 1, cards: [] });
  });

  it.each([-1, 4, 0.5, Number.NaN])("rejects the bid %s", (bid) => {
    expect(rejection(reduce(game, { type: "bid", seat: 1, bid }, rng))).toBe("INVALID_BID");
  });

  it("forbids the dealer from making the total equal the number of tricks", () => {
    const beforeDealer = apply(
      game,
      { type: "bid", seat: 1, bid: 1 },
      { type: "bid", seat: 2, bid: 1 },
    );
    expect(forbiddenBid(beforeDealer, 0)).toBe(1);
    expect(rejection(reduce(beforeDealer, { type: "bid", seat: 0, bid: 1 }, rng))).toBe(
      "BID_SUM_NOT_ALLOWED",
    );
    expect(reduce(beforeDealer, { type: "bid", seat: 0, bid: 2 }, rng).ok).toBe(true);
  });

  it("forbids nothing for players other than the dealer", () => {
    expect(forbiddenBid(game, 1)).toBeNull();
  });

  it("forbids nothing when the others already bid more than the tricks", () => {
    const beforeDealer = apply(
      game,
      { type: "bid", seat: 1, bid: 3 },
      { type: "bid", seat: 2, bid: 1 },
    );
    expect(forbiddenBid(beforeDealer, 0)).toBeNull();
  });

  it("allows any total when the rule is switched off", () => {
    const relaxed = gameWith({ hands, trumpCard: "D2", settings: { noEvenBids: false } });
    const beforeDealer = apply(
      relaxed,
      { type: "bid", seat: 1, bid: 1 },
      { type: "bid", seat: 2, bid: 1 },
    );
    expect(forbiddenBid(beforeDealer, 0)).toBeNull();
    expect(reduce(beforeDealer, { type: "bid", seat: 0, bid: 1 }, rng).ok).toBe(true);
  });

  it("rejects playing a card during bidding", () => {
    expect(rejection(reduce(game, { type: "play", seat: 1, card: "S2" }, rng))).toBe("WRONG_PHASE");
  });
});

describe("playing a round", () => {
  // Dealer is seat 0, so seat 1 bids and leads first. Spades are trump.
  const dealt = gameWith({
    hands: [
      ["H14", "C3"],
      ["H2", "W1"],
      ["D5", "H9"],
    ],
    trumpCard: "S4",
    round: 2,
  });
  const bidDone = apply(
    dealt,
    { type: "bid", seat: 1, bid: 1 },
    { type: "bid", seat: 2, bid: 0 },
    { type: "bid", seat: 0, bid: 0 },
  );

  it("enforces turn order, card ownership and following suit", () => {
    expect(rejection(reduce(bidDone, { type: "play", seat: 2, card: "D5" }, rng))).toBe(
      "NOT_YOUR_TURN",
    );
    const led = apply(bidDone, { type: "play", seat: 1, card: "H2" });
    expect(legalCardsFor(led, 2)).toEqual(["H9"]);
    expect(legalCardsFor(led, 0)).toEqual([]);
    expect(rejection(reduce(led, { type: "play", seat: 2, card: "C3" }, rng))).toBe(
      "CARD_NOT_IN_HAND",
    );
    expect(rejection(reduce(led, { type: "play", seat: 2, card: "D5" }, rng))).toBe(
      "MUST_FOLLOW_SUIT",
    );
  });

  it("gives the trick to its winner, who leads the next one", () => {
    const afterTrick = apply(
      bidDone,
      { type: "play", seat: 1, card: "H2" },
      { type: "play", seat: 2, card: "H9" },
      { type: "play", seat: 0, card: "H14" },
    );
    expect(afterTrick.tricksWon).toEqual([1, 0, 0]);
    expect(afterTrick.lastTrick).toEqual({ leader: 1, cards: ["H2", "H9", "H14"], winner: 0 });
    expect(afterTrick.roundTricks).toEqual([afterTrick.lastTrick]);
    expect(afterTrick.trick).toEqual({ leader: 0, cards: [] });
    expect(afterTrick.turn).toBe(0);
    expect(afterTrick.hands).toEqual([["C3"], ["W1"], ["D5"]]);
  });

  it("scores the round and deals the next one with the next dealer", () => {
    const next = apply(
      bidDone,
      { type: "play", seat: 1, card: "H2" },
      { type: "play", seat: 2, card: "H9" },
      { type: "play", seat: 0, card: "H14" },
      { type: "play", seat: 0, card: "C3" },
      { type: "play", seat: 1, card: "W1" },
      { type: "play", seat: 2, card: "D5" },
    );
    expect(next.results).toEqual([
      { round: 2, bids: [0, 1, 0], won: [1, 1, 0], deltas: [-10, 30, 20], totals: [-10, 30, 20] },
    ]);
    expect(next.lastTrick).toEqual({ leader: 0, cards: ["C3", "W1", "D5"], winner: 1 });
    expect(next.round).toBe(3);
    expect(next.dealer).toBe(1);
    expect(next.hands.map((hand) => hand.length)).toEqual([3, 3, 3]);
    expect(next.bids).toEqual([null, null, null]);
    expect(next.tricksWon).toEqual([0, 0, 0]);
    expect(next.roundTricks).toEqual([]);
    expect(next.turn).toBe(next.phase === "choosingTrump" ? 1 : 2);
  });

  it("never mutates the previous state", () => {
    const frozen = deepFreeze(structuredClone(bidDone));
    const snapshot = structuredClone(frozen);
    apply(
      frozen,
      { type: "play", seat: 1, card: "H2" },
      { type: "play", seat: 2, card: "H9" },
      { type: "play", seat: 0, card: "H14" },
    );
    expect(frozen).toEqual(snapshot);
  });
});

describe("end of the game", () => {
  const { hands } = deal(createDeck(), 3, 0, 20);
  const lastRound = gameWith({ hands, trumpCard: null, round: 20 });
  const finished = playRandomly(lastRound, seededRandom(5), (state) => state.phase === "finished");

  it("finishes after the last round", () => {
    expect(finished.turn).toBeNull();
    expect(finished.results).toHaveLength(1);
    expect(finished.results[0]?.round).toBe(20);
    expect(finished.hands.every((hand) => hand.length === 0)).toBe(true);
  });

  it("rejects any further action", () => {
    expect(rejection(reduce(finished, { type: "bid", seat: 0, bid: 0 }, rng))).toBe("WRONG_PHASE");
    expect(legalCardsFor(finished, 0)).toEqual([]);
  });
});
