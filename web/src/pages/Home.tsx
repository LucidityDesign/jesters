import { useState } from "react";
import { api } from "../api";
import { ErrorText, Page } from "../components/Layout";
import { NotificationOffer } from "../components/Notifications";
import { type GameEntry, useMyGames } from "../hooks";
import { formatList, t } from "../i18n";
import { type GameDoc, isMyTurn, leaders } from "../model";
import { Link, navigate } from "../router";
import { useSession } from "../session";
import { useAction } from "../useAction";

export function Home({ uid }: { uid: string }) {
  const { displayName } = useSession();
  const games = useMyGames(uid);
  const create = useAction();

  async function createRoom() {
    let gameId = "";
    const created = await create.run(async () => {
      gameId = (await api.createRoom(displayName)).gameId;
    });
    if (created) navigate(`/game/${gameId}`);
  }

  const myTurn = games?.filter(({ game }) => isMyTurn(game, uid)) ?? [];
  const others = games?.filter(({ game }) => game.active && !isMyTurn(game, uid)) ?? [];
  const finished = games?.filter(({ game }) => !game.active) ?? [];

  return (
    <Page title="Jesters">
      <div className="actions">
        <button className="primary" onClick={createRoom} disabled={create.isSending}>
          {t("New game")}
        </button>
        <Link to="/join" className="button">
          {t("Join with key")}
        </Link>
      </div>
      <ErrorText message={create.error} />
      <NotificationOffer uid={uid} />

      <GameList title={t("Your turn")} games={myTurn} uid={uid} />
      <GameList title={t("Other games")} games={others} uid={uid} />
      <GameList title={t("Finished")} games={finished} uid={uid} />

      {games === null && <p className="hint">{t("Could not load your games.")}</p>}
      {games?.length === 0 && (
        <p className="hint">
          {t("No games yet. Start a new game and invite your friends with the room key.")}
        </p>
      )}
    </Page>
  );
}

function GameList({ title, games, uid }: { title: string; games: GameEntry[]; uid: string }) {
  const [showAll, setShowAll] = useState(false);
  if (games.length === 0) return null;
  return (
    <section>
      <h2>{title}</h2>
      <ul className="list">
        {(showAll ? games : games.slice(0, 10)).map(({ id, game }) => (
          <li key={id}>
            <Link to={`/game/${id}`} className="row">
              <strong>{formatList(game.players.map((player) => player.name))}</strong>
              <span className={isMyTurn(game, uid) ? "accent" : "hint"}>
                {statusText(game, uid)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {games.length > 10 && !showAll && (
        <button className="link" onClick={() => setShowAll(true)}>
          {t("Show all")}
        </button>
      )}
    </section>
  );
}

function statusText(game: GameDoc, uid: string): string {
  const round = game.round?.number ?? 0;
  switch (game.status) {
    case "lobby":
      return t("In the lobby · key {key}", { key: game.roomKey });
    case "choosingTrump":
    case "bidding":
    case "playing": {
      if (isMyTurn(game, uid)) return t("Your turn · round {round}", { round });
      const name = game.turnSeat === null ? "?" : nameAt(game, game.turnSeat);
      return t("Waiting for {name} · round {round}", { name, round });
    }
    case "finished":
      return t("Finished · winner: {names}", {
        names: formatList(leaders(game).map((seat) => nameAt(game, seat))),
      });
    case "abandoned":
      return t("Ended early");
  }
}

/** The name at a seat; players who deleted their data are shown as "Former player". */
export function nameAt(game: GameDoc, seat: number): string {
  const player = game.players[seat];
  if (!player) return "?";
  return player.name || t("Former player");
}
