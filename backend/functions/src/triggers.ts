import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { botAction } from "./bots/index.js";
import { reduce } from "./engine/index.js";
import { botToMove, type GameDoc, stateFromSecret } from "./game/model.js";
import { refs, secureRandomInt, writeState } from "./game/store.js";
import { notificationsFor } from "./notify/messages.js";
import { sendPush } from "./notify/push.js";

/** Sends "your turn", "game started" and "game over" notifications when a game changes. */
export const onGameUpdated = onDocumentUpdated("games/{gameId}", async (event) => {
  const before = event.data?.before.data() as GameDoc | undefined;
  const after = event.data?.after.data() as GameDoc | undefined;
  if (!before || !after) return;
  await sendPush(notificationsFor(event.params.gameId, before, after));
});

/**
 * The pause between a move and a bot's answer, chosen at random for each move so the bots seem to
 * think and people can follow their cards.
 */
export const BOT_MOVE_DELAY_MS = { min: 500, max: 2000 };

/**
 * Makes one move for the bot whose turn it is. Each move changes the game again, so a row of bots
 * plays one card after another until it is a person's turn. Retried on errors; a delivery for a
 * version that has already moved on does nothing.
 */
export const moveBot = onDocumentUpdated(
  { document: "games/{gameId}", retry: true },
  async (event) => {
    const after = event.data?.after.data() as GameDoc | undefined;
    if (!after || botToMove(after) === null) return;

    const { min, max } = BOT_MOVE_DELAY_MS;
    const delay = min + Math.random() * (max - min);
    const sinceLastMove = Date.now() - after.updatedAt.toMillis();
    const wait = Math.min(delay, Math.max(0, delay - sinceLastMove));
    await new Promise((resolve) => setTimeout(resolve, wait));

    const gameId = event.params.gameId;
    await getFirestore().runTransaction(async (tx) => {
      const [game, secret] = await Promise.all([
        tx.get(refs.game(gameId)).then((snapshot) => snapshot.data()),
        tx.get(refs.secret(gameId)).then((snapshot) => snapshot.data()),
      ]);
      const level = game && botToMove(game);
      if (!game || !secret || !level || game.version !== after.version) return;

      const state = stateFromSecret(secret);
      const aggression = game.players[game.turnSeat as number]?.aggression ?? 0;
      const result = reduce(state, botAction(state, level, aggression), secureRandomInt);
      if (!result.ok) {
        // A bug in the strategy; retrying would not help.
        logger.error(`The ${level} bot made a move the rules reject: ${result.error}`, { gameId });
        return;
      }
      writeState(tx, gameId, game, state, result.state);
    });
  },
);
