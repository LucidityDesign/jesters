import { writeSync } from "node:fs";
import { expect, it } from "vitest";
import { botAction, type BotLevel } from "../../src/bots/index.js";
import { createGame, type GameState, reduce } from "../../src/engine/index.js";
import { seededRandom } from "../helpers.js";

// Plays whole games between bot levels and reports the average final score, how often each level
// wins, how often it makes its bid exactly, and the slowest decisions. GAMES sets the games per
// table, LEVELS the seating (comma-separated, e.g. "hard,medium,easy"; rotated every game so no
// level keeps the same seat), PLAYERS the table sizes.

const games = Number(process.env.GAMES ?? 30);
const seating = (process.env.LEVELS ?? "hard,medium,easy").split(",") as BotLevel[];
const tables = (process.env.PLAYERS ?? "3,4,5,6").split(",").map(Number);

interface Stats {
  score: number;
  wins: number;
  bids: number;
  exact: number;
  slowestMs: number;
}

it("compares the bot levels", () => {
  for (const playerCount of tables) {
    const stats = new Map<BotLevel, Stats>();
    for (let game = 0; game < games; game++) {
      const randomInt = seededRandom(1000 * playerCount + game);
      const levels = Array.from(
        { length: playerCount },
        (_, seat) => seating[(seat + game) % seating.length] as BotLevel,
      );
      let state: GameState = createGame({ playerCount, randomInt });
      while (state.phase !== "finished") {
        const seat = state.turn as number;
        const level = levels[seat] as BotLevel;
        const started = performance.now();
        const action = botAction(state, level, 0, randomInt);
        const ms = performance.now() - started;
        const entry = stats.get(level) ?? { score: 0, wins: 0, bids: 0, exact: 0, slowestMs: 0 };
        entry.slowestMs = Math.max(entry.slowestMs, ms);
        stats.set(level, entry);
        const result = reduce(state, action, randomInt);
        if (!result.ok) throw new Error(`${level} made a rejected move: ${result.error}`);
        state = result.state;
      }
      const totals = state.results.at(-1)?.totals as number[];
      const best = Math.max(...totals);
      levels.forEach((level, seat) => {
        const entry = stats.get(level) as Stats;
        entry.score += (totals[seat] as number) / levels.filter((l) => l === level).length;
        if (totals[seat] === best) entry.wins += 1 / levels.filter((l) => l === level).length;
        for (const result of state.results) {
          entry.bids++;
          if (result.bids[seat] === result.won[seat]) entry.exact++;
        }
      });
    }
    const rows = [...stats].map(([level, s]) => ({
      level,
      avgScore: Math.round(s.score / games),
      winShare: `${Math.round((100 * s.wins) / games)}%`,
      exactBids: `${Math.round((100 * s.exact) / s.bids)}%`,
      slowestMs: Math.round(s.slowestMs),
    }));
    // Straight to stdout: Vitest holds back console output of passing tests.
    writeSync(1, `\n${playerCount} players, ${games} games\n`);
    for (const row of rows) writeSync(1, `${JSON.stringify(row)}\n`);
    expect(rows.length).toBeGreaterThan(0);
  }
});
