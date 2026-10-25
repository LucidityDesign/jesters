import { type FirebaseApp, type FirebaseOptions, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, type Firestore, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, type Functions, getFunctions } from "firebase/functions";

/** Must match the region in backend/functions/src/setup.ts. */
const REGION = "europe-west3";
const EMULATOR_HOST = "127.0.0.1";

/**
 * The dev server (`pnpm dev`) talks to the local emulators with the `demo-jesters` project.
 * Built apps use the config built in from FIREBASE_CONFIG_JSON, or else read it from Firebase
 * Hosting (`/__/firebase/init.json`).
 */
export const usesEmulators = import.meta.env.DEV;

const demoOptions: FirebaseOptions = {
  projectId: "demo-jesters",
  apiKey: "demo-key-for-local-emulators",
  appId: "1:000000000000:web:0000000000000000",
};

export interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let services: Services | undefined;

export async function initFirebase(): Promise<Services> {
  const options = usesEmulators
    ? demoOptions
    : (__FIREBASE_CONFIG__ ??
      ((await (await fetch("/__/firebase/init.json")).json()) as FirebaseOptions));
  const app = initializeApp(options);

  // App Check proves to the backend that requests come from this site (reCAPTCHA Enterprise).
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  if (!usesEmulators && siteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, REGION);
  if (usesEmulators) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
    connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
  }
  services = { app, auth, db, functions };
  return services;
}

export function firebase(): Services {
  if (!services) throw new Error("initFirebase() has not run");
  return services;
}
