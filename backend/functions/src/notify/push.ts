import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
import type { PushMessage } from "./messages.js";

export interface UserDoc {
  displayName?: string;
  fcmTokens?: string[];
  timeZone?: string;
  locale?: string;
}

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/** Sends the messages to every device of each player and removes tokens FCM reports as invalid. */
export async function sendPush(messages: PushMessage[]): Promise<void> {
  await Promise.all(messages.map((message) => sendOne(message)));
}

async function sendOne(message: PushMessage): Promise<void> {
  const userRef = getFirestore().doc(`users/${message.uid}`);
  const user = (await userRef.get()).data() as UserDoc | undefined;
  const tokens = user?.fcmTokens ?? [];
  if (tokens.length === 0) return;

  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data: { gameId: message.gameId },
      apns: {
        payload: {
          aps: {
            alert: {
              titleLocKey: message.titleKey,
              locKey: message.bodyKey,
              locArgs: message.args,
            },
            sound: "default",
            threadId: message.gameId,
          },
        },
      },
    });
    const invalid = response.responses.flatMap((result, index) =>
      !result.success && INVALID_TOKEN_CODES.has(result.error?.code ?? "") ? [tokens[index]] : [],
    );
    if (invalid.length > 0) {
      await userRef.update({ fcmTokens: FieldValue.arrayRemove(...invalid) });
    }
  } catch (error) {
    // A failed notification must never fail the game action that caused it.
    logger.warn("Push notification failed", { uid: message.uid, error });
  }
}
