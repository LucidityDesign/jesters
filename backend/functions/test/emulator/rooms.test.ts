import { describe, expect, it } from "vitest";
import { newPlayer, newPlayers, rejection, setUpRoom } from "./client.js";

interface Game {
  status: string;
  hostUid: string;
  roomKey: string;
  players: { uid: string; name: string; left?: boolean }[];
  playerUids: string[];
  settings: { noEvenBids: boolean; stallPenalty?: boolean };
  active: boolean;
  version: number;
  turnUid: string | null;
  rematch?: { gameId: string; hostUid: string; uids: string[] };
}

describe("rooms", () => {
  it("creates a room with a key and lets others join by key", async () => {
    const [anna, ben] = await newPlayers("Anna", "Ben");
    const room = await anna.call<{ gameId: string; roomKey: string }>("createRoom", {
      name: " Anna ",
    });
    expect(room.roomKey).toMatch(/^[A-Z2-9]{6}$/);

    const joined = await ben.call<{ gameId: string }>("joinRoom", {
      roomKey: room.roomKey.toLowerCase(),
      name: "Ben",
    });
    expect(joined.gameId).toBe(room.gameId);
    // Joining again is harmless.
    await ben.call("joinRoom", { roomKey: room.roomKey, name: "Ben" });

    const game = await ben.read<Game>(`games/${room.gameId}`);
    expect(game).toMatchObject({
      status: "lobby",
      hostUid: anna.uid,
      players: [
        { uid: anna.uid, name: "Anna" },
        { uid: ben.uid, name: "Ben" },
      ],
      settings: { noEvenBids: true },
      active: true,
      version: 2,
    });
  });

  it("rejects unknown keys, invalid names and signed-out callers", async () => {
    const anna = await newPlayer("Anna");
    expect(await rejection(anna.call("joinRoom", { roomKey: "ZZZZZZ", name: "Anna" }))).toBe(
      "ROOM_NOT_FOUND",
    );
    expect(await rejection(anna.call("joinRoom", { roomKey: "nope", name: "Anna" }))).toBe(
      "ROOM_NOT_FOUND",
    );
    expect(await rejection(anna.call("createRoom", { name: "" }))).toBe("INVALID_REQUEST");
  });

  it("allows only the host to start, with at least 3 players", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = players;
    const room = await setUpRoom([anna, ben]);

    expect(await rejection(anna.call("startGame", { gameId: room.gameId }))).toBe(
      "NOT_ENOUGH_PLAYERS",
    );
    await cleo.call("joinRoom", { roomKey: room.roomKey, name: "Cleo" });
    expect(await rejection(ben.call("startGame", { gameId: room.gameId }))).toBe("NOT_HOST");

    await anna.call("startGame", { gameId: room.gameId });
    const game = await anna.read<Game>(`games/${room.gameId}`);
    expect(["bidding", "choosingTrump"]).toContain(game?.status);
    expect(game?.playerUids).toContain(game?.turnUid);

    const hand = await cleo.read<{ cards: string[] }>(`games/${room.gameId}/hands/${cleo.uid}`);
    expect(hand?.cards).toHaveLength(1);

    const latecomer = await newPlayer("Dora");
    expect(
      await rejection(latecomer.call("joinRoom", { roomKey: room.roomKey, name: "Dora" })),
    ).toBe("ALREADY_STARTED");
    expect(await rejection(anna.call("startGame", { gameId: room.gameId }))).toBe(
      "ALREADY_STARTED",
    );
  });

  it("limits rooms to 6 players", async () => {
    const players = await newPlayers("P1", "P2", "P3", "P4", "P5", "P6", "P7");
    const room = await setUpRoom(players.slice(0, 6));
    expect(
      await rejection(players[6].call("joinRoom", { roomKey: room.roomKey, name: "P7" })),
    ).toBe("ROOM_FULL");
  });

  it("lets only the host change the rules in the lobby", async () => {
    const [anna, ben, cleo] = await newPlayers("Anna", "Ben", "Cleo");
    const room = await setUpRoom([anna, ben, cleo]);

    expect(
      await rejection(ben.call("updateSettings", { gameId: room.gameId, noEvenBids: false })),
    ).toBe("NOT_HOST");
    await anna.call("updateSettings", { gameId: room.gameId, noEvenBids: false });
    expect((await ben.read<Game>(`games/${room.gameId}`))?.settings).toEqual({ noEvenBids: false });
    // Each rule changes on its own.
    await anna.call("updateSettings", { gameId: room.gameId, stallPenalty: true });
    expect((await ben.read<Game>(`games/${room.gameId}`))?.settings).toEqual({
      noEvenBids: false,
      stallPenalty: true,
    });

    await anna.call("startGame", { gameId: room.gameId });
    expect(
      await rejection(anna.call("updateSettings", { gameId: room.gameId, noEvenBids: true })),
    ).toBe("ALREADY_STARTED");
  });

  it("lets the host remove players from the lobby", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = players;
    const room = await setUpRoom(players);

    expect(await rejection(ben.call("removePlayer", { gameId: room.gameId, uid: cleo.uid }))).toBe(
      "NOT_HOST",
    );
    expect(await rejection(anna.call("removePlayer", { gameId: room.gameId, uid: anna.uid }))).toBe(
      "INVALID_REQUEST",
    );
    await anna.call("removePlayer", { gameId: room.gameId, uid: cleo.uid });

    const game = await anna.read<Game>(`games/${room.gameId}`);
    expect(game?.playerUids).toEqual([anna.uid, ben.uid]);
    expect(await rejection(cleo.read(`games/${room.gameId}`))).toBe("permission-denied");
  });

  it("passes the host role on when the host leaves the lobby, and deletes empty rooms", async () => {
    const [anna, ben] = await newPlayers("Anna", "Ben");
    const room = await setUpRoom([anna, ben]);

    await anna.call("leaveGame", { gameId: room.gameId });
    const game = await ben.read<Game>(`games/${room.gameId}`);
    expect(game?.hostUid).toBe(ben.uid);
    expect(game?.playerUids).toEqual([ben.uid]);

    await ben.call("leaveGame", { gameId: room.gameId });
    expect(await rejection(ben.call("leaveGame", { gameId: room.gameId }))).toBe("GAME_NOT_FOUND");
    expect(await rejection(anna.call("joinRoom", { roomKey: room.roomKey, name: "Anna" }))).toBe(
      "ROOM_NOT_FOUND",
    );
  });

  it("lets a bot play for someone who leaves, and ends the game when no person is left", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = players;
    const room = await setUpRoom(players);
    const gameId = room.gameId;
    await anna.call("startGame", { gameId });

    // A waiting move can only be handed to a bot after 30 minutes, and not by its own player.
    let game = (await anna.read<Game>(`games/${gameId}`)) as Game;
    const mover = players.find((p) => p.uid === game.turnUid) as (typeof players)[number];
    const other = players.find((p) => p.uid !== game.turnUid) as (typeof players)[number];
    const version = game.version;
    expect(await rejection(other.call("letBotMove", { gameId, version }))).toBe("TOO_EARLY");
    expect(await rejection(mover.call("letBotMove", { gameId, version }))).toBe("WRONG_PHASE");

    await ben.call("leaveGame", { gameId });
    game = (await anna.read<Game>(`games/${gameId}`)) as Game;
    expect(game.active).toBe(true);
    expect(game.players.find((p) => p.uid === ben.uid)?.left).toBe(true);
    expect(await rejection(ben.call("placeBid", { gameId, bid: 0 }))).toBe("LEFT_GAME");

    await cleo.call("leaveGame", { gameId });
    await anna.call("leaveGame", { gameId });
    expect(await anna.read<Game>(`games/${gameId}`)).toMatchObject({
      status: "abandoned",
      active: false,
      abandonedBy: anna.uid,
      turnUid: null,
    });
    expect(await rejection(anna.call("placeBid", { gameId, bid: 0 }))).toBe("GAME_OVER");
  });

  it("lets the players of an ended game meet in a new lobby", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna, ben, cleo] = players;
    const dora = await newPlayer("Dora");
    const room = await setUpRoom(players);
    const gameId = room.gameId;
    await anna.call("updateSettings", { gameId, noEvenBids: false });
    await anna.call("addBot", { gameId, level: "hard" });
    await anna.call("startGame", { gameId });
    expect(await rejection(ben.call("playAgain", { gameId }))).toBe("WRONG_PHASE");
    // The game ends once no person is left to play.
    for (const player of [cleo, anna, ben]) await player.call("leaveGame", { gameId });

    // The first to ask hosts the new lobby, with the same rules and bots.
    const { gameId: nextId } = await ben.call<{ gameId: string }>("playAgain", { gameId });
    expect(nextId).not.toBe(gameId);
    const old = (await anna.read<Game>(`games/${gameId}`)) as Game;
    expect(old.rematch).toEqual({ gameId: nextId, hostUid: ben.uid, uids: [ben.uid] });
    let next = (await ben.read<Game & { players: { bot?: string }[] }>(
      `games/${nextId}`,
    )) as Game & {
      players: { uid: string; name: string; bot?: string }[];
    };
    const oldBot = old.players[3] as { uid: string; name: string };
    expect(next).toMatchObject({
      status: "lobby",
      hostUid: ben.uid,
      settings: { noEvenBids: false },
    });
    expect(next.players[0]).toEqual({ uid: ben.uid, name: "Ben" });
    expect(next.players[1]).toMatchObject({ name: oldBot.name, bot: "hard" });
    expect(next.players[1]?.uid).not.toBe(oldBot.uid);

    // The others join it; asking again changes nothing.
    expect((await anna.call<{ gameId: string }>("playAgain", { gameId })).gameId).toBe(nextId);
    expect((await ben.call<{ gameId: string }>("playAgain", { gameId })).gameId).toBe(nextId);
    next = (await anna.read(`games/${nextId}`)) as typeof next;
    expect(next.playerUids).toEqual([ben.uid, next.players[1]?.uid, anna.uid]);
    expect(((await anna.read<Game>(`games/${gameId}`)) as Game).rematch?.uids).toEqual([
      ben.uid,
      anna.uid,
    ]);

    expect(await rejection(dora.call("playAgain", { gameId }))).toBe("NOT_IN_GAME");
    await ben.call("startGame", { gameId: nextId });
    expect(await rejection(cleo.call("playAgain", { gameId }))).toBe("ALREADY_STARTED");
  });
});
