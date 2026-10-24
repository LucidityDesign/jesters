import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Runs inside `firebase emulators:exec` (see `npm run test:emulator`).
        test: {
          name: "emulator",
          include: ["test/emulator/**/*.test.ts"],
          testTimeout: 20_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
