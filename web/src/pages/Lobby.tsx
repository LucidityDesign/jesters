import { type ReactNode, useState } from "react";
import { api } from "../api";
import { ErrorText, Page } from "../components/Layout";
import { t } from "../i18n";
import {
  BOT_LEVELS,
  botLevel,
  type BotLevel,
  MIN_PLAYERS,
  MAX_PLAYERS,
  type GameDoc,
} from "../model";
import { load, save } from "../storage";
import type { useAction } from "../useAction";
import { nameAt } from "./Home";

const BOT_LEVEL_KEY = "botLevel";

/** The name of a bot level, as shown to people. */
export function botLevelName(level: BotLevel): string {
  switch (level) {
    case "easy":
      return t("Easy");
    case "medium":
      return t("Medium");
    case "hard":
      return t("Hard");
  }
}

export function Lobby({
  gameId,
  game,
  uid,
  action,
  children,
}: {
  gameId: string;
  game: GameDoc;
  uid: string;
  action: ReturnType<typeof useAction>;
  children: ReactNode;
}) {
  const isHost = game.hostUid === uid;
  const canStart = game.players.length >= MIN_PLAYERS && !action.isSending;
  const [copied, setCopied] = useState(false);
  const [level, setLevel] = useState<BotLevel>(() => botLevel(load(BOT_LEVEL_KEY) ?? "medium"));
  const inviteLink = `${location.origin}/join/${game.roomKey}`;

  async function invite() {
    const text = t("Join my Jesters game with the room key {key}", { key: game.roomKey });
    if (navigator.share) {
      await navigator.share({ text, url: inviteLink }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    }
  }

  return (
    <Page title={t("Lobby")}>
      <section className="room-key">
        <span className="hint">{t("Room key")}</span>
        <strong aria-label={game.roomKey.split("").join(" ")}>{game.roomKey}</strong>
        <button onClick={invite}>{copied ? t("Link copied") : t("Invite players")}</button>
      </section>

      <section>
        <h2>{t("Players ({count} of {max})", { count: game.players.length, max: MAX_PLAYERS })}</h2>
        <ul className="list">
          {game.players.map((player, seat) => (
            <li key={player.uid} className="row row-inline">
              <span>{nameAt(game, seat)}</span>
              <span className="hint">
                {[
                  player.uid === game.hostUid && t("Host"),
                  player.uid === uid && t("You"),
                  player.bot && `${t("Bot")} (${botLevelName(botLevel(player.bot))})`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {isHost && player.uid !== uid && (
                <button
                  className="link danger"
                  onClick={() => action.run(() => api.removePlayer(gameId, player.uid))}
                  disabled={action.isSending}
                  aria-label={`${t("Remove")}: ${nameAt(game, seat)}`}
                >
                  {t("Remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost && game.players.length < MAX_PLAYERS && (
          <div className="actions">
            <fieldset className="segmented">
              <legend className="visually-hidden">{t("Bot level")}</legend>
              {BOT_LEVELS.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="bot-level"
                    value={option}
                    checked={level === option}
                    onChange={() => {
                      setLevel(option);
                      save(BOT_LEVEL_KEY, option);
                    }}
                  />
                  <span>{botLevelName(option)}</span>
                </label>
              ))}
            </fieldset>
            <button
              onClick={() => action.run(() => api.addBot(gameId, level))}
              disabled={action.isSending}
            >
              {t("Add bot")}
            </button>
          </div>
        )}
        <p className="hint">
          {!isHost
            ? t("Waiting for the host to start the game.")
            : game.players.length < MIN_PLAYERS
              ? t("At least 3 players are needed. Invite friends or add bots.")
              : game.players.some((player) => player.bot)
                ? t("Easy bots play by simple rules; Medium and Hard ones think ahead.")
                : null}
        </p>
      </section>

      <section>
        <label className="toggle">
          <input
            type="checkbox"
            checked={game.settings.noEvenBids}
            disabled={!isHost || action.isSending}
            onChange={(event) => action.run(() => api.updateSettings(gameId, event.target.checked))}
          />
          <span>{t("No even bids")}</span>
        </label>
        <p className="hint">
          {t(
            "With this rule, the dealer may not bid so that the total of all bids equals the number of cards.",
          )}
        </p>
      </section>

      {isHost && (
        <button
          className="primary"
          onClick={() => action.run(() => api.startGame(gameId))}
          disabled={!canStart}
        >
          {t("Start game")}
        </button>
      )}
      <ErrorText message={action.error} />
      <div className="actions">{children}</div>
    </Page>
  );
}
