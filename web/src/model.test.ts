import { describe, expect, it } from "vitest";
import { cardKind, type GameDoc, leaders, sortHand, totals } from "./model";

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
