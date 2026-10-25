import { describe, expect, it } from "vitest";
import { seededRandom } from "../../test/helpers.js";
import {
  createDeck,
  isCard,
  isJester,
  isWizard,
  parseCard,
  rankOf,
  shuffle,
  SUITS,
  suitOf,
} from "./cards.js";

describe("createDeck", () => {
  const deck = createDeck();

  it("has 60 unique, valid cards", () => {
    expect(deck).toHaveLength(60);
    expect(new Set(deck).size).toBe(60);
    expect(deck.every(isCard)).toBe(true);
  });

  it("has 13 cards per suit, ranked 2 to 14", () => {
    for (const suit of SUITS) {
      const ranks = deck.filter((card) => suitOf(card) === suit).map(rankOf);
      expect(ranks).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    }
  });

  it("has 4 Wizards and 4 Jesters", () => {
    expect(deck.filter(isWizard)).toHaveLength(4);
    expect(deck.filter(isJester)).toHaveLength(4);
  });
});

describe("isCard", () => {
  it.each(["H2", "D10", "C13", "S14", "W1", "W4", "J1", "J4"])("accepts %s", (value) => {
    expect(isCard(value)).toBe(true);
  });

  it.each(["", "H1", "H15", "H02", "W0", "W5", "J5", "X3", "h2", "S14 ", 7, null])(
    "rejects %j",
    (value) => {
      expect(isCard(value)).toBe(false);
    },
  );
});

describe("parseCard", () => {
  it("parses regular cards, Wizards and Jesters", () => {
    expect(parseCard("H14")).toEqual({ kind: "suit", suit: "H", rank: 14 });
    expect(parseCard("C2")).toEqual({ kind: "suit", suit: "C", rank: 2 });
    expect(parseCard("W3")).toEqual({ kind: "wizard" });
    expect(parseCard("J2")).toEqual({ kind: "jester" });
  });

  it("gives Wizards and Jesters no suit or rank", () => {
    expect(suitOf("W1")).toBeNull();
    expect(rankOf("J1")).toBeNull();
  });
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, seededRandom(42));
    expect(deck).toEqual(createDeck());
    expect(shuffled).not.toEqual(deck);
    expect([...shuffled].sort()).toEqual([...deck].sort());
  });

  it("is deterministic for a given random source", () => {
    expect(shuffle(createDeck(), seededRandom(7))).toEqual(shuffle(createDeck(), seededRandom(7)));
  });
});
