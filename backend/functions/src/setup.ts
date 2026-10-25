import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineBoolean } from "firebase-functions/params";

// Imported first by index.ts: options must be set before any function is defined.

/** All functions run in Frankfurt, next to Firestore. */
export const REGION = "europe-west3";

/** Time zone for `onSchedule` jobs, so cron times follow European daylight saving time. */
export const SCHEDULE_TIME_ZONE = "Europe/Berlin";

initializeApp();

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
});

/**
 * Callables reject requests that don't come from the genuine app (App Check). Set in `.env`;
 * `.env.demo-jesters` turns it off for the emulators, where clients have no App Check token.
 */
export const ENFORCE_APP_CHECK = defineBoolean("ENFORCE_APP_CHECK", { default: true });

/** Options for every callable. */
export const CALLABLE = { enforceAppCheck: ENFORCE_APP_CHECK };
