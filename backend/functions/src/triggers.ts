import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import type { GameDoc } from "./game/model.js";
import { notificationsFor } from "./notify/messages.js";
import { sendPush } from "./notify/push.js";

/** Sends "your turn", "game started" and "game over" notifications when a game changes. */
export const onGameUpdated = onDocumentUpdated("games/{gameId}", async (event) => {
  const before = event.data?.before.data() as GameDoc | undefined;
  const after = event.data?.after.data() as GameDoc | undefined;
  if (!before || !after) return;
  await sendPush(notificationsFor(event.params.gameId, before, after));
});
