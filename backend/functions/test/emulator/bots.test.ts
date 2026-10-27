import { describe, expect, it } from "vitest";
import { newPlayers, rejection, setUpRoom } from "./client.js";

interface Game {
  status: string;
  hostUid: string;
  version: number;
  turnUid: string | null;
  players: { uid: string; name: string; bot?: string; aggression?: number }[];
  playerUids: string[];
  results: { totals: number[] }[];
  lastMoveAt?: Record<string, unknown>;
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
    const bot = (name: string) => ({
      uid: expect.stringMatching(/^bot-/),
      name,
      bot: "beginner",
      aggression: expect.any(Number),
    });
    expect(game.players.slice(2)).toEqual(["Merlin", "Morgana", "Prospero", "Circe"].map(bot));
    for (const player of game.players.slice(2)) {
      expect(Math.abs(player.aggression as number)).toBeLessThanOrEqual(0.1);
    }

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

  it("plays against two bots, which move one after another", { timeout: 120_000 }, async () => {
    const [anna] = await newPlayers("Anna");
    const { gameId } = await setUpRoom([anna]);
    await anna.call("addBot", { gameId });
    await anna.call("addBot", { gameId });
    await anna.call("startGame", { gameId });

    /** Waits until it is Anna's turn: the bots move by themselves, 0.5 to 2 s apart. */
    async function annasTurn(): Promise<Game> {
      for (let attempt = 0; attempt < 100; attempt++) {
        const game = (await anna.read<Game>(`games/${gameId}`)) as Game;
        if (game.turnUid === anna.uid) return game;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      throw new Error("The bots did not move");
    }

    // The first three rounds: every round is dealt, bid, played and scored with the bots.
    for (;;) {
      const game = await annasTurn();
      if (game.results.length === 3) {
        // Only people's moves are recorded, for skipping "your turn" pushes while they play.
        expect(Object.keys(game.lastMoveAt ?? {})).toEqual([anna.uid]);
        break;
      }
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
