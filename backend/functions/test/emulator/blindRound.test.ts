import { describe, expect, it } from "vitest";
import { newPlayers, setUpRoom, type TestPlayer } from "./client.js";

interface Game {
  status: string;
  version: number;
  round: { number: number; dealerSeat: number } | null;
  lastTrick: { cards: string[] } | null;
  playerUids: string[];
}

interface Hand {
  cards: string[];
  hiddenCards?: number;
  othersCards?: (string | null)[];
  queuedCard: { round: number; card: string } | null;
}

describe("the blind first round", () => {
  it("shows each player the others' cards, and lets them play their own unseen", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna] = players;
    const { gameId } = await setUpRoom(players);
    await anna.call("updateSettings", { gameId, blindFirstRound: true });
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

    const firstHand = await hand(first);
    expect(firstHand.cards).toEqual([]);
    expect(firstHand.hiddenCards).toBe(1);
    const secondCard = (await hand(dealer)).othersCards?.[(dealerSeat + 2) % 3];
    const firstCard = (await hand(second)).othersCards?.[(dealerSeat + 1) % 3];
    expect(firstHand.othersCards?.[(dealerSeat + 1) % 3]).toBeNull();
    expect(secondCard).toBeTruthy();
    expect(firstCard).toBeTruthy();

    if (game.status === "choosingTrump") {
      await dealer.call("chooseTrump", { gameId, version: game.version, suit: "H" });
    }
    for (const player of [first, second, dealer]) {
      game = await read();
      await player.call("placeBid", { gameId, version: game.version, bid: 0 });
    }
    game = await read();
    expect(game.status).toBe("playing");
    await second.call("queueCard", { gameId, card: "hidden" });
    // The queued card stays hidden from its own player.
    expect((await hand(second)).queuedCard).toEqual({ round: 1, card: "hidden" });
    await dealer.call("queueCard", { gameId, card: "hidden" });
    await first.call("playCard", { gameId, version: game.version, card: "hidden" });

    game = await read();
    expect(game.lastTrick?.cards.slice(0, 2)).toEqual([firstCard, secondCard]);
    // Round 2 is played open.
    expect(game.round?.number).toBe(2);
    expect((await hand(first)).cards).toHaveLength(2);
    expect((await hand(first)).othersCards).toBeUndefined();
  });
});
