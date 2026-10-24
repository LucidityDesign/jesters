import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["lib/", "node_modules/", "coverage/"] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    // The rules engine stays pure: no Firebase, no Node APIs, no I/O.
    files: ["src/engine/**/*.ts"],
    ignores: ["src/engine/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["firebase", "firebase/*", "firebase-*", "@firebase/*", "node:*"] },
      ],
    },
  },
);
