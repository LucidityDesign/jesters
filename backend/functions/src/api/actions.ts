import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { type Action, reduce } from "../engine/index.js";
import {
  type AutoPlay,
  botToMove,
  type GameDoc,
  STALL_MS,
  STALL_PENALTY,
  stateFromSecret,
} from "../game/model.js";
import { refs, secureRandomInt, writeState } from "../game/store.js";
import { CALLABLE } from "../setup.js";
import { fail, parse, requireAuth } from "./errors.js";
import { getMemberGame } from "./rooms.js";
import {
  ChooseTrumpInput,
  LetBotMoveInput,
  PlaceBidInput,
  PlayCardInput,
  SetAutoPlayInput,
} from "./schemas.js";

/** Someone who left a running game has handed their seat to a bot for good. */
function failIfLeft(game: GameDoc, uid: string): void {
  if (game.players.find((player) => player.uid === uid)?.left) {
    fail("LEFT_GAME", "You left this game.");
  }
}

/** Applies a player's action to a running game in one transaction. Returns the new version. */
async function perform(
  uid: string,
  input: { gameId: string; version?: number | undefined },
  action: (seat: number) => Action,
): Promise<{ version: number }> {
  return getFirestore().runTransaction(async (tx) => {
    const [game, secret] = await Promise.all([
      getMemberGame(tx, input.gameId, uid),
      tx.get(refs.secret(input.gameId)).then((snapshot) => snapshot.data()),
    ]);
    if (game.status === "lobby") fail("WRONG_PHASE", "The game has not started yet.");
    if (game.status === "finished" || game.status === "abandoned" || !secret) {
      fail("GAME_OVER", "This game is over.");
    }
    if (input.version !== undefined && input.version !== game.version) {
      fail("STALE_VERSION", "The game has changed in the meantime.");
    }
    failIfLeft(game, uid);

    const state = stateFromSecret(secret);
    const result = reduce(state, action(game.playerUids.indexOf(uid)), secureRandomInt);
    if (!result.ok) fail(result.error);

    writeState(tx, input.gameId, game, state, result.state);
    return { version: game.version + 1 };
  });
}

export const chooseTrump = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(ChooseTrumpInput, request.data);
  return perform(uid, input, (seat) => ({ type: "chooseTrump", seat, suit: input.suit }));
});

export const placeBid = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(PlaceBidInput, request.data);
  return perform(uid, input, (seat) => ({ type: "bid", seat, bid: input.bid }));
});

export const playCard = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(PlayCardInput, request.data);
  return perform(uid, input, (seat) => ({ type: "play", seat, card: input.card }));
});

/**
 * Lets a bot play for the caller (until they take over, for some minutes or rounds), or stops it.
 * The change itself starts the bot when it is the caller's turn (see `moveBot`); a move of their
 * own also stops it (see `writeState`).
 */
export const setAutoPlay = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(SetAutoPlayInput, request.data);
  return getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, input.gameId, uid);
    if (game.status === "lobby") fail("WRONG_PHASE", "The game has not started yet.");
    if (!game.active) fail("GAME_OVER", "This game is over.");
    failIfLeft(game, uid);

    const autoPlay: AutoPlay = {};
    if (input.minutes !== undefined) {
      autoPlay.until = Timestamp.fromMillis(Date.now() + input.minutes * 60_000);
    }
    if (input.rounds !== undefined) {
      autoPlay.untilRound = (game.round?.number ?? 1) + input.rounds - 1;
    }
    tx.update(refs.game(input.gameId), {
      [`autoPlay.${uid}`]: input.on ? autoPlay : FieldValue.delete(),
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { version: game.version + 1 };
  });
});

/**
 * Another player hands the move of a person who has kept everyone waiting for `STALL_MS` to a bot:
 * just this one move, which `moveBot` then makes (marked as auto-played for them).
 */
export const letBotMove = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const input = parse(LetBotMoveInput, request.data);
  return getFirestore().runTransaction(async (tx) => {
    const game = await getMemberGame(tx, input.gameId, uid);
    if (!game.active || game.status === "lobby") fail("WRONG_PHASE", "No move is waiting.");
    if (input.version !== game.version) {
      fail("STALE_VERSION", "The game has changed in the meantime.");
    }
    failIfLeft(game, uid);
    if (game.turnUid === uid) fail("WRONG_PHASE", "It's your own turn.");
    if (botToMove(game) !== null) fail("WRONG_PHASE", "A bot is already moving.");
    if (Date.now() - game.updatedAt.toMillis() < STALL_MS) {
      fail("TOO_EARLY", "Give them a little more time.");
    }
    const round = game.round?.number ?? 1;
    tx.update(refs.game(input.gameId), {
      ...(game.settings.stallPenalty && game.turnUid
        ? {
            [`stallPenalties.${game.turnUid}.${round}`]: FieldValue.increment(STALL_PENALTY),
          }
        : {}),
      botMoveVersion: game.version + 1,
      version: game.version + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { version: game.version + 1 };
  });
});
