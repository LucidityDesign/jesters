import { type Card, legalCards } from "../engine/index.js";
import { cloneSim, playCard, type RoundSim, scoreOf, turnOf } from "./sim.js";

// The end of a round, played exactly: once few cards are left, every way to play them is tried in
// a deal (all hands known) instead of following the rollout policy. Each player picks what is best
// for them (max^n): the others their round score, the bot what `value` makes of everyone's
// scores, so it can play for the game, not just the round.

/** How many lines of play the rest of the round has at most: the product of `hand size!`. */
export function linesLeft(sim: RoundSim, limit: number): number {
  let lines = 1;
  for (let seat = 0; seat < sim.playerCount; seat++) {
    const inHand = (sim.hands[seat] as Card[]).length;
    for (let k = 2; k <= inHand; k++) {
      lines *= k;
      if (lines > limit) return lines;
    }
  }
  return lines;
}

/**
 * Everyone's round score after the best play from here, with `seat` judging the end by `value`
 * (higher is better) and the others by their own round score.
 */
export function solveRound(
  sim: RoundSim,
  seat: number,
  value: (scores: number[]) => number,
): number[] {
  if (sim.tricksLeft === 0) return sim.bids.map((_, s) => scoreOf(sim, s));
  const mover = turnOf(sim);
  const options = legalCards(sim.hands[mover] as Card[], sim.trick);
  let best: number[] | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const card of options) {
    const next = cloneSim(sim);
    playCard(next, card);
    const scores = solveRound(next, seat, value);
    const v = mover === seat ? value(scores) : (scores[mover] as number);
    if (v > bestValue) {
      bestValue = v;
      best = scores;
    }
  }
  return best as number[];
}
