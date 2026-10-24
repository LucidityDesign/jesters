import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

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
