import { type ReactNode, useEffect, useRef, useState } from "react";
import { lang, t } from "../i18n";
import {
  REACTION_COOLDOWN_MS,
  REACTIONS,
  reactionMotion,
  type ShownReaction,
  sendReaction,
} from "../reactions";
import { load, save } from "../storage";

/**
 * A reaction floating over a player (their seat at the table, their name in the lobby). Give it
 * `key={reaction.key}`, so the same emoji pops again when it is sent twice.
 */
export function ReactionBubble({ reaction }: { reaction: ShownReaction }) {
  return (
    <span
      className={`reaction reaction-${reactionMotion(reaction.emoji) ?? "float"}`}
      role="img"
      aria-label={reaction.emoji}
    >
      <span className="reaction-inner">{reaction.emoji}</span>
    </span>
  );
}

/** The emojis for the "+" panel in the app's language, loaded when the panel first opens. */
type EmojiData = { groups: string[]; emojis: [emoji: string, group: number, search: string][] };
let emojiData: Promise<EmojiData> | undefined;
function loadEmojis(): Promise<EmojiData> {
  emojiData ??= (lang === "de" ? import("../emoji/de.json") : import("../emoji/en.json")).then(
    (module) => module.default as EmojiData,
  );
  return emojiData;
}

/**
 * A button that opens the usual emojis to react with, and "+" for all others; the emoji then
 * floats over the own seat or name.
 */
export function ReactionPicker({ gameId, uid }: { gameId: string; uid: string }) {
  const [open, setOpen] = useState<"quick" | "all" | null>(null);
  const [coolingDown, setCoolingDown] = useState(false);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), REACTION_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  function send(emoji: string) {
    setOpen(null);
    setCoolingDown(true);
    rememberReaction(emoji);
    // Reactions are a nice extra: a lost one is not worth an error message.
    sendReaction(gameId, uid, emoji).catch(() => {});
  }

  return (
    <div className="reactions" onKeyDown={(event) => event.key === "Escape" && setOpen(null)}>
      {open === "quick" && (
        <div className="reaction-choices" role="group" aria-label={t("Reactions")}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              className="reaction-choice"
              disabled={coolingDown}
              onClick={() => send(emoji)}
            >
              {emoji}
            </button>
          ))}
          <button
            className="reaction-choice reaction-more"
            aria-label={t("More emojis")}
            title={t("More emojis")}
            onClick={() => setOpen("all")}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      )}
      {open === "all" && <EmojiPanel disabled={coolingDown} onChoose={send} />}
      <button
        className="reaction-toggle"
        aria-expanded={open !== null}
        aria-label={t("React")}
        title={t("React")}
        onClick={() => setOpen(open === null ? "quick" : null)}
      >
        <span aria-hidden="true">😊</span>
      </button>
    </div>
  );
}

/** All emojis, by group, with a search and the ones the player sent last. */
function EmojiPanel({
  disabled,
  onChoose,
}: {
  disabled: boolean;
  onChoose: (emoji: string) => void;
}) {
  const [data, setData] = useState<EmojiData | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let current = true;
    loadEmojis().then(
      (loaded) => current && setData(loaded),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, []);

  const button = (emoji: string) => (
    <button
      key={emoji}
      className="reaction-choice"
      disabled={disabled}
      onClick={() => onChoose(emoji)}
    >
      {emoji}
    </button>
  );
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const recent = recentReactions();

  return (
    <div className="emoji-panel" role="dialog" aria-label={t("All emojis")}>
      <input
        type="search"
        className="emoji-search"
        placeholder={t("Search emojis")}
        aria-label={t("Search emojis")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />
      {data && words.length === 0 && (
        <div className="emoji-tabs" role="group" aria-label={t("Emoji groups")}>
          {data.groups.map((name, group) => {
            const first = data.emojis.find(([, g]) => g === group);
            if (!first) return null;
            return (
              <button
                key={name}
                className="emoji-tab"
                aria-label={name}
                title={name}
                onClick={() =>
                  list.current
                    ?.querySelector(`[data-group="${group}"]`)
                    ?.scrollIntoView({ block: "start" })
                }
              >
                {first[0]}
              </button>
            );
          })}
        </div>
      )}
      <div className="emoji-list" ref={list}>
        {failed && <p className="hint">{t("The emojis could not be loaded.")}</p>}
        {!data && !failed && <p className="hint">{t("Loading…")}</p>}
        {data && words.length > 0 && <EmojiResults data={data} words={words} button={button} />}
        {data && words.length === 0 && (
          <>
            {recent.length > 0 && (
              <section aria-label={t("Recently used")}>
                <h3>{t("Recently used")}</h3>
                <div className="emoji-grid">{recent.map(button)}</div>
              </section>
            )}
            {data.groups.map((name, group) => {
              const emojis = data.emojis.filter(([, g]) => g === group);
              if (emojis.length === 0) return null;
              return (
                <section key={name} data-group={group} aria-label={name}>
                  <h3>{name}</h3>
                  <div className="emoji-grid">{emojis.map(([emoji]) => button(emoji))}</div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function EmojiResults({
  data,
  words,
  button,
}: {
  data: EmojiData;
  words: string[];
  button: (emoji: string) => ReactNode;
}) {
  const found = data.emojis.filter(([, , search]) => words.every((word) => search.includes(word)));
  if (found.length === 0) return <p className="hint">{t("No emoji found.")}</p>;
  return <div className="emoji-grid">{found.map(([emoji]) => button(emoji))}</div>;
}

const RECENT_KEY = "recentReactions";
const RECENT_COUNT = 16;

/** The emojis the player sent last, newest first (only on this device). */
function recentReactions(): string[] {
  try {
    const stored = JSON.parse(load(RECENT_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function rememberReaction(emoji: string): void {
  const recent = [emoji, ...recentReactions().filter((e) => e !== emoji)].slice(0, RECENT_COUNT);
  save(RECENT_KEY, JSON.stringify(recent));
}
