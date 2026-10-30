import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/engine/**"],
      exclude: ["**/*.test.ts"],
      // The rules engine must stay fully covered.
      thresholds: { 100: true },
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Slow simulations, run by hand: `pnpm simulate calibrate` or `pnpm simulate tournament`.
        test: {
          name: "simulate",
          include: ["test/simulate/**/*.sim.ts"],
          testTimeout: 60 * 60_000,
        },
      },
      {
        // Runs inside `firebase emulators:exec` (see `pnpm test:emulator`).
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
