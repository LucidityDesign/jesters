import { describe, expect, it } from "vitest";
import type { GameDoc } from "./game/model.js";
import {
  BOT_AFTER_TRICK_MS,
  BOT_MOVE_DELAY_MS,
  BOT_NEW_ROUND_DELAY_MS,
  botDelayMs,
  botWaitMs,
} from "./triggers.js";

const game = (rounds: number, lastTrick: string[] | null = null) =>
  ({
    results: Array(rounds).fill({}),
    lastTrick: lastTrick && { leaderSeat: 0, cards: lastTrick, winnerSeat: 1 },
  }) as unknown as GameDoc;

describe("the bots' pause", () => {
  it("is 0.5 to 2 s between moves", () => {
    expect(botDelayMs(game(1), game(1), () => 0)).toBe(BOT_MOVE_DELAY_MS.min);
    expect(botDelayMs(game(1), game(1), () => 1)).toBe(BOT_MOVE_DELAY_MS.max);
    expect(botDelayMs(undefined, game(0), () => 0.5)).toBe(1250);
  });

  it("is longer once a round was scored", () => {
    expect(botDelayMs(game(1), game(2), () => 0)).toBe(BOT_NEW_ROUND_DELAY_MS);
    expect(botDelayMs(game(1), game(2), () => 1)).toBe(BOT_NEW_ROUND_DELAY_MS);
  });

  it("leaves a taken trick on the table for 3 s before a bot leads the next one", () => {
    const before = game(1, ["H2", "H3", "H4"]);
    const after = game(1, ["S2", "S9", "S5"]);
    expect(botDelayMs(before, after, () => 0)).toBe(BOT_AFTER_TRICK_MS);
    // Its thinking comes on top, not off the pause.
    expect(botWaitMs(before, after, 0, 1000, () => 0)).toBe(BOT_AFTER_TRICK_MS);
    // Within a trick, the thinking comes off the pause as before.
    expect(botWaitMs(after, after, 0, 1000, () => 1)).toBe(BOT_MOVE_DELAY_MS.max - 1000);
    // After the last trick of a round, the longer pause for the new round applies.
    expect(botWaitMs(before, game(2, ["S2", "S9", "S5"]), 0, 1000, () => 0)).toBe(
      BOT_NEW_ROUND_DELAY_MS - 1000,
    );
  });
});
