import { botToMove, type GameDoc } from "../game/model.js";

/**
 * A push notification for one player. Texts are localized on the device: `titleKey` and `bodyKey`
 * are keys in the app's string catalog, `args` fill its placeholders.
 */
export interface PushMessage {
  uid: string;
  gameId: string;
  titleKey: string;
  bodyKey: string;
  args: string[];
}

/**
 * No "your turn" push for a player who made a move in the game this recently: they are still
 * playing (with bots, the turn comes back every trick) and see it in the app.
 */
export const PLAYING_RECENTLY_MS = 2 * 60 * 1000;

function playingRecently(game: GameDoc, uid: string): boolean {
  const last = game.lastMoveAt?.[uid];
  return last !== undefined && game.updatedAt.toMillis() - last.toMillis() < PLAYING_RECENTLY_MS;
}

const TURN_KEYS = {
  choosingTrump: "PUSH_TURN_TRUMP",
  bidding: "PUSH_TURN_BID",
  playing: "PUSH_TURN_PLAY",
} as const;

/** The other players' names, for "the game with …". */
function othersOf(game: GameDoc, uid: string): string {
  return game.players
    .filter((player) => player.uid !== uid)
    .map((player) => player.name)
    .join(", ");
}

function nameOf(game: GameDoc, uid: string | undefined): string {
  return game.players.find((player) => player.uid === uid)?.name ?? "?";
}

function toEveryone(
  game: GameDoc,
  gameId: string,
  except: (string | null | undefined)[],
  message: Omit<PushMessage, "uid" | "gameId">,
): PushMessage[] {
  return game.players
    .filter((player) => !player.bot && !except.includes(player.uid))
    .map((player) => ({ uid: player.uid, gameId, ...message }));
}

/** Notifications caused by a change of `games/{gameId}` from `before` to `after`. */
export function notificationsFor(gameId: string, before: GameDoc, after: GameDoc): PushMessage[] {
  if (after.status === "abandoned" && before.status !== "abandoned") {
    return after.expired
      ? toEveryone(after, gameId, [], {
          titleKey: "PUSH_TITLE_GAME_OVER",
          bodyKey: "PUSH_EXPIRED",
          args: [],
        })
      : toEveryone(after, gameId, [after.abandonedBy], {
          titleKey: "PUSH_TITLE_GAME_OVER",
          bodyKey: "PUSH_LEFT",
          args: [nameOf(after, after.abandonedBy)],
        });
  }

  if (after.status === "finished" && before.status !== "finished") {
    const totals = after.results.at(-1)?.totals ?? [];
    const best = Math.max(...totals);
    const winners = after.players.filter((_, seat) => totals[seat] === best).map((p) => p.name);
    return toEveryone(after, gameId, [], {
      titleKey: "PUSH_TITLE_GAME_OVER",
      bodyKey: "PUSH_FINISHED",
      args: [winners.join(", ")],
    });
  }

  const messages: PushMessage[] = [];
  if (before.status === "lobby" && after.status !== "lobby") {
    // The host started the game; whoever is first to act gets the "your turn" message instead.
    messages.push(
      ...toEveryone(after, gameId, [after.hostUid, after.turnUid], {
        titleKey: "PUSH_TITLE_GAME",
        bodyKey: "PUSH_STARTED",
        args: [nameOf(after, after.hostUid)],
      }),
    );
  }

  const status = after.status;
  if (
    after.active &&
    after.turnUid !== null &&
    after.turnUid !== before.turnUid &&
    botToMove(after) === null &&
    !playingRecently(after, after.turnUid) &&
    (status === "choosingTrump" || status === "bidding" || status === "playing")
  ) {
    messages.push({
      uid: after.turnUid,
      gameId,
      titleKey: "PUSH_TITLE_YOUR_TURN",
      bodyKey: TURN_KEYS[status],
      args: [String(after.round?.number ?? 1), othersOf(after, after.turnUid)],
    });
  }
  return messages;
}

/** The daily reminder for a player whose turn has been waiting. */
export function reminderFor(gameId: string, game: GameDoc, uid: string): PushMessage {
  return {
    uid,
    gameId,
    titleKey: "PUSH_TITLE_YOUR_TURN",
    bodyKey: "PUSH_REMINDER",
    args: [othersOf(game, uid)],
  };
}
