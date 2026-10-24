import { describe, expect, it } from "vitest";
import { newPlayer, newPlayers, rejection, setUpRoom, type TestPlayer } from "./client.js";

interface Game {
  status: string;
  version: number;
  turnUid: string | null;
  turnSeat: number | null;
  active: boolean;
  round: { number: number; trumpSuit: string | null; handSizes: number[] } | null;
  results: { round: number; won: number[]; bids: number[]; deltas: number[]; totals: number[] }[];
}

interface Hand {
  cards: string[];
  legalCards: string[];
  forbiddenBid: number | null;
}

describe("a complete game through the API", () => {
  it("plays all 20 rounds with 3 players", { timeout: 300_000 }, async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna] = players;
    const { gameId, roomKey } = await setUpRoom(players);
    await anna.call("startGame", { gameId });

    const byUid = new Map(players.map((player) => [player.uid, player]));
    let checkedRejections = false;

    for (;;) {
      const game = (await anna.read<Game>(`games/${gameId}`)) as Game;
      if (game.status === "finished") break;

      const current = byUid.get(game.turnUid as string) as TestPlayer;
      const hand = (await current.read<Hand>(`games/${gameId}/hands/${current.uid}`)) as Hand;
      expect(hand.cards).toHaveLength(game.round?.handSizes[game.turnSeat as number] as number);

      if (!checkedRejections && game.status === "playing") {
        checkedRejections = true;
        const other = players.find((player) => player !== current) as TestPlayer;
        expect(await rejection(other.call("playCard", { gameId, card: hand.legalCards[0] }))).toBe(
          "NOT_YOUR_TURN",
        );
        expect(
          await rejection(
            current.call("playCard", {
              gameId,
              card: hand.legalCards[0],
              version: game.version - 1,
            }),
          ),
        ).toBe("STALE_VERSION");
        const notInHand = ["H2", "H3", "S2", "S3"].find((card) => !hand.cards.includes(card));
        expect(await rejection(current.call("playCard", { gameId, card: notInHand }))).toBe(
          "CARD_NOT_IN_HAND",
        );
      }

      const version = game.version;
      switch (game.status) {
        case "choosingTrump":
          await current.call("chooseTrump", { gameId, version, suit: "H" });
          break;
        case "bidding": {
          const bid = hand.forbiddenBid === 0 ? 1 : 0;
          if (hand.forbiddenBid !== null) {
            expect(
              await rejection(current.call("placeBid", { gameId, bid: hand.forbiddenBid })),
            ).toBe("BID_SUM_NOT_ALLOWED");
          }
          await current.call("placeBid", { gameId, version, bid });
          break;
        }
        case "playing":
          await current.call("playCard", { gameId, version, card: hand.legalCards[0] });
          break;
        default:
          throw new Error(`unexpected status ${game.status}`);
      }
    }

    const final = (await anna.read<Game>(`games/${gameId}`)) as Game;
    expect(final.active).toBe(false);
    expect(final.turnUid).toBeNull();
    expect(final.results).toHaveLength(20);
    final.results.forEach((result, index) => {
      expect(result.round).toBe(index + 1);
      expect(result.won.reduce((a, b) => a + b, 0)).toBe(index + 1);
      expect(result.bids.reduce((a, b) => a + b, 0)).not.toBe(index + 1);
    });
    // The room key is freed when the game ends.
    const newcomer = await newPlayer("Dora");
    expect(await rejection(newcomer.call("joinRoom", { roomKey, name: "Dora" }))).toBe(
      "ROOM_NOT_FOUND",
    );
    expect(await rejection(anna.call("placeBid", { gameId, bid: 0 }))).toBe("GAME_OVER");
  });
});
