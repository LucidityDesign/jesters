import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorText, Loading, Page } from "../components/Layout";
import { RoundToast } from "../components/RoundToast";
import { useDocument } from "../hooks";
import { t } from "../i18n";
import { type GameDoc, type HandDoc, hasLeft, isRunning } from "../model";
import { Link, navigate } from "../router";
import { useAction } from "../useAction";
import { GameOver } from "./GameOver";
import { Lobby } from "./Lobby";
import { Table } from "./Table";

/** How long the table stays up after the last trick, before the final results. */
export const FINAL_TRICK_MS = 5000;

/**
 * Whether the game just finished while the player watched: then the table, with the last trick
 * on it, stays for `FINAL_TRICK_MS` before the results. A game that was already over when it was
 * opened shows its results at once.
 */
function useJustFinished(game: GameDoc | null | undefined): boolean {
  const status = game?.status;
  const [previous, setPrevious] = useState(status);
  const [holding, setHolding] = useState(false);
  if (status !== previous) {
    setPrevious(status);
    if (status === "finished" && previous !== undefined && isRunning(previous)) setHolding(true);
  }
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => setHolding(false), FINAL_TRICK_MS);
    return () => clearTimeout(timer);
  }, [holding]);
  return holding;
}

/** Shows the lobby, the table or the result, depending on the game's state. */
export function Game({ gameId, uid }: { gameId: string; uid: string }) {
  const game = useDocument<GameDoc>(`games/${gameId}`);
  const hand = useDocument<HandDoc>(`games/${gameId}/hands/${uid}`);
  const action = useAction();
  const justFinished = useJustFinished(game);

  if (game === undefined) {
    return (
      <Page title="">
        <Loading />
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
    // A bot plays on for the leaver while other people are still playing.
    const othersPlay = game.players.some((p) => !p.bot && !p.left && p.uid !== uid);
    const question = !running
      ? t("Leave this game?")
      : othersPlay
        ? t("Leave the game? A bot will play your seat until the end.")
        : t("Leave and end the game for everyone?");
    if (!window.confirm(question)) return;
    if (await action.run(() => api.leaveGame(gameId))) navigate("/");
  };
  const leaveButton = (
    <button className="link danger" onClick={leave} disabled={action.isSending}>
      {t("Leave game")}
    </button>
  );

  return (
    <>
      {page(game)}
      <RoundToast key={gameId} game={game} uid={uid} />
    </>
  );

  function page(game: GameDoc) {
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
        if (hasLeft(game, uid)) {
          return (
            <Page title={t("You left this game")}>
              <p>{t("A bot plays your seat until the end.")}</p>
              <Link to="/">{t("Back to your games")}</Link>
            </Page>
          );
        }
        return (
          <Table gameId={gameId} game={game} hand={hand ?? null} uid={uid} action={action}>
            {leaveButton}
          </Table>
        );
      case "finished":
      case "abandoned":
        if (justFinished && !hasLeft(game, uid)) {
          return (
            <Table gameId={gameId} game={game} hand={hand ?? null} uid={uid} action={action}>
              {leaveButton}
            </Table>
          );
        }
        return (
          <>
            <GameOver gameId={gameId} game={game} uid={uid} action={action} />
            <ErrorText message={action.error} />
          </>
        );
    }
  }
}
