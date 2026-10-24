import { describe, expect, it } from "vitest";
import type { Card } from "./cards.js";
import { ledSuit, legalCards, trickWinner } from "./trick.js";

describe("ledSuit", () => {
  it.each<[Card[], string | null]>([
    [[], null],
    [["H5"], "H"],
    [["H5", "S14"], "H"],
    [["J1"], null],
    [["J1", "J2", "D3"], "D"],
    [["W1", "H5"], null],
    [["J1", "W2", "H5"], null],
  ])("%j → %s", (trick, expected) => {
    expect(ledSuit(trick)).toBe(expected);
  });
});

describe("legalCards", () => {
  const hand: Card[] = ["H3", "H12", "S7", "W1", "J1"];

  it("allows any card when leading", () => {
    expect(legalCards(hand, [])).toEqual(hand);
  });

  it("requires following the led suit, but always allows Wizards and Jesters", () => {
    expect(legalCards(hand, ["H9"])).toEqual(["H3", "H12", "W1", "J1"]);
  });

  it("allows any card when the led suit cannot be followed", () => {
    expect(legalCards(hand, ["D9"])).toEqual(hand);
  });

  it("allows any card after a Wizard lead", () => {
    expect(legalCards(hand, ["W2"])).toEqual(hand);
  });

  it("lets the first non-Jester card set the suit after a Jester lead", () => {
    expect(legalCards(hand, ["J2"])).toEqual(hand);
    expect(legalCards(hand, ["J2", "S2"])).toEqual(["S7", "W1", "J1"]);
    expect(legalCards(hand, ["J2", "W3"])).toEqual(hand);
  });

  it("allows only Wizards and Jesters besides the led suit even if trump is held", () => {
    expect(legalCards(["S2", "C14", "J3"], ["S10"])).toEqual(["S2", "J3"]);
  });
});

describe("trickWinner", () => {
  it("gives the trick to the first Wizard", () => {
    expect(trickWinner(["H14", "W1", "W2"], "H")).toBe(1);
    expect(trickWinner(["W3", "W1"], null)).toBe(0);
    expect(trickWinner(["J1", "W4", "S14"], "S")).toBe(1);
  });

  it("lets the highest trump beat the led suit", () => {
    expect(trickWinner(["H14", "S2", "S9", "H13"], "S")).toBe(2);
  });

  it("gives the trick to the highest card of the led suit without trump", () => {
    expect(trickWinner(["H5", "H14", "C14", "H9"], "S")).toBe(1);
    expect(trickWinner(["H5", "D14", "H6"], null)).toBe(2);
  });

  it("ignores high cards of other suits", () => {
    expect(trickWinner(["C2", "D14", "H14"], null)).toBe(0);
  });

  it("gives an all-Jester trick to the first Jester", () => {
    expect(trickWinner(["J3", "J1", "J2"], "H")).toBe(0);
  });

  it("uses the first non-Jester card as led suit after a Jester lead", () => {
    expect(trickWinner(["J1", "D4", "D11", "C14"], null)).toBe(2);
    expect(trickWinner(["J1", "D4", "C2"], "C")).toBe(2);
  });

  it("lets a Jester lose against anything", () => {
    expect(trickWinner(["C2", "J1"], null)).toBe(0);
  });

  it("rejects an empty trick", () => {
    expect(() => trickWinner([], null)).toThrow();
  });
});
