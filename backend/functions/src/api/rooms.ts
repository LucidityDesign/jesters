import { FieldValue, getFirestore, type Transaction } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { AGGRESSION_RANGE, normalizeLevel } from "../bots/index.js";
import { createGame, MAX_PLAYERS, MIN_PLAYERS } from "../engine/index.js";
import { type GameDoc, lobbyPlay, type Player } from "../game/model.js";
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

/** Names for bots: wizards, witches, fairies and jesters from myths, legends and plays. */
export const BOT_NAMES = [
  "Merlin",
  "Morgana",
  "Prospero",
  "Circe",
  "Faust",
  "Medea",
  "Hecate",
  "Nimue",
  "Viviane",
  "Melusine",
  "Sycorax",
  "Ariel",
  "Oberon",
  "Titania",
  "Puck",
  "Calypso",
  "Agrippa",
  "Paracelsus",
  "Mephisto",
  "Krabat",
  "Rübezahl",
  "Baba Yaga",
  "Loki",
  "Anansi",
  "Yorick",
  "Feste",
  "Touchstone",
  "Triboulet",
  "Harlequin",
  "Pierrot",
  "Columbina",
  "Eulenspiegel",
] as const;

/** A random bot name that nobody in the room has yet ("Bot" if all are taken). */
export function pickBotName(taken: ReadonlySet<string>, randomInt = secureRandomInt): string {
  const free = BOT_NAMES.filter((name) => !taken.has(name));
  return free.length === 0 ? "Bot" : (free[randomInt(free.length)] as string);
}

/** A random temperament for a new bot, in steps of 0.01. */
export function randomAggression(randomInt = secureRandomInt): number {
  const { min, max } = AGGRESSION_RANGE;
  const steps = Math.round((max - min) * 100);
  return Math.round(min * 100 + randomInt(steps + 1)) / 100;
}

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

/** A room key nobody uses (read in `tx`, so all of its writes must follow). */
async function freeRoomKey(tx: Transaction): Promise<string> {
  for (let attempt = 0; attempt < ROOM_KEY_ATTEMPTS; attempt++) {
    const candidate = generateRoomKey(secureRandomInt);
    if (!(await tx.get(refs.roomKey(candidate))).exists) return candidate;
  }
  throw new Error("Could not find a free room key.");
}

/** Creates a room in the lobby with the caller as host. Returns its id and room key. */
export const createRoom = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(CreateRoomInput, request.data);
  await checkActiveGameLimit(uid);

  const gameRef = refs.games().doc();
  const roomKey = await getFirestore().runTransaction(async (tx) => {
    const key = await freeRoomKey(tx);
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
    const name = pickBotName(taken);
    // Bots have no sign-in account; the prefix keeps their ids apart from real user ids.
    const botUid = `bot-${refs.games().doc().id}`;
    tx.update(refs.game(input.gameId), {
      players: [
        ...game.players,
        { uid: botUid, name, bot: input.level, aggression: randomAggression() },
      ],
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

/**
 * After a game: the first player to ask opens a new lobby with the same rules and bots, and becomes
 * its host; the others who ask join that lobby. Returns the new game's id.
 */
export const playAgain = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const { gameId } = parse(GameInput, request.data);
  await checkActiveGameLimit(uid);

  const newRef = refs.games().doc();
  const newGameId = await getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, gameId, uid);
    if (game.status !== "finished" && game.status !== "abandoned") {
      fail("WRONG_PHASE", "This game is not over yet.");
    }
    const name = game.players.find((player) => player.uid === uid)?.name ?? "";
    const rematch = game.rematch;

    if (rematch) {
      const next = (await tx.get(refs.game(rematch.gameId))).data();
      if (!next) fail("GAME_NOT_FOUND", "The new game no longer exists.");
      if (next.playerUids.includes(uid)) return rematch.gameId;
      if (next.status !== "lobby") fail("ALREADY_STARTED", "The new game has already started.");
      if (next.players.length >= MAX_PLAYERS) fail("ROOM_FULL", "The new game is full.");
      tx.update(refs.game(rematch.gameId), {
        players: [...next.players, { uid, name }],
        playerUids: [...next.playerUids, uid],
        version: next.version + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (!rematch.uids.includes(uid)) {
        tx.update(refs.game(gameId), {
          "rematch.uids": FieldValue.arrayUnion(uid),
          version: game.version + 1,
        });
      }
      return rematch.gameId;
    }

    const key = await freeRoomKey(tx);
    // The same bots, with new ids so they don't mix up the two games.
    const bots: Player[] = game.players
      .filter((player) => player.bot)
      .map((bot) => ({
        uid: `bot-${refs.games().doc().id}`,
        name: bot.name,
        bot: normalizeLevel(bot.bot as string) ?? "easy",
        aggression: bot.aggression ?? randomAggression(),
      }));
    const players: Player[] = [{ uid, name }, ...bots];
    tx.set(refs.roomKey(key), { gameId: newRef.id });
    tx.set(newRef, {
      ...lobbyPlay(),
      roomKey: key,
      hostUid: uid,
      settings: game.settings,
      players,
      playerUids: players.map((player) => player.uid),
      active: true,
      version: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      turnSince: null,
    });
    tx.update(refs.game(gameId), {
      rematch: { gameId: newRef.id, hostUid: uid, uids: [uid] },
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return newRef.id;
  });
  return { gameId: newGameId };
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

/**
 * Writes the effect of `uid` leaving `game` (see `leaveGame`): in the lobby they're gone; in a
 * running game a bot takes over their seat, or the game ends when no other person is left.
 */
export function leave(tx: Transaction, gameId: string, game: GameDoc, uid: string): void {
  const gameRef = refs.game(gameId);

  if (game.status === "finished" || game.status === "abandoned") return;
  if (game.players.find((p) => p.uid === uid)?.left) return;

  // A bot plays on for someone who leaves a running game, as long as people are left to play.
  const peopleLeft = game.players.filter((p) => !p.bot && !p.left && p.uid !== uid);
  if (game.status !== "lobby" && peopleLeft.length > 0) {
    tx.update(gameRef, {
      players: game.players.map((p) => (p.uid === uid ? { ...p, left: true } : p)),
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.delete(refs.hand(gameId, uid));
    return;
  }

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
