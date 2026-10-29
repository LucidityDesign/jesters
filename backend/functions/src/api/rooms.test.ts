import { describe, expect, it } from "vitest";
import { BOT_NAMES, pickBotName } from "./rooms.js";

describe("pickBotName", () => {
  it("picks a random name that is still free", () => {
    expect(pickBotName(new Set(), () => 0)).toBe(BOT_NAMES[0]);
    expect(pickBotName(new Set(), (max) => max - 1)).toBe(BOT_NAMES.at(-1));
    expect(pickBotName(new Set(["Merlin"]), () => 0)).toBe(BOT_NAMES[1]);
  });

  it("falls back to Bot once every name is taken", () => {
    expect(pickBotName(new Set(BOT_NAMES))).toBe("Bot");
  });

  it("has distinct names that fit a seat", () => {
    expect(new Set(BOT_NAMES).size).toBe(BOT_NAMES.length);
    for (const name of BOT_NAMES) expect(name.length).toBeLessThanOrEqual(12);
  });
});
