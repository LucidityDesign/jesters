import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DE, detectLang, translate } from "./i18n";

/** Every literal passed to t(…), plus the error messages in api.ts. */
function textsInSource(dir: string): string[] {
  const texts: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) continue;
    const source = readFileSync(join(entry.parentPath, entry.name), "utf8");
    for (const match of source.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g))
      texts.push(match[1] as string);
    if (entry.name === "api.ts") {
      for (const match of source.matchAll(/^\s+[A-Z_]+: "((?:[^"\\]|\\.)*)",/gm)) {
        texts.push(match[1] as string);
      }
    }
  }
  return texts;
}

describe("translations", () => {
  it("has German for every text in the app", () => {
    const missing = textsInSource("src").filter((text) => !(text in DE));
    expect(missing).toEqual([]);
  });

  it("keeps the placeholders", () => {
    for (const [english, german] of Object.entries(DE)) {
      const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(names(german), english).toEqual(names(english));
    }
  });

  it("fills in placeholders", () => {
    expect(translate("en", "Waiting for {name} to bid", { name: "Ben" })).toBe(
      "Waiting for Ben to bid",
    );
    expect(translate("de", "Bid {bid}, won {won}", { bid: 2, won: 1 })).toBe(
      "2 angesagt, 1 gemacht",
    );
  });

  it("picks German or English from the browser languages", () => {
    expect(detectLang(["de-AT", "en"])).toBe("de");
    expect(detectLang(["fr-FR", "en-GB", "de"])).toBe("en");
    expect(detectLang(["fr"])).toBe("en");
  });
});
