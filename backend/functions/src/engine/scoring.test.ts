import { describe, expect, it } from "vitest";
import { roundScore } from "./scoring.js";

describe("roundScore", () => {
  it.each([
    [0, 0, 20],
    [2, 2, 40],
    [10, 10, 120],
    [1, 3, -20],
    [3, 0, -30],
    [0, 1, -10],
  ])("bid %i, won %i → %i", (bid, won, score) => {
    expect(roundScore(bid, won)).toBe(score);
  });
});
