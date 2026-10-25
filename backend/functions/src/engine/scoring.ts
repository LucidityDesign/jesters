/** Points for one round: 20 + 10 per trick if the bid was met, otherwise −10 per trick off. */
export function roundScore(bid: number, won: number): number {
  return bid === won ? 20 + 10 * won : -10 * Math.abs(won - bid);
}
