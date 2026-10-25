import { Page } from "../components/Layout";
import { formatList, t } from "../i18n";
import { type GameDoc, leaders, totals } from "../model";
import { Link } from "../router";
import { nameAt } from "./Home";
import { ScoreSheet } from "./ScoreSheet";

export function GameOver({ game, uid }: { game: GameDoc; uid: string }) {
  const scores = totals(game);
  const standings = scores
    .map((total, seat) => ({ seat, total }))
    .sort((a, b) => b.total - a.total);
  const leaverSeat = game.playerUids.indexOf(game.abandonedBy ?? "");

  return (
    <Page title={game.status === "abandoned" ? t("Game ended") : t("Game over")}>
      <p className="result">
        {game.expired
          ? t("This game was closed after 14 days without a move.")
          : game.status === "abandoned"
            ? t("{name} left, so the game ended early.", { name: nameAt(game, leaverSeat) })
            : t("Winner: {names}", {
                names: formatList(leaders(game).map((seat) => nameAt(game, seat))),
              })}
      </p>

      <section>
        <h2>{t("Standings")}</h2>
        <ol className="list">
          {standings.map(({ seat, total }) => (
            <li key={seat} className="row row-inline">
              <span className={game.playerUids[seat] === uid ? "me" : undefined}>
                {nameAt(game, seat)}
              </span>
              <strong className="score">{total}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>{t("Score sheet")}</h2>
        <ScoreSheet game={game} />
      </section>
      <Link to="/">{t("Back to your games")}</Link>
    </Page>
  );
}
