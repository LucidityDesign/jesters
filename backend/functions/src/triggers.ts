import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { botAction } from "./bots/index.js";
import { reduce } from "./engine/index.js";
import { botToMove, type GameDoc, stateFromSecret } from "./game/model.js";
import { refs, secureRandomInt, writeState } from "./game/store.js";
import { notificationsFor, type ReactionDoc, reactionNotifications } from "./notify/messages.js";
import { sendPush } from "./notify/push.js";

/** Sends "your turn", "game started" and "game over" notifications when a game changes. */
export const onGameUpdated = onDocumentUpdated("games/{gameId}", async (event) => {
  const before = event.data?.before.data() as GameDoc | undefined;
  const after = event.data?.after.data() as GameDoc | undefined;
  if (!before || !after) return;
  await sendPush(notificationsFor(event.params.gameId, before, after));
});

/** Tells the other players about an emoji reaction. */
export const onReaction = onDocumentWritten("games/{gameId}/reactions/{uid}", async (event) => {
  const after = event.data?.after.data() as ReactionDoc | undefined;
  // Deleted along with the player's data.
  if (!after) return;
  const before = event.data?.before.data() as ReactionDoc | undefined;
  const { gameId, uid } = event.params;
  const game = (await refs.game(gameId).get()).data();
  if (!game) return;
  await sendPush(reactionNotifications(gameId, game, uid, before, after));
});

/**
 * The pause between a move and a bot's answer, chosen at random for each move so the bots seem to
 * think and people can follow their cards.
 */
export const BOT_MOVE_DELAY_MS = { min: 500, max: 2000 };

/**
 * After a round is scored, the bots wait longer before bidding in the next one, so people can see
 * the last trick and their result first.
 */
export const BOT_NEW_ROUND_DELAY_MS = 5000;

/** How long a bot waits after the move from `before` to `after`, before its own move. */
export function botDelayMs(
  before: GameDoc | undefined,
  after: GameDoc,
  random: () => number = Math.random,
): number {
  const { min, max } = BOT_MOVE_DELAY_MS;
  const delay = min + random() * (max - min);
  const roundScored = before !== undefined && after.results.length > before.results.length;
  return roundScored ? Math.max(delay, BOT_NEW_ROUND_DELAY_MS) : delay;
}

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

    const delay = botDelayMs(event.data?.before.data() as GameDoc | undefined, after);
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
      writeState(tx, gameId, game, state, result.state, { byBot: true });
    });
  },
);
