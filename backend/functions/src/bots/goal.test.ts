import { describe, expect, it } from "vitest";
import { outcomeValue, winChance } from "./goal.js";

describe("winChance", () => {
  it("is certain at the end of the game, with ties shared", () => {
    expect(winChance([100, 80, 90], 0, 0)).toBe(1);
    expect(winChance([100, 80, 90], 1, 0)).toBe(0);
    expect(winChance([100, 100, 90], 0, 0)).toBe(0.5);
  });

  it("favours the leader less the more rounds are left", () => {
    const soon = winChance([100, 60, 60], 0, 1);
    const later = winChance([100, 60, 60], 0, 10);
    expect(soon).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(winChance([60, 100, 60], 0, 10));
  });
});

describe("outcomeValue", () => {
  const goal = { winWeight: 200, focusRounds: 3 };

  it("is the round's points far from the end, or without a goal", () => {
    expect(outcomeValue(goal, 0, [0, 0, 0], [30, -10, 20], 5)).toBe(30);
    expect(outcomeValue(undefined, 0, [0, 0, 0], [30, -10, 20], 0)).toBe(30);
  });

  it("adds the chance to win near the end", () => {
    // Last round: 30 points and the win, or 20 points and a loss.
    expect(outcomeValue(goal, 0, [100, 120, 0], [30, 0, 0], 0)).toBe(230);
    expect(outcomeValue(goal, 0, [100, 120, 0], [20, 30, 0], 0)).toBe(20);
  });
});
