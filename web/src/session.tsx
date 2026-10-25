import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { firebase } from "./firebase";
import { load, save } from "./storage";

const NAME_KEY = "displayName";

export interface Session {
  /** The guest's user id; null while signing in. */
  uid: string | null;
  displayName: string;
  signInFailed: boolean;
  retrySignIn(): void;
  setDisplayName(name: string): void;
  /** Deletes everything stored about this guest, then starts over as a new guest. */
  deleteMyData(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
}

/** Signs in as an anonymous guest (one per browser) and remembers the display name. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [displayName, setName] = useState(() => load(NAME_KEY) ?? "");
  const [signInFailed, setSignInFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const { auth } = firebase();
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      if (user) {
        setSignInFailed(false);
      } else {
        signInAnonymously(auth).catch(() => setSignInFailed(true));
      }
    });
  }, [attempt]);

  useEffect(() => {
    if (!uid || !displayName) return;
    // Best effort: the profile only feeds reminders, so a failure must not block playing.
    api.saveProfile(uid, displayName).catch(() => undefined);
  }, [uid, displayName]);

  const session: Session = {
    uid,
    displayName,
    signInFailed,
    retrySignIn: () => {
      setSignInFailed(false);
      setAttempt((count) => count + 1);
    },
    setDisplayName: (name) => {
      const trimmed = name.trim();
      setName(trimmed);
      save(NAME_KEY, trimmed);
    },
    deleteMyData: async () => {
      await api.deleteMyData();
      setName("");
      save(NAME_KEY, null);
    },
  };
  return <SessionContext value={session}>{children}</SessionContext>;
}
