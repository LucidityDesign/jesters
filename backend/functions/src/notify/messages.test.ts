import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import type { GameDoc } from "../game/model.js";
import {
  notificationsFor,
  PLAYING_RECENTLY_MS,
  REACTION_PUSH_GAP_MS,
  reactionNotifications,
  reminderFor,
} from "./messages.js";

const base = {
  roomKey: "K7Q2XM",
  hostUid: "a",
  settings: { noEvenBids: true },
  players: [
    { uid: "a", name: "Anna" },
    { uid: "b", name: "Ben" },
    { uid: "c", name: "Cleo" },
  ],
  playerUids: ["a", "b", "c"],
  active: true,
  version: 1,
  round: null,
  trick: null,
  lastTrick: null,
  turnSeat: null,
  turnUid: null,
  results: [],
  status: "lobby",
} as unknown as GameDoc;

function game(changes: Partial<GameDoc>): GameDoc {
  return { ...base, ...changes };
}

const round = (number: number) =>
  ({
    number,
    totalRounds: 20,
    dealerSeat: 0,
    trumpCard: null,
    trumpSuit: null,
    bids: [],
    tricksWon: [],
    handSizes: [],
  }) as GameDoc["round"];

describe("notificationsFor", () => {
  it("never notifies bots", () => {
    const withBot = game({
      players: [
        { uid: "a", name: "Anna" },
        { uid: "b", name: "Ben" },
        { uid: "bot-x", name: "Merlin", bot: "easy" },
      ],
      playerUids: ["a", "b", "bot-x"],
    });
    const started = {
      ...withBot,
      status: "bidding",
      round: round(1),
      turnSeat: 0,
      turnUid: "a",
    } as GameDoc;
    expect(notificationsFor("g1", withBot, started).map((message) => message.uid)).toEqual([
      "b",
      "a",
    ]);
    const finished = {
      ...started,
      status: "finished",
      active: false,
      turnSeat: null,
      turnUid: null,
      results: [
        { round: 1, bids: [0, 0, 0], won: [0, 0, 1], deltas: [20, 20, -10], totals: [20, 20, -10] },
      ],
    } as GameDoc;
    expect(notificationsFor("g1", started, finished).map((message) => message.uid)).toEqual([
      "a",
      "b",
    ]);
    const botsTurn = { ...started, turnSeat: 2, turnUid: "bot-x" } as GameDoc;
    expect(notificationsFor("g1", started, botsTurn)).toEqual([]);
  });

  it("tells everyone but the host and the first player that the game started", () => {
    const after = game({ status: "bidding", round: round(1), turnSeat: 1, turnUid: "b" });
    expect(notificationsFor("g1", base, after)).toEqual([
      {
        uid: "c",
        gameId: "g1",
        titleKey: "PUSH_TITLE_GAME",
        bodyKey: "PUSH_STARTED",
        args: ["Anna"],
      },
      {
        uid: "b",
        gameId: "g1",
        titleKey: "PUSH_TITLE_YOUR_TURN",
        bodyKey: "PUSH_TURN_BID",
        args: ["1", "Anna, Cleo"],
      },
    ]);
  });

  it("notifies the next player when the turn moves on, per phase", () => {
    const before = game({ status: "bidding", round: round(3), turnUid: "b" });
    expect(
      notificationsFor("g1", before, game({ status: "bidding", round: round(3), turnUid: "c" })),
    ).toMatchObject([{ uid: "c", bodyKey: "PUSH_TURN_BID", args: ["3", "Anna, Ben"] }]);
    expect(
      notificationsFor("g1", before, game({ status: "playing", round: round(3), turnUid: "a" })),
    ).toMatchObject([{ uid: "a", bodyKey: "PUSH_TURN_PLAY" }]);
    expect(
      notificationsFor(
        "g1",
        before,
        game({ status: "choosingTrump", round: round(4), turnUid: "a" }),
      ),
    ).toMatchObject([{ uid: "a", bodyKey: "PUSH_TURN_TRUMP" }]);
  });

  it("doesn't tell players whose turn it is if they moved in the last two minutes", () => {
    const at = (ms: number) => ({ toMillis: () => ms }) as GameDoc["updatedAt"];
    const before = game({ status: "playing", round: round(3), turnUid: "b" });
    const after = (lastMove: number) =>
      game({
        status: "playing",
        round: round(3),
        turnUid: "a",
        updatedAt: at(1_000_000),
        lastMoveAt: { a: at(lastMove), b: at(1_000_000) },
      });
    expect(notificationsFor("g1", before, after(1_000_000 - 30_000))).toEqual([]);
    expect(notificationsFor("g1", before, after(1_000_000 - PLAYING_RECENTLY_MS))).toMatchObject([
      { uid: "a", bodyKey: "PUSH_TURN_PLAY" },
    ]);
  });

  it("doesn't tell players on auto-play that it's their turn, until it ends", () => {
    const at = (ms: number) => ({ toMillis: () => ms }) as GameDoc["updatedAt"];
    const before = game({ status: "playing", round: round(3), turnUid: "b", turnSeat: 1 });
    const after = (until: number) =>
      game({
        status: "playing",
        round: round(3),
        turnUid: "a",
        turnSeat: 0,
        updatedAt: at(1_000_000),
        autoPlay: { a: { until: at(until) } },
      });
    expect(notificationsFor("g1", before, after(1_000_001))).toEqual([]);
    expect(notificationsFor("g1", before, after(1_000_000))).toMatchObject([
      { uid: "a", bodyKey: "PUSH_TURN_PLAY" },
    ]);
  });

  it("stays quiet while the same player keeps the turn", () => {
    const before = game({ status: "playing", round: round(3), turnUid: "b", version: 5 });
    expect(notificationsFor("g1", before, { ...before, version: 6 })).toEqual([]);
  });

  it("stays quiet for lobby changes", () => {
    expect(notificationsFor("g1", base, game({ version: 2 }))).toEqual([]);
  });

  it("announces the winners when the game is finished", () => {
    const before = game({ status: "playing", round: round(20), turnUid: "c" });
    const after = game({
      status: "finished",
      active: false,
      turnUid: null,
      results: [{ round: 20, bids: [], won: [], deltas: [], totals: [100, 120, 120] }],
    });
    const messages = notificationsFor("g1", before, after);
    expect(messages.map((m) => m.uid)).toEqual(["a", "b", "c"]);
    expect(messages[0]).toMatchObject({ bodyKey: "PUSH_FINISHED", args: ["Ben, Cleo"] });
  });

  it("tells the others who left an abandoned game", () => {
    const before = game({ status: "playing", round: round(2), turnUid: "c" });
    const after = game({ status: "abandoned", active: false, abandonedBy: "b", turnUid: null });
    const messages = notificationsFor("g1", before, after);
    expect(messages.map((m) => m.uid)).toEqual(["a", "c"]);
    expect(messages[0]).toMatchObject({ bodyKey: "PUSH_LEFT", args: ["Ben"] });
  });

  it("tells everyone when a game expired", () => {
    const before = game({ status: "playing", round: round(2), turnUid: "c" });
    const after = game({ status: "abandoned", active: false, expired: true, turnUid: null });
    expect(notificationsFor("g1", before, after)).toMatchObject([
      { uid: "a", bodyKey: "PUSH_EXPIRED" },
      { uid: "b", bodyKey: "PUSH_EXPIRED" },
      { uid: "c", bodyKey: "PUSH_EXPIRED" },
    ]);
  });
});

describe("reminderFor", () => {
  it("names the other players", () => {
    expect(reminderFor("g1", base, "b")).toEqual({
      uid: "b",
      gameId: "g1",
      titleKey: "PUSH_TITLE_YOUR_TURN",
      bodyKey: "PUSH_REMINDER",
      args: ["Anna, Cleo"],
    });
  });
});

describe("reactionNotifications", () => {
  const reaction = (emoji: string, atMs: number) => ({
    emoji,
    at: Timestamp.fromMillis(atMs),
    nonce: "n",
  });
  const withBot = game({
    status: "playing",
    players: [
      { uid: "a", name: "Anna" },
      { uid: "b", name: "Ben" },
      { uid: "bot-x", name: "Merlin", bot: "easy" },
    ],
    playerUids: ["a", "b", "bot-x"],
  });

  it("tells the other people, not the sender or bots", () => {
    expect(reactionNotifications("g1", withBot, "a", undefined, reaction("🎉", 0))).toEqual([
      {
        uid: "b",
        gameId: "g1",
        titleKey: "PUSH_TITLE_GAME",
        bodyKey: "PUSH_REACTION",
        args: ["Anna", "🎉"],
        collapseKey: "g1-reactions",
      },
    ]);
  });

  it("skips a reaction that follows the sender's last one closely", () => {
    const first = reaction("👍", 1_000_000);
    const soon = reaction("😂", 1_000_000 + REACTION_PUSH_GAP_MS - 1);
    const later = reaction("😂", 1_000_000 + REACTION_PUSH_GAP_MS);
    expect(reactionNotifications("g1", withBot, "a", first, soon)).toEqual([]);
    expect(reactionNotifications("g1", withBot, "a", first, later)).toHaveLength(1);
  });

  it("only shows the middle finger on the table, and doesn't count it for the gap", () => {
    const rude = reaction("🖕", 1_000_000);
    const soon = reaction("😂", 1_000_000 + 1000);
    expect(reactionNotifications("g1", withBot, "a", undefined, rude)).toEqual([]);
    expect(reactionNotifications("g1", withBot, "a", rude, soon)).toHaveLength(1);
  });

  it("skips ended games and people who are not playing", () => {
    const ended = { ...withBot, status: "abandoned" } as GameDoc;
    expect(reactionNotifications("g1", ended, "a", undefined, reaction("👍", 0))).toEqual([]);
    expect(reactionNotifications("g1", withBot, "z", undefined, reaction("👍", 0))).toEqual([]);
  });
});
