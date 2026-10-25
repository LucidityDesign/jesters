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

/**
 * Callables reject requests that don't come from the genuine app (App Check) unless
 * ENFORCE_APP_CHECK is "false": `.env.demo-jesters` turns it off for the emulators, CI deploys
 * follow the ENFORCE_APP_CHECK repository variable. Read from the environment directly: the
 * functions SDK evaluates this option when the code loads, also during a deploy, so a param
 * (`defineBoolean`) would only add warnings.
 */
export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK !== "false";

/** Options for every callable. */
export const CALLABLE = { enforceAppCheck: ENFORCE_APP_CHECK };
