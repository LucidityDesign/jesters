import { describe, expect, it } from "vitest";
import type { GameDoc, Player, RoundResult } from "./model";
import { averagePlace, averagePoints, computeStats, hitRate, winRate } from "./stats";

function game(
  players: Player[],
  results: Omit<RoundResult, "deltas">[],
  extra: Partial<GameDoc> = {},
): GameDoc {
  return {
    status: "finished",
    players,
    playerUids: players.map((p) => p.uid),
    results: results.map((r) => ({ ...r, deltas: [] })),
    ...extra,
  } as unknown as GameDoc;
}

const anna = { uid: "a", name: "Anna" };
const ben = { uid: "b", name: "Ben" };
const cleo = { uid: "c", name: "Cleo" };

describe("computeStats", () => {
  // Newest first: Anna's newest name is "Anna", an older one "Annie".
  const games = [
    game(
      [anna, ben, { uid: "bot-1", name: "Bot", bot: "hard" }],
      [
        { round: 1, bids: [1, 0, 0], won: [1, 0, 0], totals: [30, 20, 20] },
        { round: 2, bids: [1, 1, 0], won: [2, 0, 0], totals: [20, 10, 40] },
      ],
    ),
    game(
      [{ ...anna, name: "Annie" }, ben, cleo],
      [{ round: 1, bids: [0, 1, 0], won: [0, 1, 0], totals: [20, 30, 20] }],
      { autoPlayedRounds: { a: [1] } },
    ),
    game(
      [anna, { uid: "bot-2", name: "Bot", bot: "hard" }],
      [{ round: 1, bids: [1, 0], won: [0, 1], totals: [-10, -10] }],
    ),
    // Not finished: does not count.
    game([anna, cleo], [{ round: 1, bids: [0, 0], won: [0, 1], totals: [20, -10] }], {
      status: "abandoned",
    }),
  ];
  const { me, opponents } = computeStats(games, "a");

  it("counts the player's own games, wins, points and places", () => {
    expect(me.games).toBe(3);
    // A tie for first counts as a win.
    expect(me.wins).toBe(1);
    expect(winRate(me)).toBeCloseTo(1 / 3);
    expect(averagePoints(me)).toBeCloseTo(10);
    expect(me.best).toBe(20);
    expect(averagePlace(me)).toBeCloseTo((2 + 2 + 1) / 3);
  });

  it("counts the bids the player made themselves, not those a bot made for them", () => {
    expect(me.rounds).toBe(3);
    expect(me.hits).toBe(1);
    expect(me.over).toBe(1);
    expect(me.under).toBe(1);
    expect(hitRate(me)).toBeCloseTo(1 / 3);
  });

  it("ranks opponents, one entry per bot level, with the head-to-head record", () => {
    expect(opponents.map((o) => o.key)).toEqual(["bot:hard", "b", "c"]);
    const bot = opponents[0];
    expect(bot).toMatchObject({ bot: "hard", games: 2, wins: 2, ahead: 0, behind: 1, level: 1 });
    expect(bot?.rounds).toBe(0);
    const benStats = opponents.find((o) => o.key === "b");
    expect(benStats).toMatchObject({ name: "Ben", games: 2, wins: 1, ahead: 1, behind: 1 });
    expect(benStats?.hits).toBe(2);
    expect(benStats?.under).toBe(1);
  });

  it("takes names from the newest game and skips people who deleted their data", () => {
    const withFormer = computeStats(
      [
        game(
          [anna, { uid: "x", name: "" }],
          [{ round: 1, bids: [0, 0], won: [0, 1], totals: [20, -10] }],
        ),
      ],
      "a",
    );
    expect(withFormer.opponents).toEqual([]);
    expect(withFormer.me.games).toBe(1);
  });
});
