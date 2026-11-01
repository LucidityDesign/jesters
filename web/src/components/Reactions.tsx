import { useEffect, useState } from "react";
import { t } from "../i18n";
import {
  REACTION_COOLDOWN_MS,
  REACTIONS,
  reactionMotion,
  type ShownReaction,
  sendReaction,
} from "../reactions";

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

/** A button that opens a row of emojis to react with; the emoji then floats over the own seat or name. */
export function ReactionPicker({ gameId, uid }: { gameId: string; uid: string }) {
  const [open, setOpen] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), REACTION_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  return (
    <div className="reactions" onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      {open && (
        <div className="reaction-choices" role="group" aria-label={t("Reactions")}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              className="reaction-choice"
              disabled={coolingDown}
              onClick={() => {
                setOpen(false);
                setCoolingDown(true);
                // Reactions are a nice extra: a lost one is not worth an error message.
                sendReaction(gameId, uid, emoji).catch(() => {});
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <button
        className="reaction-toggle"
        aria-expanded={open}
        aria-label={t("React")}
        title={t("React")}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">😊</span>
      </button>
    </div>
  );
}
