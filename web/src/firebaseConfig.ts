import type { FirebaseOptions } from "firebase/app";

const KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
  "measurementId",
] as const;

/**
 * Reads the web app config as copied from the Firebase console: either JSON or the
 * `const firebaseConfig = { apiKey: "…", … };` snippet. Returns null if it has no
 * projectId, apiKey and appId.
 */
export function parseFirebaseConfig(text: string | undefined): FirebaseOptions | null {
  if (!text?.trim()) return null;
  const config: Record<string, string> = {};
  for (const key of KEYS) {
    const match = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`).exec(text);
    if (match?.[1]) config[key] = match[1];
  }
  if (!config.projectId || !config.apiKey || !config.appId) return null;
  return config;
}
