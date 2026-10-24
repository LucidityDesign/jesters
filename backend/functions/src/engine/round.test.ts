import { describe, expect, it } from "vitest";
import { createDeck } from "./cards.js";
import { deal, forbiddenLastBid, totalRounds, trumpFromCard } from "./round.js";

describe("totalRounds", () => {
  it.each([
    [3, 20],
    [4, 15],
    [5, 12],
    [6, 10],
  ])("%i players → %i rounds", (players, rounds) => {
    expect(totalRounds(players)).toBe(rounds);
  });
});

describe("deal", () => {
  it("deals starting left of the dealer and keeps the rest in order", () => {
    const deck = createDeck();
    const { hands, rest } = deal(deck, 3, 1, 2);
    expect(hands[2]).toEqual(deck.slice(0, 2));
    expect(hands[0]).toEqual(deck.slice(2, 4));
    expect(hands[1]).toEqual(deck.slice(4, 6));
    expect(rest).toEqual(deck.slice(6));
  });

  it("deals the whole deck in the last round", () => {
    const { hands, rest } = deal(createDeck(), 4, 0, 15);
    expect(hands.every((hand) => hand.length === 15)).toBe(true);
    expect(rest).toEqual([]);
  });
});

describe("trumpFromCard", () => {
  it("uses the suit of a regular card", () => {
    expect(trumpFromCard("D7")).toEqual({ kind: "suit", suit: "D" });
  });

  it("has no trump for a Jester or when no card is left", () => {
    expect(trumpFromCard("J1")).toEqual({ kind: "none" });
    expect(trumpFromCard(null)).toEqual({ kind: "none" });
  });

  it("lets the dealer choose for a Wizard", () => {
    expect(trumpFromCard("W1")).toEqual({ kind: "dealerChooses" });
  });
});

describe("forbiddenLastBid", () => {
  it("forbids the bid that makes the total equal the tricks", () => {
    expect(forbiddenLastBid([1, 0], 3)).toBe(2);
    expect(forbiddenLastBid([1, 2], 3)).toBe(0);
  });

  it("forbids nothing when the other bids already exceed the tricks", () => {
    expect(forbiddenLastBid([2, 2], 3)).toBeNull();
  });
});
