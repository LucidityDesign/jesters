import { useEffect, useState } from "react";
import { t } from "../i18n";
import { type GameDoc, lastRoundSummary, type RoundSummary } from "../model";

const SHOW_FOR_MS = 6000;

/**
 * After each round scored while the game is open: whether the player made their bid and the points
 * they got. Rounds scored before the game was opened are not announced.
 */
export function RoundToast({ game, uid }: { game: GameDoc; uid: string }) {
  const rounds = game.results.length;
  const [seenRounds, setSeenRounds] = useState(rounds);
  const [summary, setSummary] = useState<RoundSummary | null>(null);

  if (rounds !== seenRounds) {
    setSeenRounds(rounds);
    if (rounds > seenRounds) setSummary(lastRoundSummary(game, uid));
  }

  useEffect(() => {
    if (!summary) return;
    const timer = setTimeout(() => setSummary(null), SHOW_FOR_MS);
    return () => clearTimeout(timer);
  }, [summary]);

  return (
    <div className="toast-region" aria-live="polite">
      {summary && (
        <div className={`toast ${summary.bid === summary.won ? "toast-made" : "toast-missed"}`}>
          <div>
            <strong>
              {summary.bid === summary.won ? t("You made your bid!") : t("You missed your bid")}
            </strong>
            <span>
              {t("Round {round}", { round: summary.round })} ·{" "}
              {t("Bid {bid}, won {won}", { bid: summary.bid, won: summary.won })}
            </span>
          </div>
          <strong className={`toast-points ${summary.points >= 0 ? "plus" : "minus"}`}>
            {t("{points} points", { points: `${summary.points > 0 ? "+" : ""}${summary.points}` })}
          </strong>
          <button className="link" onClick={() => setSummary(null)} aria-label={t("Close")}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
