import { doc, setDoc } from "firebase/firestore";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { useEffect, useState } from "react";
import { firebase, usesEmulators } from "./firebase";
import { navigate } from "./router";
import { load, save } from "./storage";

// Browser notifications ("Your turn", "Game over", …) through Firebase Cloud Messaging. The
// backend sends them to the tokens in users/{uid}.fcmTokens, as for the iOS app; the service
// worker public/push-sw.js shows them.

/** `homeScreen`: Safari on iPhone and iPad, which only allows them once added to the Home Screen. */
export type NotificationState = "unsupported" | "homeScreen" | "off" | "on" | "blocked";

const SERVICE_WORKER = "/push-sw.js";
/** Set when the player turned notifications off here although the browser allows them. */
const OFF_KEY = "notificationsOff";
/** Set when the player said "Not now" to the offer on the home screen. */
const DISMISSED_KEY = "notificationsOfferDismissed";

async function supported(): Promise<boolean> {
  // The emulators can't hand out push tokens.
  if (usesEmulators || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  return isSupported().catch(() => false);
}

/** iOS or iPadOS (which says it is a Mac, but has touch), in Safari rather than from the Home Screen. */
function needsHomeScreen(): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function stateNow(isSupported: boolean): NotificationState {
  if (!isSupported) return !usesEmulators && needsHomeScreen() ? "homeScreen" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && !load(OFF_KEY) ? "on" : "off";
}

/** Gets this browser's push token and stores it as the guest's only device. */
async function register(uid: string): Promise<void> {
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER);
  const token = await getToken(getMessaging(firebase().app), {
    serviceWorkerRegistration: registration,
  });
  await setDoc(doc(firebase().db, "users", uid), { fcmTokens: [token] }, { merge: true });
}

/**
 * Once signed in: keeps the token current while notifications are on, and opens the game of a
 * notification clicked while the app is open.
 */
export function useNotificationSetup(uid: string | null): void {
  useEffect(() => {
    if (!uid || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const path: unknown = event.data?.path;
      if (event.data?.type === "open" && typeof path === "string" && path.startsWith("/")) {
        navigate(path);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    void supported().then((isSupported) => {
      if (stateNow(isSupported) === "on") register(uid).catch(() => undefined);
    });
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [uid]);
}

/** Whether notifications are on, and turning them on or off. `null` while checking. */
export function useNotifications(uid: string) {
  const [state, setState] = useState<NotificationState | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState(() => load(DISMISSED_KEY) !== null);

  useEffect(() => {
    let current = true;
    void supported().then((isSupported) => {
      if (current) setState(stateNow(isSupported));
    });
    return () => {
      current = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setFailed(false);
    try {
      // Must run right after the click: browsers only ask for permission then.
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        save(OFF_KEY, null);
        await register(uid);
      }
      setState(stateNow(true));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    save(OFF_KEY, "1");
    try {
      await setDoc(doc(firebase().db, "users", uid), { fcmTokens: [] }, { merge: true });
      await deleteToken(getMessaging(firebase().app));
    } catch {
      // Without a token on file nothing is sent, which is all that matters.
    }
    setState(stateNow(true));
    setBusy(false);
  }

  function dismiss() {
    save(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  /** Offer them on the home screen: possible, not yet decided, not dismissed. */
  const offer =
    !dismissed &&
    ((state === "off" && Notification.permission === "default") || state === "homeScreen");
  return { state, isBusy, failed, offer, turnOn, turnOff, dismiss };
}
