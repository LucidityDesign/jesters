import {
  type Card,
  type CompletedTrick,
  forbiddenBid,
  type GameState,
  isBlindRound,
  legalCardsFor,
  type Phase,
  type RoundResult,
  type Suit,
  type Trick,
} from "../engine/index.js";

/**
 * What a bot may know when it decides: its own hand and everything on the table, never the
 * other players' hands or the deck (except in a blind round, where it is the other way round).
 * Strategies only ever see this, so they can't cheat.
 */
export interface BotView {
  seat: number;
  playerCount: number;
  phase: Exclude<Phase, "finished">;
  round: number;
  dealer: number;
  /** Empty in a blind round (`blind`). */
  hand: Card[];
  /** Whether this round is played blind: the bot sees the others' cards, not its own. */
  blind?: boolean;
  /** In a blind round, the others' cards still in hand by seat (null for its own); else empty. */
  othersCards?: (Card | null)[];
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  bids: (number | null)[];
  tricksWon: number[];
  trick: Trick;
  /** The tricks completed in this round so far (may miss early ones in games from older versions). */
  roundTricks: CompletedTrick[];
  /** Whether the "no even bids" rule is on. */
  noEvenBids: boolean;
  /** Cards this bot may play now (only while playing). */
  legalCards: Card[];
  /** The bid this bot may not make now ("no even bids"), or `null`. */
  forbiddenBid: number | null;
  results: RoundResult[];
  /** This bot's temperament, -0.1 (cautious) to 0.1 (aggressive); see `Player.aggression`. */
  aggression: number;
}

/** The view of the bot whose turn it is. Throws if the game is finished. */
export function viewFor(state: GameState, aggression = 0): BotView {
  const seat = state.turn;
  if (seat === null || state.phase === "finished") throw new Error("viewFor: game is finished");
  const blind = isBlindRound(state);
  return {
    seat,
    playerCount: state.playerCount,
    phase: state.phase,
    round: state.round,
    dealer: state.dealer,
    hand: blind ? [] : (state.hands[seat] ?? []),
    blind,
    othersCards: blind ? state.hands.map((hand, s) => (s === seat ? null : (hand[0] ?? null))) : [],
    trumpCard: state.trumpCard,
    trumpSuit: state.trumpSuit,
    bids: state.bids,
    tricksWon: state.tricksWon,
    trick: state.trick,
    roundTricks: state.roundTricks,
    noEvenBids: state.settings.noEvenBids,
    legalCards: blind ? [] : legalCardsFor(state, seat),
    forbiddenBid: forbiddenBid(state, seat),
    results: state.results,
    aggression,
  };
}
