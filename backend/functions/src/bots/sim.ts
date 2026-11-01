import {
  type Card,
  createDeck,
  legalCards,
  type RandomInt,
  rankOf,
  roundScore,
  type Suit,
  suitOf,
} from "../engine/index.js";

// A fast, mutable model of the rest of one round, for the search bots' rollouts. The engine's
// `reduce` copies the whole game on every move and deals the next round when one ends; a rollout
// needs neither, and plays thousands of cards per decision.

/** The rest of a round with every hand known (one guess at the hidden cards). Mutated in place. */
export interface RoundSim {
  playerCount: number;
  trump: Suit | null;
  /** By seat; the cards each player still holds. */
  hands: Card[][];
  bids: number[];
  tricksWon: number[];
  /** The current trick, in play order. */
  trick: Card[];
  leader: number;
  /** Tricks still to be completed, including the current one. */
  tricksLeft: number;
}

interface CardInfo {
  wizard: boolean;
  jester: boolean;
  suit: Suit | null;
  rank: number;
}

const INFO = new Map<Card, CardInfo>(
  createDeck().map((card) => [
    card,
    {
      wizard: card[0] === "W",
      jester: card[0] === "J",
      suit: suitOf(card),
      rank: rankOf(card) ?? 0,
    },
  ]),
);

function info(card: Card): CardInfo {
  return INFO.get(card) as CardInfo;
}

/** Same as the engine's `trickWinner`, without allocations: the index of the winning card. */
export function winnerIndex(cards: readonly Card[], trump: Suit | null): number {
  let led: Suit | null = null;
  let best = -1;
  let bestTrump = false;
  let bestRank = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = info(cards[i] as Card);
    if (card.wizard) return i;
    if (card.jester) continue;
    led ??= card.suit;
    const isTrump = card.suit === trump;
    if (
      isTrump
        ? !bestTrump || card.rank > bestRank
        : !bestTrump && card.suit === led && card.rank > bestRank
    ) {
      best = i;
      bestTrump = isTrump;
      bestRank = card.rank;
    }
  }
  return best === -1 ? 0 : best;
}

/** How strong `card` is in general: Jesters lowest, then plain cards, trumps, Wizards. */
export function strength(card: Card, trump: Suit | null): number {
  const c = info(card);
  if (c.wizard) return 100;
  if (c.jester) return 0;
  return c.suit === trump ? 50 + c.rank : c.rank;
}

/** Whether `card` would take the lead in `trick` if played now. */
export function winsNow(trick: readonly Card[], card: Card, trump: Suit | null): boolean {
  return winnerIndex([...trick, card], trump) === trick.length;
}

/**
 * A card that wins whenever it is wanted: a Wizard, or the trump ace (only Wizards beat it).
 * The search bots hold these back until they need them.
 */
export function isSureWinner(card: Card, trump: Suit | null): boolean {
  const c = info(card);
  return c.wizard || (c.suit !== null && c.suit === trump && c.rank === 14);
}

/** The seat whose turn it is. */
export function turnOf(sim: RoundSim): number {
  return (sim.leader + sim.trick.length) % sim.playerCount;
}

/** Plays `card` for the seat whose turn it is; completes the trick when everyone has played. */
export function playCard(sim: RoundSim, card: Card): void {
  const seat = turnOf(sim);
  const hand = sim.hands[seat] as Card[];
  hand.splice(hand.indexOf(card), 1);
  sim.trick.push(card);
  if (sim.trick.length < sim.playerCount) return;
  const winner = (sim.leader + winnerIndex(sim.trick, sim.trump)) % sim.playerCount;
  sim.tricksWon[winner] = (sim.tricksWon[winner] as number) + 1;
  sim.trick = [];
  sim.leader = winner;
  sim.tricksLeft--;
}

/** Plays the round to its end with the rollout policy for everyone. */
export function playOut(sim: RoundSim): void {
  while (sim.tricksLeft > 0) playCard(sim, rolloutCard(sim));
}

/** A copy that can be played out without touching `sim`. */
export function cloneSim(sim: RoundSim): RoundSim {
  return {
    ...sim,
    hands: sim.hands.map((hand) => [...hand]),
    bids: [...sim.bids],
    tricksWon: [...sim.tricksWon],
    trick: [...sim.trick],
  };
}

/** `seat`'s points for the round once it has been played out. */
export function scoreOf(sim: RoundSim, seat: number): number {
  return roundScore(sim.bids[seat] as number, sim.tricksWon[seat] as number);
}

// The rollout policy: every simulated player plays towards their own bid. A random policy would
// make the search undervalue ducking, because it couldn't see the worth of saving strong cards.

const byStrength = (trump: Suit | null) => (a: Card, b: Card) =>
  strength(a, trump) - strength(b, trump);

/** The card the seat to move plays in a rollout, given only its own hand and the table. */
export function rolloutCard(sim: RoundSim): Card {
  const seat = turnOf(sim);
  const hand = sim.hands[seat] as Card[];
  const legal = legalCards(hand, sim.trick).sort(byStrength(sim.trump));
  if (legal.length === 1) return legal[0] as Card;
  const needed = (sim.bids[seat] as number) - (sim.tricksWon[seat] as number);
  if (needed <= 0) return duck(sim, legal, false);
  if (needed >= sim.tricksLeft) return winEvery(sim, legal);
  // With as many sure winners as tricks still needed, lose everything else and play them later.
  const sure = hand.filter((card) => isSureWinner(card, sim.trump)).length;
  if (sure >= needed) return duck(sim, legal, true);
  return winIfCheap(sim, legal);
}

/**
 * Loses the trick if it can, dumping the strongest card that can't win (liabilities first).
 * `keepSure` holds back sure winners, which are still needed later. `legal` is sorted weakest first.
 */
function duck(sim: RoundSim, legal: Card[], keepSure: boolean): Card {
  const kept = (card: Card) => keepSure && isSureWinner(card, sim.trump);
  const jester = legal.find((card) => info(card).jester);
  if (sim.trick.length === 0) {
    // Whether a lead loses depends on the cards still to come: lead low, ideally a side suit.
    const side = legal.filter((card) => {
      const c = info(card);
      return c.suit !== null && c.suit !== sim.trump;
    });
    const low = side[0];
    if (low && info(low).rank <= 9) return low;
    if (jester) return jester;
    return legal.find((card) => !kept(card)) ?? (legal[0] as Card);
  }
  // A card that doesn't take the lead now can't win this trick any more.
  const safe = legal.filter(
    (card) => !info(card).jester && !kept(card) && !winsNow(sim.trick, card, sim.trump),
  );
  const highestSafe = safe.at(-1);
  if (highestSafe) return highestSafe;
  // No safe duck: a Jester is a sure loser; otherwise the weakest card.
  return jester ?? legal.find((card) => !kept(card)) ?? (legal[0] as Card);
}

/** Every remaining trick is needed: take this one. `legal` is sorted weakest first. */
function winEvery(sim: RoundSim, legal: Card[]): Card {
  if (sim.trick.length === 0) return legal.at(-1) as Card;
  const winners = legal.filter((card) => winsNow(sim.trick, card, sim.trump));
  if (winners.length === 0) {
    // Lost anyway: give up the weakest card, keeping Wizards.
    return legal.find((card) => !info(card).wizard) ?? (legal[0] as Card);
  }
  const last = sim.trick.length === sim.playerCount - 1;
  if (last) return winners[0] as Card;
  // A later player may still beat a weak winner: play one that is hard to beat.
  return winners.find((card) => strength(card, sim.trump) >= 62) ?? (winners.at(-1) as Card);
}

/**
 * Some tricks are needed, but not all: win only when it is cheap or nearly certain, otherwise
 * duck with the strongest card that loses, saving Wizards and high trumps for later tricks.
 */
function winIfCheap(sim: RoundSim, legal: Card[]): Card {
  if (sim.trick.length === 0) {
    // Lead a strong card that isn't a Wizard: a high trump, or a side-suit ace.
    const strong = legal.filter((card) => {
      const c = info(card);
      return (c.suit === sim.trump && c.rank >= 12) || (c.suit !== null && c.rank === 14);
    });
    return strong.at(-1) ?? duck(sim, legal, true);
  }
  const winners = legal.filter((card) => winsNow(sim.trick, card, sim.trump));
  const cheapest = winners[0];
  if (!cheapest) return duck(sim, legal, true);
  if (sim.trick.length === sim.playerCount - 1) return cheapest;
  const c = info(cheapest);
  const cheap = !c.wizard && c.suit !== sim.trump;
  const nearlyCertain = !c.wizard && c.suit === sim.trump && c.rank >= 13;
  if (cheap || nearlyCertain) return cheapest;
  const ducked = duck(sim, legal, true);
  return winsNow(sim.trick, ducked, sim.trump) ? cheapest : ducked;
}

/** A fast seeded RandomInt (mulberry32) for rollouts, seeded once per decision. */
export function fastRandom(seed: number): RandomInt {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}
