import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { reportStale } from "./connection";
import { firebase } from "./firebase";
import type { GameDoc } from "./model";

/** `undefined` while loading, `null` if the document does not exist or cannot be read. */
export type Loaded<T> = T | null | undefined;

/** A Firestore document, live. */
export function useDocument<T>(path: string): Loaded<T> {
  // Keyed by path, so a new path starts out as "loading" instead of showing the old document.
  const [state, setState] = useState<{ path: string; data: Loaded<T> }>({ path, data: undefined });
  useEffect(() => {
    const listener = Symbol(path);
    const unsubscribe = onSnapshot(
      doc(firebase().db, path),
      { includeMetadataChanges: true },
      (snapshot) => {
        reportStale(listener, snapshot.metadata.fromCache);
        // Offline, a missing document may only be missing from the cache: keep loading.
        if (snapshot.metadata.fromCache && !snapshot.exists()) return;
        setState({ path, data: (snapshot.data() as T | undefined) ?? null });
      },
      // Reading fails once the player is no longer part of the game.
      () => setState({ path, data: null }),
    );
    return () => {
      unsubscribe();
      reportStale(listener, false);
    };
  }, [path]);
  return state.path === path ? state.data : undefined;
}

export interface GameEntry {
  id: string;
  game: GameDoc;
}

/** The player's 50 most recent games, live; `null` if they could not be loaded. */
export function useMyGames(uid: string): Loaded<GameEntry[]> {
  const [state, setState] = useState<{ uid: string; games: Loaded<GameEntry[]> }>({
    uid,
    games: undefined,
  });
  useEffect(() => {
    const games = query(
      collection(firebase().db, "games"),
      where("playerUids", "array-contains", uid),
      orderBy("updatedAt", "desc"),
      limit(50),
    );
    const listener = Symbol("games");
    const unsubscribe = onSnapshot(
      games,
      { includeMetadataChanges: true },
      (snapshot) => {
        reportStale(listener, snapshot.metadata.fromCache);
        setState({
          uid,
          games: snapshot.docs.map((entry) => ({ id: entry.id, game: entry.data() as GameDoc })),
        });
      },
      () => setState({ uid, games: null }),
    );
    return () => {
      unsubscribe();
      reportStale(listener, false);
    };
  }, [uid]);
  return state.uid === uid ? state.games : undefined;
}
