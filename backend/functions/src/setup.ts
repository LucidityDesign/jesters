import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

// Imported first by index.ts: options must be set before any function is defined.
export const REGION = "europe-west3";

initializeApp();

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
});
