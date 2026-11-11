// Writes the emojis for the reaction picker's "+" panel (src/emoji/<lang>.json) from the
// emojibase-data package: every emoji up to EMOJI_VERSION, in Unicode's order and groups, with
// its name and keywords in that language for the search. Run after updating emojibase-data:
//   node scripts/emoji-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

/** Newer emojis are missing from too many phones still in use (they would show as boxes). */
const EMOJI_VERSION = 14;
const LANGS = ["en", "de"];
/** Skin tone and hair swatches: not emojis on their own. */
const COMPONENT_GROUP = 2;

const data = (path) =>
  JSON.parse(readFileSync(new URL(`../node_modules/emojibase-data/${path}`, import.meta.url)));

const supported = new Set(
  Object.entries(data("versions/emoji.json"))
    .filter(([version]) => Number(version) <= EMOJI_VERSION)
    .flatMap(([, hexcodes]) => hexcodes),
);

for (const lang of LANGS) {
  const groups = data(`${lang}/messages.json`).groups;
  const emojis = data(`${lang}/compact.json`)
    .filter((e) => e.group !== undefined && e.group !== COMPONENT_GROUP)
    .filter((e) => supported.has(e.hexcode))
    // Only what firestore.rules accepts as a reaction (no letters: drops ℹ️).
    .filter((e) => /^[^\p{L}\s<>&"]+$/u.test(e.unicode))
    .sort((a, b) => a.order - b.order)
    .map((e) => [e.unicode, e.group, [e.label, ...(e.tags ?? [])].join(" ").toLowerCase()]);
  const out = {
    groups: groups.map((g) => g.message.charAt(0).toUpperCase() + g.message.slice(1)),
    emojis,
  };
  writeFileSync(new URL(`../src/emoji/${lang}.json`, import.meta.url), `${JSON.stringify(out)}\n`);
  console.log(lang, emojis.length, "emojis");
}
