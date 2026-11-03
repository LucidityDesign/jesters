import { randomInt } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  type DocumentData,
  FieldValue,
  type FirestoreDataConverter,
  getFirestore,
  type Transaction,
  type WithFieldValue,
} from "firebase-admin/firestore";
import type { GameState, RandomInt } from "../engine/index.js";
import {
  applyQueuedBids,
  type GameDoc,
  type HandDoc,
  handDoc,
  publicPlay,
  type QueuedBid,
  type SecretDoc,
  secretDoc,
} from "./model.js";

export interface RoomKeyDoc {
  gameId: string;
}

/** Cryptographically secure randomness for shuffling and room keys. */
export const secureRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

function converter<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data: WithFieldValue<T>) => data as DocumentData,
    fromFirestore: (snapshot) => snapshot.data() as T,
  };
}

export const refs = {
  games: () => getFirestore().collection("games").withConverter(converter<GameDoc>()),
  game: (gameId: string) => refs.games().doc(gameId),
  secret: (gameId: string) =>
    getFirestore().doc(`games/${gameId}/secret/state`).withConverter(converter<SecretDoc>()),
  hand: (gameId: string, uid: string) =>
    getFirestore().doc(`games/${gameId}/hands/${uid}`).withConverter(converter<HandDoc>()),
  reaction: (gameId: string, uid: string) => getFirestore().doc(`games/${gameId}/reactions/${uid}`),
  roomKey: (key: string) =>
    getFirestore().doc(`roomKeys/${key}`).withConverter(converter<RoomKeyDoc>()),
};

/**
 * Writes a new engine state for a running game: the public game document, the secret state and
 * every hand document that changed. All reads of the transaction must have happened before.
 */
export function writeState(
  tx: Transaction,
  gameId: string,
  game: GameDoc,
  previous: GameState | null,
  stateAfterMove: GameState,
  {
    byBot = false,
    queued = {},
  }: {
    byBot?: boolean;
    /** The queued bids from the secret document, as read in this transaction. */
    queued?: Readonly<Record<string, QueuedBid>>;
  } = {},
): void {
  // Whoever has a bid queued bids now, if it is their turn.
  const applied = applyQueuedBids(stateAfterMove, game.playerUids, queued, secureRandomInt);
  const next = applied.state;
  const play = publicPlay(next, game.playerUids);
  const finished = next.phase === "finished";
  // Whoever had the turn made this move (unless the game just started), or a bot for them.
  const mover = previous === null ? undefined : game.players.find((p) => p.uid === game.turnUid);
  const person = mover && !mover.bot ? mover : undefined;
  tx.update(refs.game(gameId), {
    ...play,
    active: !finished,
    version: game.version + 1,
    updatedAt: FieldValue.serverTimestamp(),
    ...(play.turnUid !== game.turnUid ? { turnSince: FieldValue.serverTimestamp() } : {}),
    ...(person && !byBot ? { [`lastMoveAt.${person.uid}`]: FieldValue.serverTimestamp() } : {}),
    // A person who moves themselves has taken over from their auto-play.
    ...(person && !byBot && game.autoPlay?.[person.uid]
      ? { [`autoPlay.${person.uid}`]: FieldValue.delete() }
      : {}),
    ...(person && byBot && game.round
      ? { [`autoPlayedRounds.${person.uid}`]: FieldValue.arrayUnion(game.round.number) }
      : {}),
  });
  tx.set(refs.secret(gameId), { ...secretDoc(next), queuedBids: applied.queued });

  game.playerUids.forEach((uid, seat) => {
    // Someone who left (or deleted their data) gets no hand: a bot plays from the secret state.
    if (game.players[seat]?.left) return;
    const hand = handDoc(next, seat, applied.queued[uid]);
    if (previous === null || !isDeepStrictEqual(hand, handDoc(previous, seat, queued[uid]))) {
      tx.set(refs.hand(gameId, uid), hand);
    }
  });

  if (finished) {
    tx.delete(refs.roomKey(game.roomKey));
  }
}
