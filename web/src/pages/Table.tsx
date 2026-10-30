import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "../api";
import { CardView, cardName, SUIT_SYMBOL, suitName } from "../components/CardView";
import { ErrorText, Page } from "../components/Layout";
import { t } from "../i18n";
import {
  activeAutoPlay,
  type AutoPlay,
  botLevel,
  type Card,
  cardKind,
  type GameDoc,
  type HandDoc,
  isMyTurn,
  type LastTrick,
  lastTrickOfRound,
  SUITS,
  leaders,
  sortHand,
  totals,
  trickLeader,
} from "../model";
import {
  type Box,
  DEFAULT_TRICK_LAYOUT,
  fitTrick,
  trickCardLayers,
  trickCardPosition,
  type TrickLayout,
} from "../tableLayout";
import {
  REACTION_COOLDOWN_MS,
  reactionMotion,
  REACTIONS,
  sendReaction,
  type ShownReaction,
  useReactions,
} from "../reactions";
import type { useAction } from "../useAction";
import { nameAt } from "./Home";
import { botLevelName } from "./Lobby";
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
  const mySeat = Math.max(game.playerUids.indexOf(uid), 0);
  const feltRef = useRef<HTMLDivElement>(null);
  const trickLayout = useTrickLayout(feltRef, mySeat, game.players.length);
  const plusOne = useTrickTaken(game);
  const reactions = useReactions(gameId);
  // Auto-play runs out by the clock; a new end time needs the time now, not of the last tick.
  const autoPlayKey = JSON.stringify(game.autoPlay ?? {});
  const now = useNow(autoPlayKey === "{}" ? null : 10_000, autoPlayKey);
  const myAutoPlay = activeAutoPlay(game, uid, now);
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
      <RoundInfo game={game} />
      <div className="table-area">
        <div className={`felt${game.players.length >= 5 ? " felt-crowded" : ""}`} ref={feltRef}>
          <Trick game={game} mySeat={mySeat} layout={trickLayout} />
          <Players
            game={game}
            uid={uid}
            mySeat={mySeat}
            plusOne={plusOne}
            reactions={reactions}
            now={now}
          />
        </div>
        <LookBack game={game} />
        <AutoPlayMenu
          active={myAutoPlay !== null}
          disabled={action.isSending}
          onChoose={(limit) => action.run(() => api.setAutoPlay(gameId, true, limit))}
        />
        <ReactionPicker gameId={gameId} uid={uid} />
      </div>
      <p
        className={`hint trick-hint${game.trick && game.trick.cards.length > 0 ? "" : lastTrickOfRound(game) ? " trick-hint-won" : ""}`}
      >
        {trickHint(game)}
      </p>

      {myAutoPlay && (
        <div className="auto-play-bar" role="status">
          <span>
            <span aria-hidden="true">🤖 </span>
            <strong>{t("Auto-play is on")}</strong> {autoPlayEnd(myAutoPlay, now)}
          </span>
          <button
            className="primary"
            disabled={action.isSending}
            onClick={() => action.run(() => api.setAutoPlay(gameId, false))}
          >
            {t("Take over")}
          </button>
        </div>
      )}

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

/**
 * From the middle of the table towards a seat (y down): the player at the bottom, the others
 * clockwise in playing order (the next player on their left).
 */
function seatDirection(seat: number, mySeat: number, count: number) {
  const angle = (270 - (360 * ((seat - mySeat + count) % count)) / count) * (Math.PI / 180);
  return { x: Math.cos(angle), y: -Math.sin(angle) };
}

/** Where a seat sits at the table, in percent of the felt. `reach` 1 is the rim, 0 the middle. */
function seatPosition(seat: number, mySeat: number, count: number, reach: number) {
  const direction = seatDirection(seat, mySeat, count);
  return { x: 50 + 50 * reach * direction.x, y: 50 + 50 * reach * direction.y };
}

/** The size and place of the trick's cards that keeps all their corners in view on this felt. */
function useTrickLayout(
  feltRef: RefObject<HTMLDivElement | null>,
  mySeat: number,
  count: number,
): TrickLayout {
  const [layout, setLayout] = useState(DEFAULT_TRICK_LAYOUT);
  useEffect(() => {
    const felt = feltRef.current;
    if (!felt) return;
    const seats = [...felt.querySelectorAll(".seat")];
    const measure = () => {
      const origin = felt.getBoundingClientRect();
      const boxes = seats.map((seat): Box => {
        const box = seat.getBoundingClientRect();
        return {
          x: box.left - origin.left - felt.clientLeft,
          y: box.top - origin.top - felt.clientTop,
          width: box.width,
          height: box.height,
        };
      });
      const directions = Array.from({ length: count }, (_, seat) =>
        seatDirection(seat, mySeat, count),
      );
      const next = fitTrick(
        { width: felt.clientWidth, height: felt.clientHeight },
        boxes,
        directions,
      );
      setLayout((current) =>
        current.reachX === next.reachX &&
        current.reachY === next.reachY &&
        current.scale === next.scale
          ? current
          : next,
      );
    };
    // Seats grow with their texts (bids, scores), the felt with the screen.
    const observer = new ResizeObserver(measure);
    observer.observe(felt);
    for (const seat of seats) observer.observe(seat);
    return () => observer.disconnect();
  }, [feltRef, mySeat, count]);
  return layout;
}

/** The seats around the table: name, bot and dealer badges, tricks won of the bid, and score. */
/** The current time, renewed every `intervalMs` (not at all with null) and when `key` changes. */
function useNow(intervalMs: number | null, key: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs === null) return;
    const tick = () => setNow(Date.now());
    // At once as well: the time kept since the last tick may be out of date.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs, key]);
  return now;
}

/** When the player's auto-play ends, for the bar above the banner. */
function autoPlayEnd(auto: AutoPlay, now: number): string {
  if (auto.until) {
    const minutes = Math.max(1, Math.ceil((auto.until.toMillis() - now) / 60_000));
    return t("· {minutes} min left", { minutes });
  }
  if (auto.untilRound !== undefined) {
    return t("· until the end of round {round}", { round: auto.untilRound });
  }
  return t("· until you take over");
}

/** How long the "+1" stays at the seat of a trick's winner. */
const PLUS_ONE_MS = 3000;

/**
 * Identifies a completed trick. The last trick stays in the game when the next round starts, so
 * the key changes only with the next trick.
 */
function trickKey(trick: LastTrick | null): string | null {
  return trick ? `${trick.leaderSeat}:${trick.cards.join()}` : null;
}

/**
 * The seat that just took a trick, for `PLUS_ONE_MS`, also when it already leads the next one.
 * Tricks taken before the page was opened don't count.
 */
function useTrickTaken(game: GameDoc): { seat: number; key: string | null } | null {
  const last = game.lastTrick;
  const key = trickKey(last);
  const [seenKey, setSeenKey] = useState(key);
  const [taker, setTaker] = useState<number | null>(null);
  if (key !== seenKey) {
    setSeenKey(key);
    setTaker(last ? last.winnerSeat : null);
  }
  useEffect(() => {
    if (taker === null) return;
    const timer = setTimeout(() => setTaker(null), PLUS_ONE_MS);
    return () => clearTimeout(timer);
  }, [taker, seenKey]);
  return taker === null ? null : { seat: taker, key: seenKey };
}

/** How long each seat shows its points from the round just scored. */
const ROUND_POINTS_MS = 3500;

/**
 * Everyone's points from the round just scored, for `ROUND_POINTS_MS`. Rounds scored before the
 * page was opened don't count.
 */
function useRoundPoints(game: GameDoc): { deltas: number[]; key: number } | null {
  const rounds = game.results.length;
  const [seenRounds, setSeenRounds] = useState(rounds);
  const [points, setPoints] = useState<{ deltas: number[]; key: number } | null>(null);
  if (rounds !== seenRounds) {
    setSeenRounds(rounds);
    const result = game.results.at(-1);
    setPoints(rounds > seenRounds && result ? { deltas: result.deltas, key: rounds } : null);
  }
  useEffect(() => {
    if (!points) return;
    const timer = setTimeout(() => setPoints(null), ROUND_POINTS_MS);
    return () => clearTimeout(timer);
  }, [points]);
  return points;
}

const COUNT_MS = 900;

/** A score that counts up (or down) to a new value instead of jumping. */
function Score({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    const instant = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const began = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = instant ? 1 : Math.min(1, (now - began) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <strong className="score" aria-label={t("Score: {score}", { score: value })}>
      {shown}
    </strong>
  );
}

function Players({
  game,
  uid,
  mySeat,
  plusOne,
  reactions,
  now,
}: {
  game: GameDoc;
  uid: string;
  mySeat: number;
  plusOne: { seat: number; key: string | null } | null;
  reactions: ReadonlyMap<string, ShownReaction>;
  now: number;
}) {
  const scores = totals(game);
  const roundPoints = useRoundPoints(game);
  const count = Math.max(game.players.length, 1);
  const dealer = t("Dealer");
  // A crown for the highest score, once there is one (not while everyone is level).
  const inTheLead = new Set(leaders(game));
  if (inTheLead.size === count) inTheLead.clear();
  // While the last trick still lies on the table, its winner's seat stands out.
  const trickTaker =
    game.trick && game.trick.cards.length > 0 ? null : (lastTrickOfRound(game)?.winnerSeat ?? null);
  return (
    <ul className="players">
      {game.players.map((player, seat) => {
        const won = game.round?.tricksWon[seat] ?? 0;
        const bid = game.round?.bids[seat] ?? null;
        const isTurn = game.turnSeat === seat;
        const { x, y } = seatPosition(seat, mySeat, count, 1);
        const made = bid !== null && won === bid;
        const reaction = reactions.get(player.uid);
        return (
          <li
            key={player.uid}
            className={`seat${isTurn ? " turn" : ""}${seat === trickTaker ? " took-trick" : ""}${reaction ? " reacting" : ""}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {seat === plusOne?.seat && (
              // Keyed by the trick, so it pops again when the same player takes the next one.
              <span key={plusOne.key} className="trick-taken" aria-hidden="true">
                +1
              </span>
            )}
            {reaction && (
              // Keyed by the reaction, so the same emoji pops again when it is sent twice.
              <span
                key={reaction.key}
                className={`reaction reaction-${reactionMotion(reaction.emoji) ?? "float"}`}
                role="img"
                aria-label={reaction.emoji}
              >
                <span className="reaction-inner">{reaction.emoji}</span>
              </span>
            )}
            <span className="seat-name">
              {isTurn && <span className="visually-hidden">{t("Current turn")}</span>}
              {inTheLead.has(seat) && (
                <span className="crown" title={t("In the lead")}>
                  <span aria-hidden="true">👑</span>
                  <span className="visually-hidden">{t("In the lead")}</span>
                </span>
              )}
              <span className={player.uid === uid ? "me" : undefined}>{nameAt(game, seat)}</span>
              {player.bot && (
                <span
                  className="badge"
                  title={`${t("Bot")} (${botLevelName(botLevel(player.bot))})`}
                >
                  <span aria-hidden="true">🤖</span>
                  <span className="visually-hidden">
                    {`${t("Bot")} (${botLevelName(botLevel(player.bot))})`}
                  </span>
                </span>
              )}
              {!player.bot && activeAutoPlay(game, player.uid, now) && (
                <span className="badge badge-auto" title={t("Auto-play")}>
                  <span aria-hidden="true">🤖</span>
                  <span className="visually-hidden">{t("Auto-play")}</span>
                </span>
              )}
              {game.round?.dealerSeat === seat && (
                <span className="badge badge-dealer" title={dealer}>
                  <span aria-hidden="true">{dealer.charAt(0)}</span>
                  <span className="visually-hidden">{dealer}</span>
                </span>
              )}
            </span>
            <span className="seat-stats">
              {/* Nothing to count before the player has bid. */}
              {bid !== null && (
                <span className={made ? "made" : "hint"}>
                  {t("won {won} of {bid}", { won, bid })}
                </span>
              )}
              <Score value={scores[seat] ?? 0} />
            </span>
            {roundPoints && (
              // Keyed by the round, so it pops again after the next one.
              <span
                key={roundPoints.key}
                className={`round-points ${(roundPoints.deltas[seat] ?? 0) >= 0 ? "round-plus" : "round-minus"}`}
                aria-hidden="true"
              >
                {(roundPoints.deltas[seat] ?? 0) > 0 ? "+" : ""}
                {roundPoints.deltas[seat] ?? 0}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Why there is no trump (yet). */
function noTrumpText(game: GameDoc): string {
  if (game.status === "choosingTrump") return t("Trump: to be chosen");
  const card = game.round?.trumpCard;
  return card ? t("No trump (Jester)") : t("No trump (last round)");
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
          {round.trumpCard && cardKind(round.trumpCard).type === "wizard"
            ? t("Trump: {suit} (chosen by {name})", {
                suit: suitName(round.trumpSuit),
                name: nameAt(game, round.dealerSeat),
              })
            : t("Trump: {suit}", { suit: suitName(round.trumpSuit) })}
        </span>
      ) : (
        <span>{noTrumpText(game)}</span>
      )}
      <span className="spacer" />
      <span className="hint">
        {t("Bids: {total} of {cards}", { total: bidTotal, cards: round.number })}
      </span>
    </div>
  );
}

/** What the middle of the table shows: the current trick, the last one, or nothing yet. */
function trickHint(game: GameDoc): string {
  if (game.trick && game.trick.cards.length > 0) return t("Current trick");
  const lastTrick = lastTrickOfRound(game);
  if (lastTrick) {
    return t("{name} won the last trick", { name: nameAt(game, lastTrick.winnerSeat) });
  }
  return t("No cards played yet");
}

/**
 * The cards of the current trick, or the round's last trick while the next one has not started,
 * each in front of the player who played it. New cards slide in from their player's seat; the
 * winner of the last trick stands out.
 */
/** How long a finished trick takes to slide over to its winner. */
const COLLECT_MS = 600;

/**
 * The finished trick that just left the table (when the next trick or round started), for
 * `COLLECT_MS`, so it can slide over to its winner.
 */
function useCollected(shown: LastTrick | null): LastTrick | null {
  const [seen, setSeen] = useState(shown);
  const [collected, setCollected] = useState<LastTrick | null>(null);
  if (trickKey(shown) !== trickKey(seen)) {
    setSeen(shown);
    if (seen) setCollected(seen);
  }
  useEffect(() => {
    if (!collected) return;
    const timer = setTimeout(() => setCollected(null), COLLECT_MS);
    return () => clearTimeout(timer);
  }, [collected]);
  return collected;
}

function Trick({ game, mySeat, layout }: { game: GameDoc; mySeat: number; layout: TrickLayout }) {
  const lastTrick = lastTrickOfRound(game);
  const current = game.trick && game.trick.cards.length > 0 ? game.trick : null;
  const trick = current ?? lastTrick;
  const collected = useCollected(current ? null : lastTrick);
  // While a trick is played, the card taking it so far stands out a little.
  const leading =
    current && current.cards.length >= 2
      ? trickLeader(current.cards, game.round?.trumpSuit ?? null)
      : null;
  const count = Math.max(game.players.length, 1);
  const layers = trickCardLayers(
    Array.from({ length: count }, (_, seat) => seatDirection(seat, mySeat, count)),
  );
  return (
    <section className="trick" aria-label={t("Current trick")}>
      {collected?.cards.map((card, index) => {
        const seat = (collected.leaderSeat + index) % count;
        const at = trickCardPosition(seatDirection(seat, mySeat, count), layout);
        const to = seatPosition(collected.winnerSeat, mySeat, count, 1);
        const style = {
          left: `${at.x}%`,
          top: `${at.y}%`,
          "--to-x": `${to.x}%`,
          "--to-y": `${to.y}%`,
          "--scale": layout.scale,
          zIndex: layers[seat],
        } as CSSProperties;
        return (
          // Keyed apart from the cards on the table: the next round can deal the same card again.
          <figure
            key={`collected-${card}`}
            className="trick-card trick-collected faded"
            style={style}
            aria-hidden="true"
          >
            <CardView card={card} />
          </figure>
        );
      })}
      {trick?.cards.map((card, index) => {
        const seat = (trick.leaderSeat + index) % count;
        const at = trickCardPosition(seatDirection(seat, mySeat, count), layout);
        const from = seatPosition(seat, mySeat, count, 1);
        const winner = !current && lastTrick?.winnerSeat === seat;
        const style = {
          left: `${at.x}%`,
          top: `${at.y}%`,
          "--from-x": `${from.x}%`,
          "--from-y": `${from.y}%`,
          "--scale": layout.scale,
          zIndex: layers[seat],
        } as CSSProperties;
        return (
          <figure
            key={card}
            className={`trick-card${current ? (index === leading ? " trick-leading" : "") : winner ? " trick-winner" : " faded"}`}
            style={style}
          >
            <CardView card={card} />
            <figcaption className="visually-hidden">
              {index === leading
                ? t("{name}, highest card so far", { name: nameAt(game, seat) })
                : nameAt(game, seat)}
            </figcaption>
          </figure>
        );
      })}
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
    <div
      className="hand"
      aria-label={t("Your cards")}
      role="group"
      style={{ "--count": cards.length } as CSSProperties}
    >
      {cards.map((card, index) => {
        const playable = canPlay && legalCards.has(card);
        // Fanned out: turned and lowered a little more towards the ends.
        const turn = (index - (cards.length - 1) / 2) * Math.min(2.5, 24 / cards.length);
        const style = {
          "--angle": `${turn}deg`,
          "--lower": `${turn * turn * 0.06}px`,
        } as CSSProperties;
        return (
          <button
            key={card}
            className={`hand-card${selected === card ? " selected" : ""}${canPlay && !playable ? " dimmed" : ""}`}
            disabled={!playable}
            aria-pressed={selected === card}
            aria-label={cardName(card)}
            style={style}
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

/** A button that opens a row of emojis to react with; the emoji then floats over the own seat. */
function ReactionPicker({ gameId, uid }: { gameId: string; uid: string }) {
  const [open, setOpen] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), REACTION_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [coolingDown]);

  return (
    <div className="reactions" onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      {open && (
        <div className="reaction-choices" role="group" aria-label={t("Reactions")}>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              className="reaction-choice"
              disabled={coolingDown}
              onClick={() => {
                setOpen(false);
                setCoolingDown(true);
                // Reactions are a nice extra: a lost one is not worth an error message.
                sendReaction(gameId, uid, emoji).catch(() => {});
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <button
        className="reaction-toggle"
        aria-expanded={open}
        aria-label={t("React")}
        title={t("React")}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">😊</span>
      </button>
    </div>
  );
}

/**
 * A button that opens the last completed trick (also the previous round's last one at the start
 * of a round) and how everyone did in the last scored round.
 */
function LookBack({ game }: { game: GameDoc }) {
  const [open, setOpen] = useState(false);
  const trick = game.lastTrick;
  const result = game.results.at(-1);
  const count = Math.max(game.players.length, 1);
  const label = t("Last trick and round");
  return (
    <div className="look-back" onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      {open && (
        <div className="look-back-panel" role="region" aria-label={label}>
          <h3>{t("Last trick")}</h3>
          {trick ? (
            <>
              <ul className="look-back-trick">
                {trick.cards.map((card, index) => {
                  const seat = (trick.leaderSeat + index) % count;
                  return (
                    <li
                      key={card}
                      className={seat === trick.winnerSeat ? "look-back-winner" : undefined}
                    >
                      <CardView card={card} small />
                      <span className="visually-hidden">{cardName(card)}</span>
                      <span>{nameAt(game, seat)}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="hint">
                {t("{name} won the last trick", { name: nameAt(game, trick.winnerSeat) })}
              </p>
            </>
          ) : (
            <p className="hint">{t("No trick played yet")}</p>
          )}
          <h3>{result ? t("Round {round}", { round: result.round }) : t("Last round")}</h3>
          {result ? (
            <table className="look-back-round">
              <thead>
                <tr>
                  <th scope="col">{t("Player")}</th>
                  <th scope="col">{t("Bid")}</th>
                  <th scope="col">{t("Won")}</th>
                  <th scope="col">{t("Points")}</th>
                </tr>
              </thead>
              <tbody>
                {game.players.map((player, seat) => {
                  const points = result.deltas[seat] ?? 0;
                  return (
                    <tr key={player.uid}>
                      <th scope="row">{nameAt(game, seat)}</th>
                      <td>{result.bids[seat] ?? 0}</td>
                      <td>{result.won[seat] ?? 0}</td>
                      <td className={points >= 0 ? "plus" : "minus"}>
                        {points > 0 ? "+" : ""}
                        {points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="hint">{t("No round finished yet")}</p>
          )}
        </div>
      )}
      <button
        className="look-back-toggle"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">🕘</span>
      </button>
    </div>
  );
}

const AUTO_PLAY_MINUTES = [5, 10, 60];
const AUTO_PLAY_ROUNDS = [1, 2, 3, 5];

/** A button that opens the choices for letting a bot play for the player. */
function AutoPlayMenu({
  active,
  disabled,
  onChoose,
}: {
  active: boolean;
  disabled: boolean;
  onChoose(limit: { minutes?: number; rounds?: number }): void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (limit: { minutes?: number; rounds?: number }) => {
    setOpen(false);
    onChoose(limit);
  };
  return (
    <div className="auto-play" onKeyDown={(event) => event.key === "Escape" && setOpen(false)}>
      {open && (
        <div className="auto-play-menu" role="group" aria-label={t("Auto-play")}>
          <p>{t("Let a bot play for you")}</p>
          <button disabled={disabled} onClick={() => choose({})}>
            {t("Until I take over")}
          </button>
          <div className="auto-play-row">
            <span>{t("Minutes")}</span>
            {AUTO_PLAY_MINUTES.map((minutes) => (
              <button
                key={minutes}
                disabled={disabled}
                aria-label={t("{minutes} minutes", { minutes })}
                onClick={() => choose({ minutes })}
              >
                {minutes}
              </button>
            ))}
          </div>
          <div className="auto-play-row">
            <span>{t("Rounds")}</span>
            {AUTO_PLAY_ROUNDS.map((rounds) => (
              <button
                key={rounds}
                disabled={disabled}
                aria-label={t("Rounds: {rounds}", { rounds })}
                onClick={() => choose({ rounds })}
              >
                {rounds}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        className={`auto-play-toggle${active ? " auto-play-on" : ""}`}
        aria-expanded={open}
        aria-label={t("Auto-play")}
        title={t("Auto-play")}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">🤖</span>
      </button>
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
