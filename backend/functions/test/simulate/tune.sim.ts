import { writeSync } from "node:fs";
import { expect, it } from "vitest";
import { estimateBid } from "../../src/bots/estimate.js";
import {
  fastRandom,
  playCard,
  ROLLOUT,
  type RolloutParams,
  type RoundSim,
  rolloutCard,
  scoreOf,
  turnOf,
} from "../../src/bots/sim.js";
import {
  type Card,
  createDeck,
  forbiddenLastBid,
  type RandomInt,
  SUITS,
  type Suit,
  suitOf,
} from "../../src/engine/index.js";

// Tunes the rollout policy (`ROLLOUT` in sim.ts) by self-play: a variant plays random rounds
// against the current values, half the seats each, every deal twice with the seats swapped. A
// change is kept when it wins clearly; then the next parameter. DEALS sets the deals per
// comparison, PASSES the rounds over all parameters. Prints the values to copy into sim.ts.

const deals = Number(process.env.DEALS ?? 6000);
const passes = Number(process.env.PASSES ?? 2);

/** The values each parameter may take. */
const SPACE: Record<keyof RolloutParams, number[]> = {
  leadLowMaxRank: [5, 6, 7, 8, 9, 10, 11, 12, 13],
  hardToBeat: [56, 58, 60, 62, 63, 64, 100],
  strongLeadTrumpRank: [9, 10, 11, 12, 13, 14, 15],
  strongLeadSideRank: [11, 12, 13, 14, 15],
  nearlyCertainTrumpRank: [9, 10, 11, 12, 13, 14, 15],
  cheapSideMaxRank: [8, 10, 11, 12, 13, 14],
  sureTrumpRank: [12, 13, 14],
};

interface Deal {
  playerCount: number;
  hands: Card[][];
  trump: Suit | null;
  bids: number[];
  leader: number;
  round: number;
}

function shuffle<T>(items: T[], randomInt: RandomInt): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** A random round of a random table size, bid like the search bots expect others to bid. */
function randomDeal(randomInt: RandomInt): Deal {
  const playerCount = 3 + randomInt(4);
  const lastRound = 60 / playerCount;
  const round = 1 + randomInt(lastRound);
  const deck = shuffle(createDeck(), randomInt);
  const hands = Array.from({ length: playerCount }, (_, seat) =>
    deck.slice(seat * round, (seat + 1) * round),
  );
  const trumpCard = round < lastRound ? (deck[playerCount * round] as Card) : null;
  let trump: Suit | null = null;
  if (trumpCard?.[0] === "W") trump = SUITS[randomInt(4)] as Suit;
  else if (trumpCard && trumpCard[0] !== "J") trump = suitOf(trumpCard);
  const dealer = randomInt(playerCount);
  const bids: number[] = Array<number>(playerCount).fill(0);
  const made: number[] = [];
  for (let i = 1; i <= playerCount; i++) {
    const seat = (dealer + i) % playerCount;
    const forbidden = seat === dealer ? forbiddenLastBid(made, round) : null;
    bids[seat] = estimateBid(hands[seat] as Card[], trump, playerCount, round, forbidden);
    made.push(bids[seat] as number);
  }
  return { playerCount, hands, trump, bids, leader: (dealer + 1) % playerCount, round };
}

/** Plays `deal` with `params[seat]` for each seat and returns everyone's score. */
function play(deal: Deal, params: RolloutParams[]): number[] {
  const sim: RoundSim = {
    playerCount: deal.playerCount,
    trump: deal.trump,
    hands: deal.hands.map((hand) => [...hand]),
    bids: deal.bids,
    tricksWon: Array<number>(deal.playerCount).fill(0),
    trick: [],
    leader: deal.leader,
    tricksLeft: deal.round,
  };
  while (sim.tricksLeft > 0) playCard(sim, rolloutCard(sim, params[turnOf(sim)]));
  return deal.bids.map((_, seat) => scoreOf(sim, seat));
}

/** How many points a round `variant` scores more than `base` per seat, with its standard error. */
function compare(variant: RolloutParams, base: RolloutParams, seed: number) {
  const random = fastRandom(seed);
  let sum = 0;
  let squares = 0;
  let n = 0;
  for (let d = 0; d < deals; d++) {
    const deal = randomDeal(random);
    for (const parity of [0, 1]) {
      const params = deal.bids.map((_, seat) => (seat % 2 === parity ? variant : base));
      const scores = play(deal, params);
      let mine = 0;
      let mineCount = 0;
      let theirs = 0;
      scores.forEach((score, seat) => {
        if (seat % 2 === parity) {
          mine += score;
          mineCount++;
        } else {
          theirs += score;
        }
      });
      const delta = mine / mineCount - theirs / (scores.length - mineCount);
      sum += delta;
      squares += delta * delta;
      n++;
    }
  }
  const mean = sum / n;
  const error = Math.sqrt((squares / n - mean * mean) / n);
  return { mean, error };
}

it("tunes the rollout policy", () => {
  let best: RolloutParams = { ...ROLLOUT };
  let seed = 1;
  for (let pass = 0; pass < passes; pass++) {
    for (const key of Object.keys(SPACE) as (keyof RolloutParams)[]) {
      for (const value of SPACE[key]) {
        if (value === best[key]) continue;
        const variant = { ...best, [key]: value };
        const { mean, error } = compare(variant, best, seed++);
        const kept = mean > 2.5 * error && mean > 0.05;
        writeSync(
          1,
          `${key}=${value}: ${mean.toFixed(2)} ± ${error.toFixed(2)}${kept ? "  kept" : ""}\n`,
        );
        if (kept) best = variant;
      }
    }
    writeSync(1, `after pass ${pass + 1}: ${JSON.stringify(best)}\n`);
  }
  // The result against the starting values, on fresh deals.
  const { mean, error } = compare(best, ROLLOUT, 999_999);
  writeSync(1, `tuned vs current: ${mean.toFixed(2)} ± ${error.toFixed(2)} points per round\n`);
  expect(mean).toBeGreaterThan(-1);
});
