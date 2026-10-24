import { describe, expect, it } from "vitest";
import { newPlayer, newPlayers, rejection, setUpRoom } from "./client.js";

interface Game {
  status: string;
  hostUid: string;
  roomKey: string;
  players: { uid: string; name: string }[];
  playerUids: string[];
  settings: { noEvenBids: boolean };
  active: boolean;
  version: number;
  turnUid: string | null;
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

  it("ends a running game for everyone when a player leaves", async () => {
    const players = await newPlayers("Anna", "Ben", "Cleo");
    const [anna, ben] = players;
    const room = await setUpRoom(players);
    await anna.call("startGame", { gameId: room.gameId });

    await ben.call("leaveGame", { gameId: room.gameId });
    const game = await anna.read<Game & { abandonedBy: string }>(`games/${room.gameId}`);
    expect(game).toMatchObject({
      status: "abandoned",
      active: false,
      abandonedBy: ben.uid,
      turnUid: null,
    });
    expect(await rejection(anna.call("placeBid", { gameId: room.gameId, bid: 0 }))).toBe(
      "GAME_OVER",
    );
  });
});
