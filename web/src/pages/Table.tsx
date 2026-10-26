import { type ReactNode, useEffect, useState } from "react";
import { api } from "../api";
import { CardView, cardName, SUIT_SYMBOL, suitName } from "../components/CardView";
import { ErrorText, Page } from "../components/Layout";
import { t } from "../i18n";
import { type Card, type GameDoc, type HandDoc, isMyTurn, SUITS, sortHand, totals } from "../model";
import type { useAction } from "../useAction";
import { nameAt } from "./Home";
import { ScoreSheet } from "./ScoreSheet";

/** The game screen: players, trump, the current trick, whose turn it is, and the player's hand. */
export function Table({
  gameId,
  game,
  hand,
  uid,
  action,
  children,
}: {
  gameId: string;
  game: GameDoc;
  hand: HandDoc | null;
  uid: string;
  action: ReturnType<typeof useAction>;
  children: ReactNode;
}) {
  const myTurn = isMyTurn(game, uid);
  const round = game.round;
  const title = round
    ? t("Round {number} of {total}", { number: round.number, total: round.totalRounds })
    : "";

  useEffect(() => {
    if (myTurn) document.title = `● ${t("Your turn")} – Jesters`;
    return () => {
      document.title = "Jesters";
    };
  }, [myTurn]);

  return (
    <Page title={title}>
      <Players game={game} uid={uid} />
      <RoundInfo game={game} />
      <Trick game={game} />

      <p className={`banner${myTurn ? " banner-active" : ""}`} role="status">
        {bannerText(game, myTurn)}
      </p>

      {myTurn && game.status === "bidding" && round && (
        <BidPicker
          maxBid={round.number}
          forbiddenBid={hand?.forbiddenBid ?? null}
          disabled={action.isSending}
          onBid={(bid) => action.run(() => api.placeBid(gameId, game.version, bid))}
        />
      )}
      {myTurn && game.status === "choosingTrump" && (
        <div className="trump-picker">
          {SUITS.map((suit) => (
            <button
              key={suit}
              className={`suit suit-${suit}`}
              onClick={() => action.run(() => api.chooseTrump(gameId, game.version, suit))}
              disabled={action.isSending}
              aria-label={suitName(suit)}
            >
              {SUIT_SYMBOL[suit]}
            </button>
          ))}
        </div>
      )}
      <ErrorText message={action.error} />

      <Hand
        key={game.version}
        cards={sortHand(hand?.cards ?? [])}
        legalCards={new Set(hand?.legalCards ?? [])}
        canPlay={myTurn && game.status === "playing" && !action.isSending}
        onPlay={(card) => action.run(() => api.playCard(gameId, game.version, card))}
      />

      <details className="scores">
        <summary>{t("Scores")}</summary>
        <ScoreSheet game={game} />
      </details>
      <div className="actions">{children}</div>
    </Page>
  );
}

function bannerText(game: GameDoc, myTurn: boolean): string {
  const name = game.turnSeat === null ? "?" : nameAt(game, game.turnSeat);
  switch (game.status) {
    case "choosingTrump":
      return myTurn
        ? t("A Wizard was turned up. Choose trump.")
        : t("Waiting for {name} to choose trump", { name });
    case "bidding":
      return myTurn
        ? t("How many tricks will you take?")
        : t("Waiting for {name} to bid", { name });
    case "playing":
      return myTurn
        ? t("Your turn: click a card, then click it again to play")
        : t("Waiting for {name} to play", { name });
    default:
      return "";
  }
}

/** One row per player: turn marker, name, dealer badge, bid, tricks won and total score. */
function Players({ game, uid }: { game: GameDoc; uid: string }) {
  const scores = totals(game);
  return (
    <ul className="players">
      {game.players.map((player, seat) => {
        const won = game.round?.tricksWon[seat] ?? 0;
        const bid = game.round?.bids[seat] ?? null;
        const isTurn = game.turnSeat === seat;
        return (
          <li key={player.uid} className={isTurn ? "turn" : undefined}>
            <span className="marker" aria-hidden="true">
              {isTurn ? "●" : "○"}
            </span>
            <span className={player.uid === uid ? "me" : undefined}>{nameAt(game, seat)}</span>
            {isTurn && <span className="visually-hidden">{t("Current turn")}</span>}
            {player.bot && <span className="badge">{t("Bot")}</span>}
            {game.round?.dealerSeat === seat && <span className="badge">{t("Dealer")}</span>}
            <span className="spacer" />
            <span className="hint">
              {bid === null ? t("won {won}", { won }) : t("won {won} of {bid}", { won, bid })}
            </span>
            <strong
              className="score"
              aria-label={t("Score: {score}", { score: scores[seat] ?? 0 })}
            >
              {scores[seat] ?? 0}
            </strong>
          </li>
        );
      })}
    </ul>
  );
}

/** Trump and the total of the bids so far. */
function RoundInfo({ game }: { game: GameDoc }) {
  const round = game.round;
  if (!round) return null;
  const bidTotal = round.bids.reduce<number>((sum, bid) => sum + (bid ?? 0), 0);
  return (
    <div className="round-info">
      {round.trumpCard && <CardView card={round.trumpCard} small />}
      {round.trumpSuit ? (
        <span>
          <span className={`suit-${round.trumpSuit}`} aria-hidden="true">
            {SUIT_SYMBOL[round.trumpSuit]}{" "}
          </span>
          {t("Trump: {suit}", { suit: suitName(round.trumpSuit) })}
        </span>
      ) : (
        <span>{game.status === "choosingTrump" ? t("Trump: to be chosen") : t("No trump")}</span>
      )}
      <span className="spacer" />
      <span className="hint">
        {t("Bids: {total} of {cards}", { total: bidTotal, cards: round.number })}
      </span>
    </div>
  );
}

/** The cards of the current trick, or the last trick while the next one has not started. */
function Trick({ game }: { game: GameDoc }) {
  const count = Math.max(game.players.length, 1);
  const cards = (trick: { leaderSeat: number; cards: Card[] }) => (
    <div className="trick-cards">
      {trick.cards.map((card, index) => (
        <figure key={card}>
          <CardView card={card} />
          <figcaption>{nameAt(game, (trick.leaderSeat + index) % count)}</figcaption>
        </figure>
      ))}
    </div>
  );

  return (
    <section className="trick" aria-label={t("Current trick")}>
      {game.trick && game.trick.cards.length > 0 ? (
        <>
          {cards(game.trick)}
          <p className="hint">{t("Current trick")}</p>
        </>
      ) : game.lastTrick ? (
        <>
          <div className="faded">{cards(game.lastTrick)}</div>
          <p className="hint">
            {t("{name} won the last trick", { name: nameAt(game, game.lastTrick.winnerSeat) })}
          </p>
        </>
      ) : (
        <p className="hint">{t("No cards played yet")}</p>
      )}
    </section>
  );
}

/** The player's cards. Click to select, click again to play. */
function Hand({
  cards,
  legalCards,
  canPlay,
  onPlay,
}: {
  cards: Card[];
  legalCards: Set<Card>;
  canPlay: boolean;
  onPlay(card: Card): void;
}) {
  // Reset by the parent (`key`) whenever the game changes.
  const [selected, setSelected] = useState<Card | null>(null);
  return (
    <div className="hand" aria-label={t("Your cards")} role="group">
      {cards.map((card) => {
        const playable = canPlay && legalCards.has(card);
        return (
          <button
            key={card}
            className={`hand-card${selected === card ? " selected" : ""}${canPlay && !playable ? " dimmed" : ""}`}
            disabled={!playable}
            aria-pressed={selected === card}
            aria-label={cardName(card)}
            onClick={() => {
              if (selected === card) onPlay(card);
              else setSelected(card);
            }}
          >
            <CardView card={card} />
          </button>
        );
      })}
    </div>
  );
}

function BidPicker({
  maxBid,
  forbiddenBid,
  disabled,
  onBid,
}: {
  maxBid: number;
  forbiddenBid: number | null;
  disabled: boolean;
  onBid(bid: number): void;
}) {
  return (
    <div className="bid-picker">
      <div className="bids">
        {Array.from({ length: maxBid + 1 }, (_, bid) => (
          <button
            key={bid}
            className="primary"
            disabled={disabled || bid === forbiddenBid}
            onClick={() => onBid(bid)}
          >
            {bid}
          </button>
        ))}
      </div>
      {forbiddenBid !== null && (
        <p className="hint">
          {t("You can't bid {bid}: the total of all bids must not equal the number of cards.", {
            bid: forbiddenBid,
          })}
        </p>
      )}
    </div>
  );
}
