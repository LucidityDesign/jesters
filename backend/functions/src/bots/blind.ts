import {
  type Card,
  createDeck,
  roundScore,
  SUITS,
  type Suit,
  trickWinner,
} from "../engine/index.js";
import type { BotView } from "./view.js";

// The first round played blind (`blindFirstRound`): each player holds one card, sees everyone
// else's but not their own, and play is forced. So a bot only decides its bid (and, as the dealer
// when a Wizard was turned up, trump), from the chance that its unseen card takes the trick.

/** The chance that the bot's unseen card wins the one trick with `trump` as trump. */
export function blindWinChance(view: BotView, trump: Suit | null): number {
  const seen = new Set<Card>(
    (view.othersCards ?? []).filter((card): card is Card => card !== null),
  );
  if (view.trumpCard !== null) seen.add(view.trumpCard);
  for (const card of view.trick.cards) seen.add(card);
  const unseen = createDeck().filter((card) => !seen.has(card));
  const n = view.playerCount;
  const leader = view.trick.leader;
  let wins = 0;
  for (const mine of unseen) {
    const trick = Array.from({ length: n }, (_, i) => {
      const seat = (leader + i) % n;
      return seat === view.seat ? mine : (view.othersCards?.[seat] ?? view.trick.cards[i]);
    }) as Card[];
    if ((leader + trickWinner(trick, trump)) % n === view.seat) wins++;
  }
  return unseen.length === 0 ? 0 : wins / unseen.length;
}

/** The expected round score of each bid (0 or 1) given the chance `p` of taking the trick. */
function expectedScores(p: number): [number, number] {
  return [
    (1 - p) * roundScore(0, 0) + p * roundScore(0, 1),
    p * roundScore(1, 1) + (1 - p) * roundScore(1, 0),
  ];
}

/** The bid with the better expected score; aggression leans towards bidding the trick. */
export function blindBid(view: BotView): number {
  const p = Math.min(1, Math.max(0, blindWinChance(view, view.trumpSuit) + view.aggression));
  const [zero, one] = expectedScores(p);
  const bid = one > zero ? 1 : 0;
  return bid === view.forbiddenBid ? 1 - bid : bid;
}

/** As the dealer when a Wizard was turned up: the trump suit with the best expected score. */
export function blindTrump(view: BotView): Suit {
  let best: Suit = SUITS[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const suit of SUITS) {
    const score = Math.max(...expectedScores(blindWinChance(view, suit)));
    if (score > bestScore) {
      best = suit;
      bestScore = score;
    }
  }
  return best;
}
