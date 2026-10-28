import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { reportStale } from "./connection";
import { firebase } from "./firebase";
import type { GameDoc } from "./model";

/** `undefined` while loading, `null` if the document does not exist or cannot be read. */
export type Loaded<T> = T | null | undefined;

/** How often, and after how long, a listener that failed before it loaded anything starts again. */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

/** A Firestore document, live. */
export function useDocument<T>(path: string): Loaded<T> {
  // Keyed by path, so a new path starts out as "loading" instead of showing the old document.
  const [state, setState] = useState<{ path: string; data: Loaded<T> }>({ path, data: undefined });
  useEffect(() => {
    const listener = Symbol(path);
    let unsubscribe = () => {};
    let retry: ReturnType<typeof setTimeout> | undefined;
    let loaded = false;
    let failures = 0;

    const listen = () => {
      unsubscribe = onSnapshot(
        doc(firebase().db, path),
        { includeMetadataChanges: true },
        (snapshot) => {
          reportStale(listener, snapshot.metadata.fromCache);
          // Offline, a missing document may only be missing from the cache: keep loading.
          if (snapshot.metadata.fromCache && !snapshot.exists()) return;
          if (!snapshot.metadata.fromCache) loaded = true;
          setState({ path, data: (snapshot.data() as T | undefined) ?? null });
        },
        (error) => {
          // Right after the app starts, the first read can be refused while the sign-in or
          // App Check token is still being refreshed: try again before giving up.
          const delay = loaded ? undefined : RETRY_DELAYS_MS[failures++];
          if (delay !== undefined) {
            console.warn(`Reading ${path} failed, trying again`, error);
            retry = setTimeout(listen, delay);
            return;
          }
          // Reading fails for good once the player is no longer part of the game.
          setState({ path, data: null });
        },
      );
    };
    listen();

    return () => {
      clearTimeout(retry);
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
