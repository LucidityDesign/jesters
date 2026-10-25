/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { parseFirebaseConfig } from "./src/firebaseConfig.ts";

/**
 * Universal Links: lets `https://<domain>/join/<key>` open the iOS app. Written only when
 * APPLE_TEAM_ID is set at build time (see README).
 */
function appleAppSiteAssociation(): Plugin {
  return {
    name: "apple-app-site-association",
    generateBundle() {
      const teamId = process.env.APPLE_TEAM_ID;
      if (!teamId) return;
      const association = {
        applinks: {
          details: [
            {
              appIDs: [`${teamId}.design.lucidity.jesters`],
              components: [{ "/": "/join/*" }],
            },
          ],
        },
      };
      this.emitFile({
        type: "asset",
        fileName: ".well-known/apple-app-site-association",
        source: JSON.stringify(association),
      });
    },
  };
}

/**
 * The web app config (FIREBASE_CONFIG_JSON, as copied from the Firebase console) is built in when
 * set; otherwise the app loads it from Firebase Hosting at runtime.
 */
function firebaseConfig() {
  const text = process.env.FIREBASE_CONFIG_JSON;
  const config = parseFirebaseConfig(text);
  if (text?.trim() && !config) {
    throw new Error("FIREBASE_CONFIG_JSON needs at least apiKey, projectId and appId.");
  }
  const expected = process.env.FIREBASE_PROJECT_ID;
  if (config && expected && config.projectId !== expected) {
    throw new Error(
      `FIREBASE_CONFIG_JSON is for project ${config.projectId}, but the deploy goes to ${expected}.`,
    );
  }
  return config;
}

export default defineConfig({
  plugins: [react(), appleAppSiteAssociation()],
  define: { __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig()) },
  // The privacy policy is rendered from ../docs/privacy-policy.md.
  server: { fs: { allow: [".."] } },
  build: {
    // Firebase Hosting only serves folders inside its project directory (backend/).
    outDir: "../backend/hosting",
    emptyOutDir: true,
    // Most of the bundle is the Firebase SDK (Firestore with live listeners).
    chunkSizeWarningLimit: 1200,
  },
  test: { include: ["src/**/*.test.ts"] },
});
