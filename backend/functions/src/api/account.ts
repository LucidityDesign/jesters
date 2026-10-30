import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { refs } from "../game/store.js";
import { CALLABLE } from "../setup.js";
import { requireAuth } from "./errors.js";
import { leave } from "./rooms.js";
import { deleteTransferCodes } from "./transfer.js";

/**
 * Deletes the caller's data (GDPR): leaves every active game (ending running ones for everyone),
 * removes their name from finished games, and deletes their hands, reactions, transfer codes,
 * profile and guest account.
 * Other players keep the score sheets of past games, without the name.
 */
export const deleteMyData = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();

  const games = await refs.games().where("playerUids", "array-contains", uid).get();
  for (const { id: gameId } of games.docs) {
    // Leaving first sends the usual "player left" notification, which needs the name.
    await db.runTransaction(async (tx) => {
      const game = (await tx.get(refs.game(gameId))).data();
      if (game?.playerUids.includes(uid)) leave(tx, gameId, game, uid);
    });
    await db.runTransaction(async (tx) => {
      const game = (await tx.get(refs.game(gameId))).data();
      if (game?.playerUids.includes(uid)) {
        tx.update(refs.game(gameId), {
          players: game.players.map((player) => (player.uid === uid ? { uid, name: "" } : player)),
          version: game.version + 1,
        });
      }
      tx.delete(refs.hand(gameId, uid));
      tx.delete(refs.reaction(gameId, uid));
    });
  }

  await deleteTransferCodes(uid);
  await db.doc(`users/${uid}`).delete();
  await getAuth().deleteUser(uid);
  return { ok: true };
});
