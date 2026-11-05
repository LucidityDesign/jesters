import { describe, expect, it } from "vitest";
import { newPlayers, rejection, setUpRoom, type TestPlayer } from "./client.js";

interface Game {
  status: string;
  version: number;
  turnSeat: number | null;
  round: { number: number; dealerSeat: number; bids: (number | null)[] } | null;
  lastTrick: { cards: string[] } | null;
  playerUids: string[];
}

interface Hand {
  cards: string[];
  queuedCard: { round: number; card: string; rejected?: boolean } | null;
}

describe("queued cards", () => {
  it("are played on the player's turn", async () => {
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
    const [secondCard] = (await hand(second)).cards;
    expect(await rejection(second.call("queueCard", { gameId, card: secondCard }))).toBe(
      "WRONG_PHASE",
    );

    // Round 1 has one trick: bids 0, 0, 0 never add up to it.
    for (const player of [first, second, dealer]) {
      game = await read();
      await player.call("placeBid", { gameId, version: game.version, bid: 0 });
    }
    game = await read();
    expect(game.status).toBe("playing");

    const [dealerCard] = (await hand(dealer)).cards;
    const [firstCard] = (await hand(first)).cards;
    expect(await rejection(second.call("queueCard", { gameId, card: firstCard }))).toBe(
      "CARD_NOT_IN_HAND",
    );
    await second.call("queueCard", { gameId, card: secondCard });
    await dealer.call("queueCard", { gameId, card: dealerCard });
    expect((await hand(second)).queuedCard).toEqual({ round: 1, card: secondCard });
    // Nobody else learns of it: the game itself does not change.
    expect((await read()).version).toBe(game.version);
    // Cleared and queued again.
    await dealer.call("queueCard", { gameId, card: null });
    expect((await hand(dealer)).queuedCard).toBeNull();
    await dealer.call("queueCard", { gameId, card: dealerCard });

    // The first player plays: the other two follow at once, and round 2 is dealt.
    await first.call("playCard", { gameId, version: game.version, card: firstCard });
    game = await read();
    expect(game.lastTrick?.cards).toEqual([firstCard, secondCard, dealerCard]);
    expect(game.round?.number).toBe(2);
    expect((await hand(second)).queuedCard).toBeNull();
    expect((await hand(dealer)).queuedCard).toBeNull();
  });
});
