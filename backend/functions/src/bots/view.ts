import {
  type Card,
  type CompletedTrick,
  forbiddenBid,
  type GameState,
  legalCardsFor,
  type Phase,
  type RoundResult,
  type Suit,
  type Trick,
} from "../engine/index.js";

/**
 * What a bot may know when it decides: its own hand and everything on the table, never the
 * other players' hands or the deck. Strategies only ever see this, so they can't cheat.
 */
export interface BotView {
  seat: number;
  playerCount: number;
  phase: Exclude<Phase, "finished">;
  round: number;
  dealer: number;
  hand: Card[];
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
  return {
    seat,
    playerCount: state.playerCount,
    phase: state.phase,
    round: state.round,
    dealer: state.dealer,
    hand: state.hands[seat] ?? [],
    trumpCard: state.trumpCard,
    trumpSuit: state.trumpSuit,
    bids: state.bids,
    tricksWon: state.tricksWon,
    trick: state.trick,
    roundTricks: state.roundTricks,
    noEvenBids: state.settings.noEvenBids,
    legalCards: legalCardsFor(state, seat),
    forbiddenBid: forbiddenBid(state, seat),
    results: state.results,
    aggression,
  };
}
