import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { type Action, reduce } from "../engine/index.js";
import { playBots } from "../bots/index.js";
import { botLevels, stateFromSecret } from "../game/model.js";
import { refs, secureRandomInt, writeState } from "../game/store.js";
import { CALLABLE } from "../setup.js";
import { fail, parse, requireAuth } from "./errors.js";
import { getMemberGame } from "./rooms.js";
import { ChooseTrumpInput, PlaceBidInput, PlayCardInput } from "./schemas.js";

/**
 * Applies a player's action to a running game in one transaction, followed by the moves of any
 * bots whose turn comes next. Returns the new version.
 */
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

    const next = playBots(result.state, botLevels(game.players), secureRandomInt);
    writeState(tx, input.gameId, game, state, next);
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
