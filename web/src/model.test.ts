import { describe, expect, it } from "vitest";
import {
  cardKind,
  type GameDoc,
  lastRoundSummary,
  lastTrickOfRound,
  leaders,
  sortHand,
  totals,
} from "./model";

describe("cards", () => {
  it("reads the compact encoding", () => {
    expect(cardKind("H14")).toEqual({ type: "regular", suit: "H", rank: 14 });
    expect(cardKind("D2")).toEqual({ type: "regular", suit: "D", rank: 2 });
    expect(cardKind("W3")).toEqual({ type: "wizard" });
    expect(cardKind("J1")).toEqual({ type: "jester" });
  });

  it("sorts hands like the iOS app", () => {
    expect(sortHand(["J1", "D2", "H14", "W3", "S10", "H2", "C12"])).toEqual([
      "W3",
      "H14",
      "H2",
      "S10",
      "D2",
      "C12",
      "J1",
    ]);
  });
});

describe("scores", () => {
  const game = {
    players: [
      { uid: "a", name: "Anna" },
      { uid: "b", name: "Ben" },
      { uid: "c", name: "Cleo" },
    ],
    results: [
      { round: 1, bids: [0, 1, 0], won: [0, 1, 0], deltas: [20, 30, 20], totals: [20, 30, 30] },
    ],
  } as GameDoc;

  it("uses the last round's totals and finds all leaders", () => {
    expect(totals(game)).toEqual([20, 30, 30]);
    expect(leaders(game)).toEqual([1, 2]);
    expect(totals({ ...game, results: [] })).toEqual([0, 0, 0]);
  });
});

describe("lastTrickOfRound", () => {
  const lastTrick = { leaderSeat: 0, cards: ["H2", "H3", "H4"], winnerSeat: 2 };
  const withTricks = (tricksWon: number[]) =>
    ({ lastTrick, round: { tricksWon } }) as unknown as GameDoc;

  it("shows the last trick during its round", () => {
    expect(lastTrickOfRound(withTricks([0, 0, 1]))).toBe(lastTrick);
  });

  it("clears the table when a new round starts", () => {
    expect(lastTrickOfRound(withTricks([0, 0, 0]))).toBeNull();
    expect(lastTrickOfRound({ lastTrick: null, round: null } as unknown as GameDoc)).toBeNull();
  });
});

describe("lastRoundSummary", () => {
  const game = {
    playerUids: ["a", "b"],
    results: [
      { round: 1, bids: [0, 1], won: [0, 1], deltas: [20, 30], totals: [20, 30] },
      { round: 2, bids: [1, 0], won: [0, 2], deltas: [-10, -20], totals: [10, 10] },
    ],
  } as unknown as GameDoc;

  it("tells a player their bid, tricks and points in the last round", () => {
    expect(lastRoundSummary(game, "b")).toEqual({ round: 2, bid: 0, won: 2, points: -20 });
  });

  it("is null before the first round and for outsiders", () => {
    expect(lastRoundSummary({ ...game, results: [] }, "a")).toBeNull();
    expect(lastRoundSummary(game, "x")).toBeNull();
  });
});
