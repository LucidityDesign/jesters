import { describe, expect, it } from "vitest";
import type { GameDoc } from "./game/model.js";
import { BOT_MOVE_DELAY_MS, BOT_NEW_ROUND_DELAY_MS, botDelayMs } from "./triggers.js";

const game = (rounds: number) => ({ results: Array(rounds).fill({}) }) as unknown as GameDoc;

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
});
