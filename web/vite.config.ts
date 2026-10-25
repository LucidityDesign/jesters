/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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

export default defineConfig({
  plugins: [react(), appleAppSiteAssociation()],
  // The privacy policy is rendered from ../docs/privacy-policy.md.
  server: { fs: { allow: [".."] } },
  // Most of the bundle is the Firebase SDK (Firestore with live listeners).
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ["src/**/*.test.ts"] },
});
