import { describe, expect, it } from "vitest";
import { newPlayers, rejection, setUpRoom, type TestPlayer } from "./client.js";

interface Game {
  status: string;
  version: number;
  turnSeat: number | null;
  round: { dealerSeat: number; bids: (number | null)[] } | null;
  playerUids: string[];
}

describe("gameAction", () => {
  it("makes any move named in `action`", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna] = players;
    const { gameId } = await setUpRoom(players);
    await anna.call("startGame", { gameId });

    const read = async () => (await anna.read<Game>(`games/${gameId}`)) as Game;
    let game = await read();
    const at = (seat: number) => players.find((p) => p.uid === game.playerUids[seat]) as TestPlayer;
    if (game.status === "choosingTrump") {
      const dealer = at(game.round?.dealerSeat as number);
      const result = await dealer.call("gameAction", {
        action: "chooseTrump",
        gameId,
        version: game.version,
        suit: "H",
      });
      expect(result).toEqual({ version: game.version + 1 });
      game = await read();
    }
    expect(game.status).toBe("bidding");

    const bidder = at(game.turnSeat as number);
    await bidder.call("gameAction", { action: "placeBid", gameId, version: game.version, bid: 0 });
    game = await read();
    expect(game.round?.bids.filter((bid) => bid !== null)).toEqual([0]);

    // The old function names still work, for app versions loaded before `gameAction`.
    const next = at(game.turnSeat as number);
    await next.call("placeBid", { gameId, version: game.version, bid: 0 });
    expect((await read()).version).toBe(game.version + 1);
  });

  it("rejects unknown actions and inputs that don't fit the action", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna] = players;
    const { gameId } = await setUpRoom(players);
    await anna.call("startGame", { gameId });
    const game = (await anna.read<Game>(`games/${gameId}`)) as Game;

    expect(await rejection(anna.call("gameAction", { action: "startGame", gameId }))).toBe(
      "INVALID_REQUEST",
    );
    expect(await rejection(anna.call("gameAction", { gameId }))).toBe("INVALID_REQUEST");
    expect(
      await rejection(
        anna.call("gameAction", { action: "placeBid", gameId, version: game.version, bid: -1 }),
      ),
    ).toBe("INVALID_REQUEST");
  });
});
