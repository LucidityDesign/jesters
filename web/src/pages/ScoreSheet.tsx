import { Medal } from "../components/Medal";
import { t } from "../i18n";
import { type GameDoc, penaltyOf, places, STALL_PENALTY } from "../model";
import { nameAt } from "./Home";

/** Rounds × players: running total, with bid / tricks won below. 🤖 marks auto-played rounds. */
export function ScoreSheet({ game }: { game: GameDoc }) {
  if (game.results.length === 0) {
    return <p className="hint">{t("Scores appear after the first round.")}</p>;
  }
  const place = places(game);
  const autoPlayed = (uid: string, round: number) =>
    game.autoPlayedRounds?.[uid]?.includes(round) ?? false;
  const anyAutoPlayed = game.results.some((result) =>
    game.players.some((player) => autoPlayed(player.uid, result.round)),
  );
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
