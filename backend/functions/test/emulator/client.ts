import { type FirebaseApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  type Firestore,
  getDoc,
  getFirestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  type FunctionsError,
  getFunctions,
  httpsCallable,
} from "firebase/functions";

const HOST = "127.0.0.1";
let appCount = 0;

/** A signed-in guest with their own Firebase client app, talking to the emulators. */
export interface TestPlayer {
  uid: string;
  name: string;
  app: FirebaseApp;
  db: Firestore;
  call<T = unknown>(name: string, data?: unknown): Promise<T>;
  /** Reads a document as this player (security rules apply). */
  read<T>(path: string): Promise<T | undefined>;
}

export async function newPlayer(name: string): Promise<TestPlayer> {
  const app = initializeApp(
    { projectId: "demo-jesters", apiKey: "demo-api-key" },
    `player-${++appCount}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}:9099`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, 8080);
  const functions = getFunctions(app, "europe-west3");
  connectFunctionsEmulator(functions, HOST, 5001);
  const { user } = await signInAnonymously(auth);

  return {
    uid: user.uid,
    name,
    app,
    db,
    call: async <T>(fn: string, data?: unknown) =>
      (await httpsCallable(functions, fn)(data)).data as T,
    read: async <T>(path: string) => (await getDoc(doc(db, path))).data() as T | undefined,
  };
}

/** The `details.reason` of a rejected callable, or the error code if it has none. */
export async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const { code, details } = error as FunctionsError;
    return (details as { reason?: string } | undefined)?.reason ?? code;
  }
  throw new Error("Expected the call to be rejected");
}

/** Creates a room hosted by the first player and lets the others join. */
export async function setUpRoom(
  players: readonly TestPlayer[],
): Promise<{ gameId: string; roomKey: string }> {
  const [host, ...others] = players;
  if (!host) throw new Error("setUpRoom: no players");
  const room = await host.call<{ gameId: string; roomKey: string }>("createRoom", {
    name: host.name,
  });
  for (const player of others) {
    await player.call("joinRoom", { roomKey: room.roomKey, name: player.name });
  }
  return room;
}

/** Several guests at once, typed as a tuple: `const [a, b] = await newPlayers("A", "B")`. */
export async function newPlayers<const Names extends readonly string[]>(
  ...names: Names
): Promise<{ [K in keyof Names]: TestPlayer }> {
  return (await Promise.all(names.map(newPlayer))) as { [K in keyof Names]: TestPlayer };
}
