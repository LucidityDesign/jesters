import { describe, expect, it } from "vitest";
import { linesLeft, solveRound } from "./endgame.js";
import type { RoundSim } from "./sim.js";

const sim = (hands: string[][], bids: number[]): RoundSim => ({
  playerCount: hands.length,
  trump: null,
  hands: hands.map((hand) => [...hand]) as RoundSim["hands"],
  bids,
  tricksWon: hands.map(() => 0),
  trick: [],
  leader: 0,
  tricksLeft: (hands[0] as string[]).length,
});

describe("linesLeft", () => {
  it("multiplies the orders each hand can be played in, up to the limit", () => {
    expect(
      linesLeft(
        sim(
          [
            ["H2", "H3"],
            ["H4", "H5"],
            ["H6", "H7"],
          ],
          [0, 0, 0],
        ),
        100,
      ),
    ).toBe(8);
    expect(
      linesLeft(
        sim(
          [
            ["H2", "H3", "H8"],
            ["H4", "H5", "H9"],
          ],
          [0, 0],
        ),
        10,
      ),
    ).toBeGreaterThan(10);
  });
});

describe("solveRound", () => {
  it("finds how to make the bid exactly", () => {
    // Bid 1 with the ace and the 2 of hearts: win with the ace first, then lose with the 2.
    const round = sim(
      [
        ["H14", "H2"],
        ["H13", "H3"],
        ["H12", "H4"],
      ],
      [1, 0, 1],
    );
    const scores = solveRound(round, 0, (s) => s[0] as number);
    expect(scores[0]).toBe(30);
    // The round itself is left as it was.
    expect(round.tricksLeft).toBe(2);
  });

  it("lets the bot value the outcome its own way", () => {
    const round = sim([["H14"], ["H13"], ["H2"]], [1, 1, 0]);
    // Taking the only trick: 30 for the bot either way, -10 for seat 1.
    expect(solveRound(round, 0, (s) => s[0] as number)).toEqual([30, -10, 20]);
  });
});
