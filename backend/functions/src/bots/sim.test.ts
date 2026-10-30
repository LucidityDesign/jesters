import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Card, createDeck, type Suit, trickWinner } from "../engine/index.js";
import { playOut, type RoundSim, rolloutCard, winnerIndex } from "./sim.js";

/** A rollout state where seat 0 is to play to `trick` (led by the seats before it). */
function simWith(options: {
  hand: Card[];
  trick?: Card[];
  trump?: Suit | null;
  bid: number;
  won?: number;
  tricksLeft?: number;
  playerCount?: number;
}): RoundSim {
  const playerCount = options.playerCount ?? 3;
  const trick = options.trick ?? [];
  return {
    playerCount,
    trump: options.trump ?? null,
    hands: [options.hand, ...Array.from({ length: playerCount - 1 }, () => [])],
    bids: [options.bid, ...Array<number>(playerCount - 1).fill(0)],
    tricksWon: [options.won ?? 0, ...Array<number>(playerCount - 1).fill(0)],
    trick: [...trick],
    leader: (playerCount - trick.length) % playerCount,
    tricksLeft: options.tricksLeft ?? options.hand.length,
  };
}

describe("winnerIndex", () => {
  it("agrees with the engine's trickWinner", () => {
    const deck = createDeck();
    fc.assert(
      fc.property(
        fc.shuffledSubarray(deck, { minLength: 1, maxLength: 6 }),
        fc.constantFrom<Suit | null>("H", "D", "C", "S", null),
        (cards, trump) => {
          expect(winnerIndex(cards, trump)).toBe(trickWinner(cards, trump));
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe("the rollout policy", () => {
  describe("with its bid made", () => {
    it("ducks with the highest card that can't win", () => {
      expect(rolloutCard(simWith({ hand: ["H3", "H9", "H13"], trick: ["H10"], bid: 0 }))).toBe(
        "H9",
      );
    });

    it("dumps a high trump when a Wizard has already won the trick", () => {
      const sim = simWith({ hand: ["S14", "H3", "D9"], trick: ["W1"], trump: "S", bid: 0 });
      expect(rolloutCard(sim)).toBe("S14");
    });

    it("doesn't trump in when trump isn't winning yet", () => {
      // Void in hearts: a club or a diamond loses, a spade (trump) would win.
      const sim = simWith({ hand: ["S2", "C12", "D4"], trick: ["H10"], trump: "S", bid: 0 });
      expect(rolloutCard(sim)).toBe("C12");
    });

    it("leads low, ideally a side suit", () => {
      const sim = simWith({ hand: ["S3", "C12", "D4", "J1"], trump: "S", bid: 0 });
      expect(rolloutCard(sim)).toBe("D4");
    });

    it("keeps its Jester while it can duck with another card", () => {
      expect(rolloutCard(simWith({ hand: ["J1", "H2", "H9"], trick: ["H10"], bid: 0 }))).toBe("H9");
    });

    it("plays the Jester when every other card would win", () => {
      expect(rolloutCard(simWith({ hand: ["J1", "H12", "H13"], trick: ["H10"], bid: 0 }))).toBe(
        "J1",
      );
    });
  });

  describe("needing every trick left", () => {
    it("takes the trick with the cheapest winner when playing last", () => {
      const sim = simWith({ hand: ["H11", "H14", "W1"], trick: ["H10", "H2"], bid: 3 });
      expect(rolloutCard(sim)).toBe("H11");
    });

    it("leads its strongest card", () => {
      expect(rolloutCard(simWith({ hand: ["H11", "W1", "C3"], bid: 3 }))).toBe("W1");
    });
  });

  describe("needing some of the tricks left", () => {
    it("wins cheaply with a side-suit card", () => {
      const sim = simWith({ hand: ["H12", "S13", "C3"], trick: ["H10"], trump: "S", bid: 1 });
      expect(rolloutCard(sim)).toBe("H12");
    });

    it("saves its Wizard and ducks when a cheap win isn't there", () => {
      const sim = simWith({ hand: ["W1", "H3", "C9"], trick: ["H10"], bid: 2, tricksLeft: 3 });
      // W1 is a sure winner it keeps; H3 is the only safe loser (it must follow hearts).
      expect(rolloutCard(sim)).toBe("H3");
    });

    it("with as many sure winners as tricks needed, loses everything else", () => {
      // H12 would win this trick cheaply, but the Wizard covers the one trick still needed.
      const sim = simWith({ hand: ["W1", "H12", "H3"], trick: ["H10"], bid: 1, tricksLeft: 3 });
      expect(rolloutCard(sim)).toBe("H3");
    });
  });

  it("plays out whole rounds with legal cards, every trick won by someone", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer(),
        (n, round, seed) => {
          const deck = createDeck().sort(
            (a, b) => ((a.charCodeAt(0) * 31 + b.length + seed) % 7) - 3,
          );
          const sim: RoundSim = {
            playerCount: n,
            trump: "H",
            hands: Array.from({ length: n }, (_, seat) =>
              deck.slice(seat * round, (seat + 1) * round),
            ),
            bids: Array<number>(n).fill(1),
            tricksWon: Array<number>(n).fill(0),
            trick: [],
            leader: 0,
            tricksLeft: round,
          };
          playOut(sim);
          expect(sim.tricksWon.reduce((a, b) => a + b, 0)).toBe(round);
          expect(sim.hands.every((hand) => hand.length === 0)).toBe(true);
        },
      ),
    );
  });
});
