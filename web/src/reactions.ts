import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { firebase } from "./firebase";

/** The emojis players can react with. Keep in sync with `validReaction` in firestore.rules. */
export const REACTIONS = ["👍", "😂", "😮", "😡", "🎉", "🙈", "🔥", "👏"] as const;

/** How long a reaction floats over the sender's seat. */
export const REACTION_MS = 3500;

/** The rules allow one reaction per second; the buttons wait a little longer. */
export const REACTION_COOLDOWN_MS = 1200;

/** Sends an emoji reaction to the other players. It replaces the player's previous one. */
export function sendReaction(gameId: string, uid: string, emoji: string): Promise<void> {
  return setDoc(doc(firebase().db, `games/${gameId}/reactions/${uid}`), {
    emoji,
    at: serverTimestamp(),
    nonce: Math.random().toString(36).slice(2, 12),
  });
}

/** A reaction currently on screen; `key` changes with every new reaction. */
export interface ShownReaction {
  emoji: string;
  key: string;
}

/**
 * The reactions to show over the seats, by player uid, live. Only reactions sent after the page
 * was opened appear, each for `REACTION_MS`.
 */
export function useReactions(gameId: string): ReadonlyMap<string, ShownReaction> {
  const [shown, setShown] = useState<{ gameId: string; byUid: Map<string, ShownReaction> }>({
    gameId,
    byUid: new Map(),
  });

  useEffect(() => {
    const seen = new Set<string>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let first = true;
    const unsubscribe = onSnapshot(
      collection(firebase().db, `games/${gameId}/reactions`),
      (snapshot) => {
        const fresh: [string, ShownReaction][] = [];
        for (const change of snapshot.docChanges()) {
          if (change.type === "removed") continue;
          const { emoji, nonce } = change.doc.data() as { emoji?: string; nonce?: string };
          // A nonce comes back when a rejected write is rolled back, or once the server confirms it.
          if (!emoji || !nonce || seen.has(nonce)) continue;
          seen.add(nonce);
          if (!first) fresh.push([change.doc.id, { emoji, key: nonce }]);
        }
        first = false;
        if (fresh.length === 0) return;

        setShown((current) => {
          const byUid = new Map(current.gameId === gameId ? current.byUid : []);
          for (const [uid, reaction] of fresh) byUid.set(uid, reaction);
          return { gameId, byUid };
        });
        const timer = setTimeout(() => {
          timers.delete(timer);
          setShown((current) => {
            const byUid = new Map(current.byUid);
            for (const [uid, reaction] of fresh) {
              if (byUid.get(uid)?.key === reaction.key) byUid.delete(uid);
            }
            return { gameId: current.gameId, byUid };
          });
        }, REACTION_MS);
        timers.add(timer);
      },
      // Reactions are a nice extra: without them the game goes on as usual.
      () => {},
    );
    return () => {
      unsubscribe();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [gameId]);

  return shown.gameId === gameId ? shown.byUid : new Map();
}
