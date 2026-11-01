import { api } from "../api";
import { Page } from "../components/Layout";
import { Medal } from "../components/Medal";
import { formatList, t } from "../i18n";
import { type GameDoc, leaders, places, totals } from "../model";
import { Link, navigate } from "../router";
import type { useAction } from "../useAction";
import { nameAt } from "./Home";
import { ScoreSheet } from "./ScoreSheet";

export function GameOver({
  gameId,
  game,
  uid,
  action,
}: {
  gameId: string;
  game: GameDoc;
  uid: string;
  action: ReturnType<typeof useAction>;
}) {
  const scores = totals(game);
  const place = places(game);
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

      {!game.expired && <PlayAgain gameId={gameId} game={game} uid={uid} action={action} />}

      <section>
        <h2>{t("Standings")}</h2>
        <ol className="list">
          {standings.map(({ seat, total }) => (
            <li key={seat} className="row row-inline">
              <span className="standing-name">
                <Medal place={place[seat] ?? null} />
                <span className={game.playerUids[seat] === uid ? "me" : undefined}>
                  {nameAt(game, seat)}
                </span>
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

/**
 * Asks whether to play again. The first to accept opens a new lobby with the same rules and bots;
 * the others are asked to join it.
 */
function PlayAgain({
  gameId,
  game,
  uid,
  action,
}: {
  gameId: string;
  game: GameDoc;
  uid: string;
  action: ReturnType<typeof useAction>;
}) {
  const rematch = game.rematch;
  const joined = rematch?.uids.includes(uid) ?? false;
  const host = rematch ? nameAt(game, game.playerUids.indexOf(rematch.hostUid)) : "";

  async function playAgain() {
    let next: string | undefined;
    const ok = await action.run(async () => {
      next = (await api.playAgain(gameId)).gameId;
    });
    if (ok && next) navigate(`/game/${next}`);
  }

  return (
    <section className="play-again">
      <p>
        {!rematch
          ? t("Play again with the same players?")
          : joined
            ? t("You are in the new game.")
            : t("{name} wants to play again.", { name: host })}
      </p>
      <button className="primary" onClick={playAgain} disabled={action.isSending}>
        {!rematch ? t("Play again") : joined ? t("Go to the new game") : t("Join the new game")}
      </button>
    </section>
  );
}
