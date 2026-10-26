import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { createGame, MAX_PLAYERS, MIN_PLAYERS } from "../engine/index.js";
import { type GameDoc, lobbyPlay } from "../game/model.js";
import { generateRoomKey, normalizeRoomKey } from "../game/roomKey.js";
import { refs, secureRandomInt, writeState } from "../game/store.js";
import { CALLABLE } from "../setup.js";
import { fail, parse, requireAuth } from "./errors.js";
import {
  AddBotInput,
  CreateRoomInput,
  GameInput,
  JoinRoomInput,
  RemovePlayerInput,
  UpdateSettingsInput,
} from "./schemas.js";

export const MAX_ACTIVE_GAMES = 20;
const ROOM_KEY_ATTEMPTS = 5;

/** Names for bots, in the order they join a room. */
export const BOT_NAMES = ["Merlin", "Morgana", "Prospero", "Circe", "Faust"] as const;

async function checkActiveGameLimit(uid: string): Promise<void> {
  const active = await refs
    .games()
    .where("playerUids", "array-contains", uid)
    .where("active", "==", true)
    .count()
    .get();
  if (active.data().count >= MAX_ACTIVE_GAMES) {
    fail("TOO_MANY_GAMES", `You can be in at most ${MAX_ACTIVE_GAMES} active games.`);
  }
}

/** Creates a room in the lobby with the caller as host. Returns its id and room key. */
export const createRoom = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(CreateRoomInput, request.data);
  await checkActiveGameLimit(uid);

  const gameRef = refs.games().doc();
  const roomKey = await getFirestore().runTransaction(async (tx) => {
    let key: string | null = null;
    for (let attempt = 0; attempt < ROOM_KEY_ATTEMPTS && key === null; attempt++) {
      const candidate = generateRoomKey(secureRandomInt);
      if (!(await tx.get(refs.roomKey(candidate))).exists) key = candidate;
    }
    if (key === null) throw new Error("Could not find a free room key.");

    tx.set(refs.roomKey(key), { gameId: gameRef.id });
    tx.set(gameRef, {
      ...lobbyPlay(),
      roomKey: key,
      hostUid: uid,
      settings: input.settings,
      players: [{ uid, name: input.name }],
      playerUids: [uid],
      active: true,
      version: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      turnSince: null,
    });
    return key;
  });
  return { gameId: gameRef.id, roomKey };
});

/** Joins a room in the lobby by its key. Joining a room one is already in just returns it. */
export const joinRoom = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(JoinRoomInput, request.data);
  const key = normalizeRoomKey(input.roomKey) ?? fail("ROOM_NOT_FOUND", "No room with this key.");
  await checkActiveGameLimit(uid);

  const gameId = await getFirestore().runTransaction(async (tx) => {
    const roomKey = (await tx.get(refs.roomKey(key))).data();
    if (!roomKey) fail("ROOM_NOT_FOUND", "No room with this key.");
    const game = (await tx.get(refs.game(roomKey.gameId))).data();
    if (!game) fail("ROOM_NOT_FOUND", "No room with this key.");

    if (game.playerUids.includes(uid)) return roomKey.gameId;
    if (game.status !== "lobby") fail("ALREADY_STARTED", "This game has already started.");
    if (game.players.length >= MAX_PLAYERS) fail("ROOM_FULL", "This room is full.");

    tx.update(refs.game(roomKey.gameId), {
      players: [...game.players, { uid, name: input.name }],
      playerUids: [...game.playerUids, uid],
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return roomKey.gameId;
  });
  return { gameId };
});

/** The host starts the game: seats follow the join order, the first dealer is random. */
export const startGame = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const { gameId } = parse(GameInput, request.data);

  await getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, gameId, uid);
    if (game.hostUid !== uid) fail("NOT_HOST", "Only the host can start the game.");
    if (game.status !== "lobby") fail("ALREADY_STARTED", "This game has already started.");
    if (game.players.length < MIN_PLAYERS) {
      fail("NOT_ENOUGH_PLAYERS", `At least ${MIN_PLAYERS} players are needed.`);
    }
    const state = createGame({
      playerCount: game.players.length,
      settings: game.settings,
      randomInt: secureRandomInt,
    });
    writeState(tx, gameId, game, null, state);
  });
  return { ok: true };
});

/** The host adds a computer player to the lobby. */
export const addBot = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(AddBotInput, request.data);

  await getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, input.gameId, uid);
    if (game.hostUid !== uid) fail("NOT_HOST", "Only the host can add bots.");
    if (game.status !== "lobby") fail("ALREADY_STARTED", "This game has already started.");
    if (game.players.length >= MAX_PLAYERS) fail("ROOM_FULL", "This room is full.");

    const taken = new Set(game.players.map((player) => player.name));
    const name = BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? "Bot";
    // Bots have no sign-in account; the prefix keeps their ids apart from real user ids.
    const botUid = `bot-${refs.games().doc().id}`;
    tx.update(refs.game(input.gameId), {
      players: [...game.players, { uid: botUid, name, bot: input.level }],
      playerUids: [...game.playerUids, botUid],
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});

/** The host changes the rules while in the lobby. */
export const updateSettings = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(UpdateSettingsInput, request.data);

  await getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, input.gameId, uid);
    if (game.hostUid !== uid) fail("NOT_HOST", "Only the host can change the rules.");
    if (game.status !== "lobby") fail("ALREADY_STARTED", "This game has already started.");
    tx.update(refs.game(input.gameId), {
      settings: { ...game.settings, noEvenBids: input.noEvenBids },
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});

/** The host removes another player or a bot from the lobby. */
export const removePlayer = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(RemovePlayerInput, request.data);

  await getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, input.gameId, uid);
    if (game.hostUid !== uid) fail("NOT_HOST", "Only the host can remove players.");
    if (game.status !== "lobby") fail("ALREADY_STARTED", "This game has already started.");
    if (input.uid === uid || !game.playerUids.includes(input.uid)) {
      fail("INVALID_REQUEST", "This player cannot be removed.");
    }
    tx.update(refs.game(input.gameId), {
      players: game.players.filter((player) => player.uid !== input.uid),
      playerUids: game.playerUids.filter((playerUid) => playerUid !== input.uid),
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});

/**
 * Leaves a game. In the lobby the player is removed (the next person becomes host; a room with no
 * people left is deleted). Leaving a running game ends it for everyone as "abandoned".
 */
export const leaveGame = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const { gameId } = parse(GameInput, request.data);

  await getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, gameId, uid);
    leave(tx, gameId, game, uid);
  });
  return { ok: true };
});

export async function getMemberGame(
  tx: Transaction,
  gameId: string,
  uid: string,
): Promise<GameDoc> {
  const game = (await tx.get(refs.game(gameId))).data();
  if (!game) fail("GAME_NOT_FOUND", "This game does not exist.");
  if (!game.playerUids.includes(uid)) fail("NOT_IN_GAME", "You are not in this game.");
  return game;
}

/** Writes the effect of `uid` leaving `game` (see `leaveGame`). */
export function leave(tx: Transaction, gameId: string, game: GameDoc, uid: string): void {
  const gameRef = refs.game(gameId);

  if (game.status === "finished" || game.status === "abandoned") return;

  if (game.status !== "lobby") {
    tx.update(gameRef, {
      status: "abandoned",
      active: false,
      abandonedBy: uid,
      turnSeat: null,
      turnUid: null,
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(refs.roomKey(game.roomKey));
    return;
  }

  const players = game.players.filter((player) => player.uid !== uid);
  const nextHost = players.find((player) => !player.bot);
  if (nextHost === undefined) {
    tx.delete(gameRef);
    tx.delete(refs.roomKey(game.roomKey));
    return;
  }
  tx.update(gameRef, {
    players,
    playerUids: players.map((player) => player.uid),
    hostUid: game.hostUid === uid ? nextHost.uid : game.hostUid,
    version: game.version + 1,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
