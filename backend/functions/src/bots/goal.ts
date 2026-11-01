// What the Hard bot plays for near the end of a game: its chance to win, not just the round's
// points. Someone far behind takes risks, someone ahead plays safe, and everyone keeps an eye on
// the leader's score.

/**
 * How much the gap between two players' scores moves in one round (standard deviation), by
 * player count − 3. Measured in simulated games; with more players, everyone gets fewer cards.
 */
export const ROUND_GAP_SPREAD = [52, 40, 32, 27];

/** Roughly the normal distribution's CDF. */
function normalCdf(x: number): number {
  return 1 / (1 + Math.exp(-1.702 * x));
}

/**
 * The chance that `seat` finishes first, given everyone's `totals` after this round and the
 * rounds still to play after it. Ties at the end count as a shared win.
 */
export function winChance(totals: readonly number[], seat: number, roundsAfter: number): number {
  const mine = totals[seat] as number;
  if (roundsAfter <= 0) {
    const best = Math.max(...totals);
    if (mine < best) return 0;
    return 1 / totals.filter((total) => total === best).length;
  }
  // The gap to each other player still moves by about this much until the end.
  const perRound = ROUND_GAP_SPREAD[totals.length - 3] ?? 30;
  const spread = perRound * Math.sqrt(roundsAfter);
  let chance = 1;
  totals.forEach((total, other) => {
    if (other !== seat) chance *= normalCdf((mine - total) / spread);
  });
  return chance;
}

/** How the search values a round's outcome: its points, and from `focusRounds` before the end also the chance to win. */
export interface Goal {
  /** Points a certain win is worth, on top of the round's score. 0 plays for points only. */
  winWeight: number;
  /** Play for the win in this many last rounds of the game. */
  focusRounds: number;
}

/**
 * The value for `seat` of a round ending with `roundScores`: its own points, plus `winWeight`
 * times its chance to win the game from there when the end is near.
 */
export function outcomeValue(
  goal: Goal | undefined,
  seat: number,
  totalsBefore: readonly number[],
  roundScores: readonly number[],
  roundsAfter: number,
): number {
  const own = roundScores[seat] as number;
  if (!goal || goal.winWeight === 0 || roundsAfter >= goal.focusRounds) return own;
  const totals = totalsBefore.map((total, s) => total + (roundScores[s] as number));
  return own + goal.winWeight * winChance(totals, seat, roundsAfter);
}
