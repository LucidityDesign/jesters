import { describe, expect, it } from "vitest";
import {
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

describe("SetAutoPlayInput", () => {
  it("takes minutes or rounds, not both", () => {
    expect(SetAutoPlayInput.safeParse({ gameId: "g1", on: true }).success).toBe(true);
    expect(SetAutoPlayInput.safeParse({ gameId: "g1", on: true, minutes: 10 }).success).toBe(true);
    expect(SetAutoPlayInput.safeParse({ gameId: "g1", on: true, rounds: 3 }).success).toBe(true);
    expect(
      SetAutoPlayInput.safeParse({ gameId: "g1", on: true, minutes: 5, rounds: 1 }).success,
    ).toBe(false);
    expect(SetAutoPlayInput.safeParse({ gameId: "g1", on: true, rounds: 0 }).success).toBe(false);
    expect(SetAutoPlayInput.safeParse({ gameId: "g1", on: true, minutes: 1.5 }).success).toBe(
      false,
    );
  });
});
