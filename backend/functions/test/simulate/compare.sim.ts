import { writeSync } from "node:fs";
import { expect, it } from "vitest";
import { chooseTrump } from "../../src/bots/easy.js";
import { SEARCH_BUDGETS } from "../../src/bots/index.js";
import { type SearchBudget, searchBid, searchPlay } from "../../src/bots/search.js";
import { viewFor } from "../../src/bots/view.js";
import { createGame, type GameState, reduce } from "../../src/engine/index.js";
import { seededRandom } from "../helpers.js";

// Compares two versions of a search bot, A and B, in duplicate: every deal is played twice, with
// A in the even seats and B in the odd ones, then swapped, so luck of the cards cancels out.
// Reports how many points per game A scores more than B (with its standard error) and how often
// each wins. Run: `A='{"rivalry":0}' B='{"rivalry":1}' pnpm simulate compare`.
//
// A and B are JSON overrides of the Hard budget. By default both count deals, not time
// (`targetMillis` 0), so the result doesn't depend on how fast the machine is; give `targetMillis`
// and `maxMillis` to compare by time. GAMES (deals, each played twice), PLAYERS (table size) and
// SEED (first deal) choose the games; split a long run into several processes with other SEEDs.

const games = Number(process.env.GAMES ?? 20);
const playerCount = Number(process.env.PLAYERS ?? 4);
const firstSeed = Number(process.env.SEED ?? 1);
const byDeals: Partial<SearchBudget> = { targetMillis: 0, maxMillis: 60_000 };
const budgetA: SearchBudget = {
  ...SEARCH_BUDGETS.hard,
  ...byDeals,
  ...JSON.parse(process.env.A ?? "{}"),
};
const budgetB: SearchBudget = {
  ...SEARCH_BUDGETS.hard,
  ...byDeals,
  ...JSON.parse(process.env.B ?? "{}"),
};

/** Plays one game; `budgets` by seat. The deals depend only on `seed`, not on the bots. */
function play(seed: number, budgets: SearchBudget[]): number[] {
  // Separate random streams: the shuffles (the deals) are the same whoever plays.
  const dealRandom = seededRandom(seed);
  const botRandom = seededRandom(seed * 7919 + 1);
  let state: GameState = createGame({ playerCount, randomInt: dealRandom });
  while (state.phase !== "finished") {
    const view = viewFor(state);
    const budget = budgets[view.seat] as SearchBudget;
    const action =
      view.phase === "choosingTrump"
        ? { type: "chooseTrump" as const, seat: view.seat, suit: chooseTrump(view) }
        : view.phase === "bidding"
          ? { type: "bid" as const, seat: view.seat, bid: searchBid(view, budget, botRandom) }
          : { type: "play" as const, seat: view.seat, card: searchPlay(view, budget, botRandom) };
    const result = reduce(state, action, dealRandom);
    if (!result.ok) throw new Error(`Rejected move: ${result.error}`);
    state = result.state;
  }
  return state.results.at(-1)?.totals as number[];
}

it("compares two search budgets", () => {
  const diffs: number[] = [];
  let winsA = 0;
  let winsB = 0;
  for (let game = 0; game < games; game++) {
    const seed = firstSeed + game;
    let diff = 0;
    for (const aFirst of [true, false]) {
      const isA = (seat: number) => (seat % 2 === 0) === aFirst;
      const budgets = Array.from({ length: playerCount }, (_, seat) =>
        isA(seat) ? budgetA : budgetB,
      );
      const totals = play(seed, budgets);
      const mean = (pick: (seat: number) => boolean) => {
        const seats = totals.map((_, seat) => seat).filter(pick);
        return seats.reduce((sum, seat) => sum + (totals[seat] as number), 0) / seats.length;
      };
      diff += (mean(isA) - mean((seat) => !isA(seat))) / 2;
      const best = Math.max(...totals);
      const winners = totals.map((_, seat) => seat).filter((seat) => totals[seat] === best);
      for (const seat of winners) {
        if (isA(seat)) winsA += 1 / winners.length;
        else winsB += 1 / winners.length;
      }
    }
    diffs.push(diff);
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const variance =
    diffs.reduce((sum, d) => sum + (d - mean) ** 2, 0) / Math.max(1, diffs.length - 1);
  const row = {
    players: playerCount,
    games,
    firstSeed,
    aMinusB: Number(mean.toFixed(1)),
    stdError: Number(Math.sqrt(variance / diffs.length).toFixed(1)),
    winsA: Number(winsA.toFixed(1)),
    winsB: Number(winsB.toFixed(1)),
    diffs: diffs.map((d) => Math.round(d)),
  };
  // Straight to stdout: Vitest holds back console output of passing tests.
  writeSync(1, `\n${JSON.stringify(row)}\n`);
  expect(diffs).toHaveLength(games);
});
