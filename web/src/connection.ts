import { useSyncExternalStore } from "react";

// Whether the app is connected: the browser is online and no live listener is stuck on cached
// data. Firestore marks snapshots `fromCache` while it can't reach the server, which also catches
// a network that is up without internet.

const staleListeners = new Set<symbol>();
const subscribers = new Set<() => void>();

/** Records whether a live listener's latest data came from the cache instead of the server. */
export function reportStale(listener: symbol, stale: boolean): void {
  if (stale === staleListeners.has(listener)) return;
  if (stale) staleListeners.add(listener);
  else staleListeners.delete(listener);
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    subscribers.delete(notify);
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export function isConnected(): boolean {
  return navigator.onLine && staleListeners.size === 0;
}

/** Whether the app is connected to the server, live. */
export function useConnected(): boolean {
  return useSyncExternalStore(subscribe, isConnected);
}
