import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUSH_TEXTS, pushText } from "./texts.js";

describe("push texts for browsers", () => {
  it("fills in placeholders in the player's language", () => {
    expect(pushText("PUSH_TURN_BID", ["5", "Ben, Cleo"], "en-US")).toBe(
      "Round 5 with Ben, Cleo: how many tricks will you take?",
    );
    expect(pushText("PUSH_TURN_BID", ["5", "Ben, Cleo"], "de-DE")).toBe(
      "Runde 5 mit Ben, Cleo: Wie viele Stiche machst du?",
    );
    expect(pushText("PUSH_STARTED", ["Anna"], undefined)).toBe("Anna started the game.");
    expect(pushText("PUSH_TITLE_YOUR_TURN", [], "fr")).toBe("Your turn");
  });

  it("match the iOS app's string catalog", () => {
    const catalog = JSON.parse(
      readFileSync(
        new URL("../../../../ios/Jesters/Resources/Localizable.xcstrings", import.meta.url),
        "utf8",
      ),
    ) as {
      strings: Record<string, { localizations: Record<string, { stringUnit: { value: string } }> }>;
    };
    for (const lang of ["en", "de"] as const) {
      const ios = Object.fromEntries(
        Object.entries(catalog.strings)
          .filter(([key]) => key.startsWith("PUSH_"))
          .map(([key, entry]) => [key, entry.localizations[lang]?.stringUnit.value]),
      );
      expect(PUSH_TEXTS[lang], lang).toEqual(ios);
    }
  });
});
