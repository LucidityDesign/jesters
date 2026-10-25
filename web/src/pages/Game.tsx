import { api } from "../api";
import { ErrorText, Page } from "../components/Layout";
import { useDocument } from "../hooks";
import { t } from "../i18n";
import type { GameDoc, HandDoc } from "../model";
import { Link, navigate } from "../router";
import { useAction } from "../useAction";
import { GameOver } from "./GameOver";
import { Lobby } from "./Lobby";
import { Table } from "./Table";

/** Shows the lobby, the table or the result, depending on the game's state. */
export function Game({ gameId, uid }: { gameId: string; uid: string }) {
  const game = useDocument<GameDoc>(`games/${gameId}`);
  const hand = useDocument<HandDoc>(`games/${gameId}/hands/${uid}`);
  const action = useAction();

  if (game === undefined) {
    return (
      <Page title="">
        <p className="hint">{t("Loading…")}</p>
      </Page>
    );
  }
  if (game === null || !game.playerUids.includes(uid)) {
    return (
      <Page title={t("Game not available")}>
        <p>{t("This game was deleted or you are no longer part of it.")}</p>
        <Link to="/">{t("Back to your games")}</Link>
      </Page>
    );
  }

  const leave = async () => {
    const running = game.status !== "lobby";
    const question = running ? t("Leave and end the game for everyone?") : t("Leave this game?");
    if (!window.confirm(question)) return;
    if (await action.run(() => api.leaveGame(gameId))) navigate("/");
  };
  const leaveButton = (
    <button className="link danger" onClick={leave} disabled={action.isSending}>
      {t("Leave game")}
    </button>
  );

  switch (game.status) {
    case "lobby":
      return (
        <Lobby gameId={gameId} game={game} uid={uid} action={action}>
          {leaveButton}
        </Lobby>
      );
    case "choosingTrump":
    case "bidding":
    case "playing":
      return (
        <Table gameId={gameId} game={game} hand={hand ?? null} uid={uid} action={action}>
          {leaveButton}
        </Table>
      );
    case "finished":
    case "abandoned":
      return (
        <>
          <GameOver game={game} uid={uid} />
          <ErrorText message={action.error} />
        </>
      );
  }
}
