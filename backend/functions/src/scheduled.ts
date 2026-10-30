import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { transferCodes } from "./api/transfer.js";
import { refs } from "./game/store.js";
import { reminderFor } from "./notify/messages.js";
import { sendPush, type UserDoc } from "./notify/push.js";
import { EXPIRE_AFTER_MS, REMINDER_AFTER_MS, reminderDue } from "./notify/reminders.js";
import { SCHEDULE_TIME_ZONE } from "./setup.js";

/** Hourly: reminds players whose turn has been waiting for a day, during their local daytime. */
export const sendTurnReminders = onSchedule(
  { schedule: "7 * * * *", timeZone: SCHEDULE_TIME_ZONE },
  async () => {
    const now = new Date();
    const waiting = await refs
      .games()
      .where("active", "==", true)
      .where("turnSince", "<=", Timestamp.fromMillis(now.getTime() - REMINDER_AFTER_MS))
      .get();

    for (const snapshot of waiting.docs) {
      const game = snapshot.data();
      if (game.turnUid === null) continue;
      const user = (await getFirestore().doc(`users/${game.turnUid}`).get()).data() as
        UserDoc | undefined;
      if (!reminderDue(game, now, user?.timeZone)) continue;

      await snapshot.ref.update({ lastReminderAt: FieldValue.serverTimestamp() });
      await sendPush([reminderFor(snapshot.id, game, game.turnUid)]);
    }
  },
);

/** Daily: closes games (and lobbies) without any change for 14 days and frees their room keys. */
export const expireStaleGames = onSchedule(
  { schedule: "17 4 * * *", timeZone: SCHEDULE_TIME_ZONE },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - EXPIRE_AFTER_MS);
    const stale = await refs
      .games()
      .where("active", "==", true)
      .where("updatedAt", "<=", cutoff)
      .get();

    for (const snapshot of stale.docs) {
      await getFirestore().runTransaction(async (tx) => {
        const game = (await tx.get(snapshot.ref)).data();
        // Skip games that got a move since the query.
        if (!game?.active || game.updatedAt.toMillis() > cutoff.toMillis()) return;
        tx.update(snapshot.ref, {
          status: "abandoned",
          active: false,
          expired: true,
          turnSeat: null,
          turnUid: null,
          version: game.version + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.delete(refs.roomKey(game.roomKey));
      });
    }
    logger.info(`Expired ${stale.size} stale games`);
  },
);

/** How long finished and ended games are kept (see the privacy policy). */
export const DELETE_ENDED_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

/** Daily: deletes games that ended 90 days ago, with their hands and state, and expired transfer codes. */
export const deleteEndedGames = onSchedule(
  { schedule: "27 4 * * *", timeZone: SCHEDULE_TIME_ZONE },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - DELETE_ENDED_AFTER_MS);
    const ended = await refs
      .games()
      .where("active", "==", false)
      .where("updatedAt", "<=", cutoff)
      .get();

    for (const snapshot of ended.docs) {
      await getFirestore().recursiveDelete(snapshot.ref);
    }
    logger.info(`Deleted ${ended.size} ended games`);

    const expired = await transferCodes().where("expiresAt", "<=", Timestamp.now()).get();
    await Promise.all(expired.docs.map((code) => code.ref.delete()));
  },
);
