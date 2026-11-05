import type { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { gameWith, seededRandom } from "../../test/helpers.js";
import { type RoundResult, reduce } from "../engine/index.js";
import {
  applyQueuedBids,
  applyQueuedCards,
  botToMove,
  finalTotals,
  handDoc,
  lobbyPlay,
  type Player,
  type PublicRound,
  penaltyOf,
  publicPlay,
  secretDoc,
  stateFromSecret,
} from "./model.js";

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
    expect(handDoc(state, 0)).toEqual({
      cards: ["H14", "C3"],
      legalCards: [],
      forbiddenBid: null,
      queuedBid: null,
      queuedCard: null,
    });
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
    { uid: "bot-1", name: "Merlin", bot: "hard" as const },
  ];
  const at = (ms: number) => ({ toMillis: () => ms }) as Timestamp;
  const inRound = (number: number) => ({ number }) as PublicRound;

  it("plays for a person who left, and for a stalled turn the others handed to a bot", () => {
    const annasTurn = { active: true, players, turnSeat: 0, version: 7 };
    expect(botToMove(annasTurn)).toBeNull();
    const left = [{ ...players[0], left: true }, players[1]] as typeof players;
    expect(botToMove({ ...annasTurn, players: left })).toBe("medium");
    expect(botToMove({ ...annasTurn, botMoveVersion: 7 })).toBe("medium");
    // Only for that one move.
    expect(botToMove({ ...annasTurn, botMoveVersion: 6 })).toBeNull();
  });

  it("plays for a person on auto-play", () => {
    const annasTurn = {
      active: true,
      players,
      turnSeat: 0,
      round: inRound(3),
      updatedAt: at(5000),
    };
    expect(botToMove({ ...annasTurn, autoPlay: { a: {} } })).toBe("medium");
    expect(botToMove({ ...annasTurn, autoPlay: { b: {} } })).toBeNull();
    expect(botToMove({ ...annasTurn, autoPlay: { a: {} }, active: false })).toBeNull();
  });

  it("stops auto-play at its time, decided by when the turn began", () => {
    const annasTurn = { active: true, players, turnSeat: 0, round: inRound(3) };
    const autoPlay = { a: { until: at(5000) } };
    expect(botToMove({ ...annasTurn, autoPlay, updatedAt: at(4999) })).toBe("medium");
    expect(botToMove({ ...annasTurn, autoPlay, updatedAt: at(5000) })).toBeNull();
  });

  it("stops auto-play after its last round", () => {
    const annasTurn = { active: true, players, turnSeat: 0, updatedAt: at(0) };
    const autoPlay = { a: { untilRound: 4 } };
    expect(botToMove({ ...annasTurn, autoPlay, round: inRound(4) })).toBe("medium");
    expect(botToMove({ ...annasTurn, autoPlay, round: inRound(5) })).toBeNull();
  });

  it("names the level of the bot whose turn it is", () => {
    expect(botToMove({ active: true, players, turnSeat: 1 })).toBe("hard");
  });

  it("plays bots from older versions as easy", () => {
    const legacy = [players[0] as Player, { uid: "bot-2", name: "Puck", bot: "beginner" as const }];
    expect(botToMove({ active: true, players: legacy, turnSeat: 1 })).toBe("easy");
  });

  it("is null for people, in the lobby and once the game is over", () => {
    expect(botToMove({ active: true, players, turnSeat: 0 })).toBeNull();
    expect(botToMove({ active: true, players, turnSeat: null })).toBeNull();
    expect(botToMove({ active: false, players, turnSeat: 1 })).toBeNull();
  });
});

describe("stall penalties", () => {
  const game = {
    players: [
      { uid: "a", name: "Anna" },
      { uid: "b", name: "Ben" },
    ],
    results: [{ totals: [30, 20] }, { totals: [60, 10] }] as unknown as RoundResult[],
    stallPenalties: { b: { "1": 5, "2": 10 } },
  };

  it("counts the points lost up to a round", () => {
    expect(penaltyOf(game, "b", 1)).toBe(5);
    expect(penaltyOf(game, "b")).toBe(15);
    expect(penaltyOf(game, "a")).toBe(0);
  });

  it("takes them off the totals", () => {
    expect(finalTotals(game)).toEqual([60, -5]);
    expect(finalTotals({ ...game, results: [] })).toEqual([0, -15]);
  });
});

describe("applyQueuedBids", () => {
  // Bob bids first, then Carol, then Alice, the dealer.
  const afterBob = (() => {
    const result = reduce(game, { type: "bid", seat: 1, bid: 1 }, seededRandom(1));
    if (!result.ok) throw new Error(result.error);
    return result.state;
  })();
  const random = seededRandom(2);

  it("places the queued bids of whoever's turn it is, one after another", () => {
    const { state, queued } = applyQueuedBids(
      afterBob,
      uids,
      { carol: { round: 2, bid: 0 }, alice: { round: 2, bid: 0 } },
      random,
    );
    expect(state.bids).toEqual([0, 1, 0]);
    expect(state.phase).toBe("playing");
    expect(queued).toEqual({});
  });

  it("waits for a player without a queued bid", () => {
    const { state, queued } = applyQueuedBids(
      afterBob,
      uids,
      { alice: { round: 2, bid: 0 } },
      random,
    );
    expect(state).toBe(afterBob);
    expect(queued).toEqual({ alice: { round: 2, bid: 0 } });
  });

  it("keeps a bid the rules rule out as rejected, for the player to bid again", () => {
    // Bids 1 + 0 + 1 would equal the 2 tricks ("no even bids").
    const { state, queued } = applyQueuedBids(
      afterBob,
      uids,
      { carol: { round: 2, bid: 0 }, alice: { round: 2, bid: 1 } },
      random,
    );
    expect(state.bids).toEqual([null, 1, 0]);
    expect(state.turn).toBe(0);
    expect(queued).toEqual({ alice: { round: 2, bid: 1, rejected: true } });
    // It stays until Alice bids herself.
    expect(applyQueuedBids(state, uids, queued, random).state).toBe(state);
  });

  it("drops bids queued for another round or already placed", () => {
    const { queued } = applyQueuedBids(
      afterBob,
      uids,
      { bob: { round: 2, bid: 1 }, alice: { round: 1, bid: 0 } },
      random,
    );
    expect(queued).toEqual({});
  });
});

describe("applyQueuedCards", () => {
  // Bob bid 1, Carol and Alice 0; Bob leads the first trick.
  const playing = (() => {
    let state = game;
    for (const action of [
      { type: "bid", seat: 1, bid: 1 },
      { type: "bid", seat: 2, bid: 0 },
      { type: "bid", seat: 0, bid: 0 },
    ] as const) {
      const result = reduce(state, action, seededRandom(1));
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    return state;
  })();
  const play = (state: typeof game, seat: number, card: "H2" | "H9" | "D5" | "H14" | "C3") => {
    const result = reduce(state, { type: "play", seat, card }, seededRandom(1));
    if (!result.ok) throw new Error(result.error);
    return result.state;
  };
  const random = seededRandom(2);

  it("plays the queued cards of whoever's turn it is, on into the next trick", () => {
    const afterBob = play(playing, 1, "H2");
    const { state, queued } = applyQueuedCards(
      afterBob,
      uids,
      { carol: { round: 2, card: "H9" }, alice: { round: 2, card: "H14" } },
      random,
    );
    expect(state.lastTrick?.cards).toEqual(["H2", "H9", "H14"]);
    // Alice won the trick and leads the next one herself.
    expect(state.turn).toBe(0);
    expect(queued).toEqual({});
  });

  it("waits for a player without a queued card", () => {
    const queued = { alice: { round: 2, card: "C3" as const } };
    const result = applyQueuedCards(playing, uids, queued, random);
    expect(result.state).toBe(playing);
    expect(result.queued).toEqual(queued);
  });

  it("keeps a card the rules don't allow as rejected until its player has played", () => {
    const afterBob = play(playing, 1, "H2");
    // Carol has to follow hearts with the 9.
    const first = applyQueuedCards(afterBob, uids, { carol: { round: 2, card: "D5" } }, random);
    expect(first.state).toBe(afterBob);
    expect(first.queued).toEqual({ carol: { round: 2, card: "D5", rejected: true } });
    expect(applyQueuedCards(afterBob, uids, first.queued, random).state).toBe(afterBob);
    const afterCarol = play(afterBob, 2, "H9");
    expect(applyQueuedCards(afterCarol, uids, first.queued, random).queued).toEqual({});
  });

  it("drops cards queued for another round or no longer in hand", () => {
    const { queued } = applyQueuedCards(
      play(playing, 1, "H2"),
      uids,
      { bob: { round: 2, card: "H2" }, alice: { round: 1, card: "H14" } },
      random,
    );
    expect(queued).toEqual({});
  });
});
