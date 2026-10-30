import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { randomAction, seededRandom } from "../../test/helpers.js";
import { createDeck } from "./cards.js";
import { createGame, type GameState, reduce } from "./game.js";

/** Plays a whole game with random allowed actions, checking invariants along the way. */
function playWholeGame(playerCount: number, seed: number, noEvenBids: boolean): GameState {
  const randomInt = seededRandom(seed);
  let state = createGame({ playerCount, settings: { noEvenBids }, randomInt });
  let round = 0;

  while (state.phase !== "finished") {
    if (state.round !== round) {
      round = state.round;
      // A freshly dealt round holds every card exactly once.
      const cards = [...state.hands.flat(), ...state.deck];
      expect(cards.sort()).toEqual(createDeck().sort());
      expect(state.hands.every((hand) => hand.length === round)).toBe(true);
    }
    if (state.trick.cards.length === 0) {
      // Between tricks, every card is in one place: a hand, the deck or this round's tricks.
      const placed = [
        ...state.hands.flat(),
        ...state.deck,
        ...state.roundTricks.flatMap((trick) => trick.cards),
      ];
      expect(placed.sort()).toEqual(createDeck().sort());
    }
    const result = reduce(state, randomAction(state, randomInt), randomInt);
    if (!result.ok) throw new Error(`random allowed action rejected: ${result.error}`);
    state = result.state;
  }
  return state;
}

describe("whole games with random moves", () => {
  it("always reach a valid final state", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        fc.integer(),
        fc.boolean(),
        (playerCount, seed, noEvenBids) => {
          const final = playWholeGame(playerCount, seed, noEvenBids);

          expect(final.results).toHaveLength(60 / playerCount);
          final.results.forEach((result, index) => {
            const round = index + 1;
            expect(result.round).toBe(round);
            // Every trick of the round was won by someone.
            expect(result.won.reduce((a, b) => a + b, 0)).toBe(round);
            if (noEvenBids) {
              expect(result.bids.reduce((a, b) => a + b, 0)).not.toBe(round);
            }
            const previous = final.results[index - 1]?.totals ?? result.totals.map(() => 0);
            result.totals.forEach((total, seat) => {
              expect(total).toBe((previous[seat] as number) + (result.deltas[seat] as number));
            });
          });
        },
      ),
      { numRuns: 150 },
    );
  });
});
