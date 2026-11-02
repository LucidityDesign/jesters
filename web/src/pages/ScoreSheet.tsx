import { Medal } from "../components/Medal";
import { t } from "../i18n";
import {
  activeAutoPlay,
  type GameDoc,
  hasLeft,
  penaltyOf,
  places,
  STALL_PENALTY,
  totals,
} from "../model";
import { nameAt } from "./Home";

/**
 * Rounds × players: running total, with bid / tricks won below; the round in progress last, with
 * the bids and tricks so far. 🤖 marks rounds a bot played (in part) for the person.
 */
export function ScoreSheet({ game }: { game: GameDoc }) {
  // Only shown while open, so the time it was rendered is close enough.
  const now = Date.now();
  const current =
    game.active && !game.results.some((r) => r.round === game.round?.number) ? game.round : null;
  if (game.results.length === 0 && !current) {
    return <p className="hint">{t("Scores appear after the first round.")}</p>;
  }
  const place = places(game);
  const autoPlayed = (uid: string, round: number) =>
    (game.autoPlayedRounds?.[uid]?.includes(round) ?? false) ||
    // In the round in progress, also whoever a bot plays for right now.
    (round === current?.number && (hasLeft(game, uid) || activeAutoPlay(game, uid, now) !== null));
  const rounds = [
    ...game.results.map((result) => result.round),
    ...(current ? [current.number] : []),
  ];
  const anyAutoPlayed = rounds.some((round) =>
    game.players.some((player) => autoPlayed(player.uid, round)),
  );
  const running = totals(game);
  const anyPenalty = game.players.some((player) => penaltyOf(game, player.uid) > 0);
  return (
    <div className="score-sheet">
      <table>
        <thead>
          <tr>
            <th scope="col">{t("Round")}</th>
            {game.players.map((player, seat) => (
              <th scope="col" key={player.uid}>
                <Medal place={place[seat] ?? null} />
                {nameAt(game, seat)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {game.results.map((result) => (
            <tr key={result.round}>
              <th scope="row">{result.round}</th>
              {game.players.map((player, seat) => {
                const bid = result.bids[seat] ?? 0;
                const won = result.won[seat] ?? 0;
                const penalty = penaltyOf(game, player.uid, result.round);
                return (
                  <td key={player.uid}>
                    {autoPlayed(player.uid, result.round) && (
                      <span className="auto-played" title={t("Played by auto-play")}>
                        <span aria-hidden="true">🤖</span>
                        <span className="visually-hidden">{t("Played by auto-play")}</span>
                      </span>
                    )}
                    {penalty > 0 && (
                      <span
                        className="auto-played"
                        title={t("−{points} for stalling", { points: penalty })}
                      >
                        <span aria-hidden="true">⏳</span>
                        <span className="visually-hidden">
                          {t("−{points} for stalling", { points: penalty })}
                        </span>
                      </span>
                    )}
                    {(result.totals[seat] ?? 0) - penaltyOf(game, player.uid, result.round, true)}
                    <small
                      className={(result.deltas[seat] ?? 0) > 0 ? "plus" : "minus"}
                      aria-label={t("Bid {bid}, won {won}", { bid, won })}
                    >
                      {bid}/{won}
                    </small>
                  </td>
                );
              })}
            </tr>
          ))}
          {current && (
            <tr className="current-round">
              <th scope="row" title={t("Round in progress")}>
                {current.number}
                <span className="visually-hidden">{` (${t("Round in progress")})`}</span>
              </th>
              {game.players.map((player, seat) => {
                const bid = current.bids[seat] ?? null;
                const won = current.tricksWon[seat] ?? 0;
                return (
                  <td key={player.uid}>
                    {autoPlayed(player.uid, current.number) && (
                      <span className="auto-played" title={t("Played by auto-play")}>
                        <span aria-hidden="true">🤖</span>
                        <span className="visually-hidden">{t("Played by auto-play")}</span>
                      </span>
                    )}
                    {running[seat] ?? 0}
                    <small
                      aria-label={
                        bid === null ? t("No bid yet") : t("Bid {bid}, won {won}", { bid, won })
                      }
                    >
                      {bid ?? "–"}/{won}
                    </small>
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
      <p className="hint">
        {t("Small numbers: bid / tricks won")}
        {anyAutoPlayed && ` · 🤖 ${t("Played by auto-play")}`}
        {anyPenalty &&
          ` · ⏳ ${t("−{points} points for each move a bot made after stalling", { points: STALL_PENALTY })}`}
      </p>
    </div>
  );
}
