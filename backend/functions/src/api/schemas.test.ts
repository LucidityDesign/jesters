import { describe, expect, it } from "vitest";
import {
  AddBotInput,
  CreateRoomInput,
  PlaceBidInput,
  PlayCardInput,
  PlayerName,
  SetAutoPlayInput,
} from "./schemas.js";

describe("PlayerName", () => {
  it("trims names", () => {
    expect(PlayerName.parse("  Anna ")).toBe("Anna");
  });

  it.each(["", "   ", "x".repeat(25), "Anna\u0000", "Anna‮"])("rejects %j", (name) => {
    expect(PlayerName.safeParse(name).success).toBe(false);
  });

  it("accepts umlauts and emoji", () => {
    expect(PlayerName.parse("Jürgen 🃏")).toBe("Jürgen 🃏");
  });
});

describe("CreateRoomInput", () => {
  it("turns on no-even-bids by default", () => {
    expect(CreateRoomInput.parse({ name: "Anna" }).settings).toEqual({ noEvenBids: true });
  });
});

describe("action inputs", () => {
  it("validates cards and bids", () => {
    expect(PlayCardInput.safeParse({ gameId: "g1", card: "H14" }).success).toBe(true);
    expect(PlayCardInput.safeParse({ gameId: "g1", card: "H15" }).success).toBe(false);
    expect(PlaceBidInput.safeParse({ gameId: "g1", bid: 1.5 }).success).toBe(false);
    expect(PlaceBidInput.safeParse({ gameId: "g/1", bid: 1 }).success).toBe(false);
  });
});

describe("AddBotInput", () => {
  it("takes the three levels, easy by default", () => {
    expect(AddBotInput.parse({ gameId: "g1" }).level).toBe("easy");
    expect(AddBotInput.parse({ gameId: "g1", level: "hard" }).level).toBe("hard");
    expect(AddBotInput.safeParse({ gameId: "g1", level: "expert" }).success).toBe(false);
  });

  it("reads the level older app versions send as easy", () => {
    expect(AddBotInput.parse({ gameId: "g1", level: "beginner" }).level).toBe("easy");
  });
});

describe("SetAutoPlayInput", () => {
  const valid = (input: object) => SetAutoPlayInput.safeParse({ gameId: "g1", ...input }).success;

  it("takes 5, 10 or 30 minutes or 1, 2 or 3 rounds, exactly one of them", () => {
    for (const minutes of [5, 10, 30]) expect(valid({ on: true, minutes })).toBe(true);
    for (const rounds of [1, 2, 3]) expect(valid({ on: true, rounds })).toBe(true);
    expect(valid({ on: true })).toBe(false);
    expect(valid({ on: true, minutes: 5, rounds: 1 })).toBe(false);
    for (const minutes of [1, 60, 7.5]) expect(valid({ on: true, minutes })).toBe(false);
    for (const rounds of [0, 4, 5]) expect(valid({ on: true, rounds })).toBe(false);
  });

  it("switches off without a limit", () => {
    expect(valid({ on: false })).toBe(true);
  });
});
