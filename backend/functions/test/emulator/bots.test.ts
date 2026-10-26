import { describe, expect, it } from "vitest";
import { newPlayers, rejection, setUpRoom } from "./client.js";

interface Game {
  status: string;
  hostUid: string;
  version: number;
  turnUid: string | null;
  players: { uid: string; name: string; bot?: string }[];
  playerUids: string[];
  results: { totals: number[] }[];
}

interface Hand {
  legalCards: string[];
  forbiddenBid: number | null;
}

describe("bots", () => {
  it("lets the host add and remove bots in the lobby", async () => {
    const [anna, ben] = await newPlayers("Anna", "Ben");
    const { gameId } = await setUpRoom([anna, ben]);

    expect(await rejection(ben.call("addBot", { gameId }))).toBe("NOT_HOST");
    expect(await rejection(anna.call("addBot", { gameId, level: "grandmaster" }))).toBe(
      "INVALID_REQUEST",
    );
    for (let i = 0; i < 4; i++) await anna.call("addBot", { gameId });
    expect(await rejection(anna.call("addBot", { gameId }))).toBe("ROOM_FULL");

    let game = (await anna.read<Game>(`games/${gameId}`)) as Game;
    expect(game.players.slice(2)).toEqual([
      { uid: expect.stringMatching(/^bot-/), name: "Merlin", bot: "beginner" },
      { uid: expect.stringMatching(/^bot-/), name: "Morgana", bot: "beginner" },
      { uid: expect.stringMatching(/^bot-/), name: "Prospero", bot: "beginner" },
      { uid: expect.stringMatching(/^bot-/), name: "Circe", bot: "beginner" },
    ]);

    await anna.call("removePlayer", { gameId, uid: game.playerUids[2] });
    game = (await anna.read<Game>(`games/${gameId}`)) as Game;
    expect(game.players.map((player) => player.name)).toEqual([
      "Anna",
      "Ben",
      "Morgana",
      "Prospero",
      "Circe",
    ]);

    // A person, never a bot, takes over as host; a room with only bots is deleted.
    await anna.call("leaveGame", { gameId });
    expect((await ben.read<Game>(`games/${gameId}`))?.hostUid).toBe(ben.uid);
    await ben.call("leaveGame", { gameId });
    expect(await rejection(ben.call("leaveGame", { gameId }))).toBe("GAME_NOT_FOUND");
  });

  it("plays a whole game against two bots", { timeout: 300_000 }, async () => {
    const [anna] = await newPlayers("Anna");
    const { gameId } = await setUpRoom([anna]);
    await anna.call("addBot", { gameId });
    await anna.call("addBot", { gameId });
    await anna.call("startGame", { gameId });

    for (;;) {
      const game = (await anna.read<Game>(`games/${gameId}`)) as Game;
      if (game.status === "finished") {
        expect(game.results).toHaveLength(20);
        break;
      }
      // The bots have moved by the time the game reaches Anna.
      expect(game.turnUid).toBe(anna.uid);
      const hand = (await anna.read<Hand>(`games/${gameId}/hands/${anna.uid}`)) as Hand;
      const version = game.version;
      if (game.status === "choosingTrump") {
        await anna.call("chooseTrump", { gameId, version, suit: "S" });
      } else if (game.status === "bidding") {
        await anna.call("placeBid", { gameId, version, bid: hand.forbiddenBid === 0 ? 1 : 0 });
      } else {
        await anna.call("playCard", { gameId, version, card: hand.legalCards[0] });
      }
    }
  });
});
