import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { type Action, reduce } from "../engine/index.js";
import { type AutoPlay, stateFromSecret } from "../game/model.js";
import { refs, secureRandomInt, writeState } from "../game/store.js";
import { CALLABLE } from "../setup.js";
import { fail, parse, requireAuth } from "./errors.js";
import { getMemberGame } from "./rooms.js";
import { ChooseTrumpInput, PlaceBidInput, PlayCardInput, SetAutoPlayInput } from "./schemas.js";

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
