import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DE, detectLang, duration, translate } from "./i18n";

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

describe("duration", () => {
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it("shows the largest unit and the one after it", () => {
    expect(duration(0, "en")).toBe("0 minutes");
    expect(duration(minute, "en")).toBe("1 minute");
    expect(duration(45 * minute + 59_000, "en")).toBe("45 minutes");
    expect(duration(498 * minute, "en")).toBe("8 hours and 18 minutes");
    expect(duration(hour, "en")).toBe("1 hour");
    expect(duration(2 * hour + 5 * minute, "en")).toBe("2 hours and 5 minutes");
    expect(duration(day + hour + minute, "en")).toBe("1 day and 1 hour");
    expect(duration(3 * day + 59 * minute, "en")).toBe("3 days");
  });

  it("follows 'seit' in German", () => {
    expect(duration(498 * minute, "de")).toBe("8 Stunden und 18 Minuten");
    expect(duration(day + hour, "de")).toBe("1 Tag und 1 Stunde");
    expect(duration(2 * day, "de")).toBe("2 Tagen");
    expect(
      translate("de", "{name} hasn't moved for {time}.", {
        name: "Mathies",
        time: duration(day, "de"),
      }),
    ).toBe("Mathies hat seit 1 Tag nicht gespielt.");
  });
});
