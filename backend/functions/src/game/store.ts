import { randomInt } from "node:crypto";
import {
  type DocumentData,
  FieldValue,
  type FirestoreDataConverter,
  getFirestore,
  type Transaction,
  type WithFieldValue,
} from "firebase-admin/firestore";
import { isDeepStrictEqual } from "node:util";
import type { GameState, RandomInt } from "../engine/index.js";
import {
  type GameDoc,
  type HandDoc,
  handDoc,
  publicPlay,
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
  next: GameState,
): void {
  const play = publicPlay(next, game.playerUids);
  const finished = next.phase === "finished";
  tx.update(refs.game(gameId), {
    ...play,
    active: !finished,
    version: game.version + 1,
    updatedAt: FieldValue.serverTimestamp(),
    ...(play.turnUid !== game.turnUid ? { turnSince: FieldValue.serverTimestamp() } : {}),
  });
  tx.set(refs.secret(gameId), secretDoc(next));

  game.playerUids.forEach((uid, seat) => {
    const hand = handDoc(next, seat);
    if (previous === null || !isDeepStrictEqual(hand, handDoc(previous, seat))) {
      tx.set(refs.hand(gameId, uid), hand);
    }
  });

  if (finished) {
    tx.delete(refs.roomKey(game.roomKey));
  }
}
