import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { seededRandom } from "../../test/helpers.js";
import { type Card, createGame, type GameState, reduce } from "../engine/index.js";
import { estimateBid, estimateTricks } from "./estimate.js";
import { botAction, type BotLevel, dealsFor, playBots, SEARCH_BUDGETS } from "./index.js";
import { handSizes, knownVoids, sampleDeal, unseenCards } from "./knowledge.js";
import { pickCard, type SearchBudget, searchBid, searchPlay } from "./search.js";
import { type BotView, viewFor } from "./view.js";

const budget: SearchBudget = { playDeals: 40, bidDeals: 30, fitBids: false, maxMillis: 10_000 };

/** A view of seat 0 while playing, the other two seats at a 3-player table. */
function playingView(options: Partial<BotView> & Pick<BotView, "hand">): BotView {
  return {
    seat: 0,
    playerCount: 3,
    phase: "playing",
    round: options.hand.length,
    dealer: 2,
    trumpCard: null,
    trumpSuit: null,
    bids: [0, 0, 0],
    tricksWon: [0, 0, 0],
    trick: { leader: 0, cards: [] },
    roundTricks: [],
    noEvenBids: true,
    legalCards: options.hand,
    forbiddenBid: null,
    results: [],
    aggression: 0,
    ...options,
  };
}

/** Plays a game with random seeds up to the first decision of a search bot that needs a view. */
function midRound(seed: number, moves: number): GameState {
  const randomInt = seededRandom(seed);
  let state = createGame({ playerCount: 4, randomInt });
  // Skip to a round with several cards.
  for (let i = 0; i < moves && state.phase !== "finished"; i++) {
    const result = reduce(state, botAction(state, "easy"), randomInt);
    if (result.ok) state = result.state;
  }
  return state;
}

describe("what a bot knows", () => {
  it("never deals cards it has seen, and gives everyone the right number of cards", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 0, max: 60 }), (seed, moves) => {
        const state = midRound(seed, moves);
        if (state.phase === "finished") return;
        const view = viewFor(state);
        const hands = sampleDeal(view, { fitBids: true }, seededRandom(seed));
        const seen = new Set<Card>([
          ...view.hand,
          ...view.roundTricks.flatMap((trick) => trick.cards),
          ...view.trick.cards,
          ...(view.trumpCard ? [view.trumpCard] : []),
        ]);
        expect(hands[view.seat]).toEqual(view.hand);
        hands.forEach((hand, seat) => {
          expect(hand).toHaveLength(state.hands[seat]?.length as number);
          if (seat !== view.seat) expect(hand.some((card) => seen.has(card))).toBe(false);
        });
        expect(new Set(hands.flat()).size).toBe(hands.flat().length);
        expect(unseenCards(view).every((card) => !seen.has(card))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("knows who couldn't follow suit, and deals around it", () => {
    const view = playingView({
      hand: ["C2", "C3"],
      round: 3,
      tricksWon: [0, 1, 0],
      // Seat 2 didn't follow hearts; seat 1 played a Wizard, which says nothing.
      roundTricks: [{ leader: 0, cards: ["H5", "W1", "D9"], winner: 1 }],
      trick: { leader: 1, cards: ["S4", "S9"] },
      bids: [1, 1, 1],
    });
    expect(knownVoids(view).map((suits) => [...suits])).toEqual([[], [], ["H"]]);
    expect(handSizes(view)).toEqual([2, 1, 1]);
    for (let seed = 0; seed < 50; seed++) {
      const hands = sampleDeal(view, { fitBids: false }, seededRandom(seed));
      expect(hands[2]?.some((card) => card.startsWith("H"))).toBe(false);
    }
  });

  it("still deals when the known voids leave too few cards", () => {
    // Seat 1 has shown it holds no suit at all, so only Jesters could fill its four cards, but
    // three are left: the voids must give.
    const view = playingView({
      hand: ["W1", "W2", "W3", "W4"],
      round: 8,
      trumpCard: "J1",
      tricksWon: [3, 0, 1],
      roundTricks: [
        { leader: 0, cards: ["H2", "C5", "S2"], winner: 0 },
        { leader: 0, cards: ["D2", "S6", "D3"], winner: 2 },
        { leader: 2, cards: ["C2", "C3", "S7"], winner: 0 },
        { leader: 0, cards: ["S3", "H4", "D4"], winner: 0 },
      ],
      bids: [3, 0, 1],
    });
    expect([...(knownVoids(view)[1] as Set<string>)].sort()).toEqual(["C", "D", "H", "S"]);
    const hands = sampleDeal(view, { fitBids: true }, seededRandom(1));
    expect(hands.map((hand) => hand.length)).toEqual([4, 4, 4]);
  });
});

describe("trick estimates", () => {
  it("rates Wizards and high trumps above low side cards", () => {
    expect(estimateTricks(["W1"], "S", 4, 5)).toBeGreaterThan(
      estimateTricks(["S14"], "S", 4, 5) - 0.2,
    );
    expect(estimateTricks(["S14"], "S", 4, 5)).toBeGreaterThan(estimateTricks(["H3"], "S", 4, 5));
    expect(estimateTricks(["J1"], "S", 4, 5)).toBeLessThan(0.05);
  });

  it("bids around the forbidden bid", () => {
    const hand: Card[] = ["J1", "J2", "H2"];
    expect(estimateBid(hand, "S", 3, 3, null)).toBe(0);
    expect(estimateBid(hand, "S", 3, 3, 0)).toBe(1);
  });
});

describe("the search", () => {
  it("on a tie, keeps its highest card, then plays the weaker card", () => {
    const view = playingView({ hand: ["H11", "H14", "C5", "C9"], trumpSuit: "C" });
    expect(pickCard(view, ["H11", "C9", "H14"], [10, 10, 10])).toBe("H11");
    expect(pickCard(view, ["H11", "C9"], [10, 20])).toBe("C9");
  });

  it("takes the trick it needs with the card it would rather not keep", () => {
    // After this trick it wants none: the ace would be a liability later, the jack less so.
    const view = playingView({
      hand: ["H11", "H14", "C2"],
      legalCards: ["H11", "H14"],
      trick: { leader: 1, cards: ["H10", "H2"] },
      bids: [1, 0, 0],
    });
    expect(searchPlay(view, budget, seededRandom(1))).toBe("H14");
  });

  it("ducks once its bid is made", () => {
    const view = playingView({
      hand: ["H12", "H3", "C2"],
      legalCards: ["H12", "H3"],
      round: 4,
      bids: [1, 1, 1],
      tricksWon: [1, 0, 0],
      roundTricks: [{ leader: 0, cards: ["W1", "D3", "D4"], winner: 0 }],
      trick: { leader: 1, cards: ["H10", "H2"] },
    });
    expect(searchPlay(view, budget, seededRandom(1))).toBe("H3");
  });

  it("bids high with a strong hand and zero with a hopeless one", () => {
    const strong = playingView({
      phase: "bidding",
      hand: ["W1", "W2", "W3", "S14"],
      trumpSuit: "S",
      trumpCard: "S2",
      bids: [null, null, null],
      legalCards: [],
    });
    expect(searchBid(strong, budget, seededRandom(2))).toBe(4);
    const weak = { ...strong, hand: ["J1", "J2", "H2", "C3"] as Card[] };
    expect(searchBid(weak, budget, seededRandom(2))).toBe(0);
  });

  it("never bids the forbidden bid", () => {
    const view = playingView({
      phase: "bidding",
      hand: ["J1", "J2", "H2", "C3"],
      seat: 2,
      bids: [2, 2, null],
      forbiddenBid: 0,
      legalCards: [],
    });
    expect(searchBid(view, budget, seededRandom(3))).not.toBe(0);
  });

  it("stops at its time limit and still answers", () => {
    const view = playingView({
      phase: "bidding",
      hand: ["J1", "H2", "C3"],
      bids: [null, null, null],
      legalCards: [],
    });
    let clock = 0;
    const now = () => (clock += 1000);
    expect(searchBid(view, budget, seededRandom(4), { now })).toBeGreaterThanOrEqual(0);
    expect(["J1", "H2", "C3"]).toContain(
      searchPlay(
        { ...view, phase: "playing", legalCards: ["J1", "H2", "C3"] },
        budget,
        seededRandom(4),
        { now },
      ),
    );
  });
});

describe("the Medium and Hard bots", () => {
  it.each<BotLevel>(["medium", "hard"])(
    "play whole %s games with legal moves only",
    (level) => {
      const randomInt = seededRandom(7);
      const state = createGame({ playerCount: 6, randomInt });
      const final = playBots(state, [level, "easy", level, "medium", level, "easy"], randomInt);
      expect(final.phase).toBe("finished");
    },
    60_000,
  );

  it("simulate more deals at larger tables, within the same time limit", () => {
    const base = SEARCH_BUDGETS.medium;
    expect(dealsFor(base, 3)).toEqual(base);
    expect(dealsFor(base, 6)).toEqual({
      ...base,
      playDeals: base.playDeals * 3,
      bidDeals: base.bidDeals * 3,
    });
  });

  it("think within their time limits", () => {
    expect(SEARCH_BUDGETS.medium.maxMillis).toBeLessThan(SEARCH_BUDGETS.hard.maxMillis);
    expect(SEARCH_BUDGETS.hard.maxMillis).toBeLessThanOrEqual(1000);
  });
});
