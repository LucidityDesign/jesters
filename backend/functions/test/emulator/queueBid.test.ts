import { describe, expect, it } from "vitest";
import { newPlayers, rejection, setUpRoom, type TestPlayer } from "./client.js";

interface Game {
  status: string;
  version: number;
  turnSeat: number | null;
  round: { number: number; dealerSeat: number; bids: (number | null)[] } | null;
  playerUids: string[];
}

interface Hand {
  forbiddenBid: number | null;
  queuedBid: { round: number; bid: number; rejected?: boolean } | null;
}

describe("queued bids", () => {
  it("are placed on the player's turn, or handed back when the rules rule them out", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna] = players;
    const { gameId } = await setUpRoom(players);
    await anna.call("startGame", { gameId });

    const read = async () => (await anna.read<Game>(`games/${gameId}`)) as Game;
    const hand = async (player: TestPlayer) =>
      (await player.read<Hand>(`games/${gameId}/hands/${player.uid}`)) as Hand;
    let game = await read();
    const at = (seat: number) => players.find((p) => p.uid === game.playerUids[seat]) as TestPlayer;
    const dealerSeat = game.round?.dealerSeat as number;
    const first = at((dealerSeat + 1) % 3);
    const second = at((dealerSeat + 2) % 3);
    const dealer = at(dealerSeat);
    if (game.status === "choosingTrump") {
      await dealer.call("chooseTrump", { gameId, version: game.version, suit: "H" });
      game = await read();
    }
    expect(game.status).toBe("bidding");

    // Round 1 has one trick. The second bidder queues 0, the dealer 1.
    await second.call("queueBid", { gameId, bid: 0 });
    await dealer.call("queueBid", { gameId, bid: 1 });
    expect((await hand(second)).queuedBid).toEqual({ round: 1, bid: 0 });
    // Nobody else learns of it: the game itself does not change.
    expect((await read()).version).toBe(game.version);
    expect(await rejection(first.call("queueBid", { gameId, bid: 9 }))).toBe("INVALID_BID");

    // The first bidder bids 0: the second's 0 follows at once. The dealer's 1 would make the bids
    // add up to the one trick, so the dealer has to bid again.
    await first.call("placeBid", { gameId, version: game.version, bid: 0 });
    game = await read();
    expect(game.round?.bids[(dealerSeat + 2) % 3]).toBe(0);
    expect(game.turnSeat).toBe(dealerSeat);
    expect((await hand(second)).queuedBid).toBeNull();
    expect(await hand(dealer)).toMatchObject({
      forbiddenBid: 1,
      queuedBid: { round: 1, bid: 1, rejected: true },
    });
    expect(await rejection(first.call("queueBid", { gameId, bid: 1 }))).toBe("WRONG_PHASE");

    // On their turn, queueing places the bid right away.
    expect(await rejection(dealer.call("queueBid", { gameId, bid: 1 }))).toBe(
      "BID_SUM_NOT_ALLOWED",
    );
    await dealer.call("queueBid", { gameId, bid: 0 });
    game = await read();
    expect(game.status).toBe("playing");
    expect((await hand(dealer)).queuedBid).toBeNull();
  });
});
