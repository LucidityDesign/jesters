import { describe, expect, it } from "vitest";
import { gameWith, seededRandom } from "../../test/helpers.js";
import { reduce } from "../engine/index.js";
import { botToMove, handDoc, lobbyPlay, publicPlay, secretDoc, stateFromSecret } from "./model.js";

const uids = ["alice", "bob", "carol"];
const game = gameWith({
  hands: [
    ["H14", "C3"],
    ["H2", "W1"],
    ["D5", "H9"],
  ],
  trumpCard: "S4",
  round: 2,
});

describe("publicPlay", () => {
  it("exposes the round without anyone's cards", () => {
    const play = publicPlay(game, uids);
    expect(play).toEqual({
      status: "bidding",
      round: {
        number: 2,
        totalRounds: 20,
        dealerSeat: 0,
        trumpCard: "S4",
        trumpSuit: "S",
        bids: [null, null, null],
        tricksWon: [0, 0, 0],
        handSizes: [2, 2, 2],
      },
      trick: { leaderSeat: 1, cards: [] },
      lastTrick: null,
      turnSeat: 1,
      turnUid: "bob",
      results: [],
    });
    expect(JSON.stringify(play)).not.toContain("H14");
  });

  it("includes the last completed trick", () => {
    const rng = seededRandom(1);
    let state = game;
    for (const action of [
      { type: "bid", seat: 1, bid: 1 },
      { type: "bid", seat: 2, bid: 0 },
      { type: "bid", seat: 0, bid: 0 },
      { type: "play", seat: 1, card: "H2" },
      { type: "play", seat: 2, card: "H9" },
      { type: "play", seat: 0, card: "H14" },
    ] as const) {
      const result = reduce(state, action, rng);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(publicPlay(state, uids).lastTrick).toEqual({
      leaderSeat: 1,
      cards: ["H2", "H9", "H14"],
      winnerSeat: 0,
    });
    expect(publicPlay(state, uids).turnUid).toBe("alice");
  });

  it("has no turn once the game is finished", () => {
    expect(publicPlay({ ...game, phase: "finished", turn: null }, uids).turnUid).toBeNull();
  });
});

describe("handDoc", () => {
  it("shows the forbidden bid only to the dealer on their turn", () => {
    const rng = seededRandom(1);
    const bidding = [
      { type: "bid", seat: 1, bid: 1 },
      { type: "bid", seat: 2, bid: 0 },
    ] as const;
    let state = game;
    expect(handDoc(state, 0)).toEqual({ cards: ["H14", "C3"], legalCards: [], forbiddenBid: null });
    for (const action of bidding) {
      const result = reduce(state, action, rng);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    expect(handDoc(state, 0).forbiddenBid).toBe(1);
    expect(handDoc(state, 1).forbiddenBid).toBeNull();
  });

  it("lists the legal cards of the player to play", () => {
    const playing = {
      ...game,
      phase: "playing" as const,
      turn: 2,
      trick: { leader: 1, cards: ["H2" as const] },
    };
    expect(handDoc(playing, 2).legalCards).toEqual(["H9"]);
    expect(handDoc(playing, 0).legalCards).toEqual([]);
  });
});

describe("secret state", () => {
  it("round-trips through JSON", () => {
    expect(stateFromSecret(secretDoc(game))).toEqual(game);
  });
});

describe("lobbyPlay", () => {
  it("starts without a round", () => {
    expect(lobbyPlay()).toMatchObject({ status: "lobby", round: null, turnUid: null });
  });
});

describe("botToMove", () => {
  const players = [
    { uid: "a", name: "Anna" },
    { uid: "bot-1", name: "Merlin", bot: "beginner" as const },
  ];

  it("names the level of the bot whose turn it is", () => {
    expect(botToMove({ active: true, players, turnSeat: 1 })).toBe("beginner");
  });

  it("is null for people, in the lobby and once the game is over", () => {
    expect(botToMove({ active: true, players, turnSeat: 0 })).toBeNull();
    expect(botToMove({ active: true, players, turnSeat: null })).toBeNull();
    expect(botToMove({ active: false, players, turnSeat: 1 })).toBeNull();
  });
});
