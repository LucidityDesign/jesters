import { type BotLevel, botLevel, type GameDoc, totals } from "./model";

// Statistics from the finished games a player can read: their own, all of them; everyone else's,
// only from the games they played together (the only games of theirs this player can read).

/** One person's (or one bot level's) tally. */
export interface Tally {
  /** The uid, or `bot:<level>`: all bots of one level count as one opponent. */
  key: string;
  /** The name in the most recent game; empty for bots. */
  name: string;
  bot: BotLevel | null;
  games: number;
  /** Games finished first, ties included. */
  wins: number;
  /** Sum of final totals, for the average. */
  points: number;
  best: number;
  /** Sum of places (1 = first), for the average. */
  places: number;
  /** Rounds bid by the person themselves (not by a bot for them). */
  rounds: number;
  /** Of those, rounds that won exactly the bid, more tricks than bid, and fewer. */
  hits: number;
  over: number;
  under: number;
}

/** An opponent's record, and how the player did against them in their games together. */
export interface Opponent extends Tally {
  /** Games the player finished ahead of them, behind them, and level with them. */
  ahead: number;
  behind: number;
  level: number;
}

export interface Stats {
  me: Tally;
  opponents: Opponent[];
}

function emptyRecord(key: string, name: string, bot: BotLevel | null): Tally {
  return {
    key,
    name,
    bot,
    games: 0,
    wins: 0,
    points: 0,
    best: Number.NEGATIVE_INFINITY,
    places: 0,
    rounds: 0,
    hits: 0,
    over: 0,
    under: 0,
  };
}

/** `games` newest first (names are taken from the newest game). Only finished games count. */
export function computeStats(games: readonly GameDoc[], uid: string): Stats {
  const me = emptyRecord(uid, "", null);
  const opponents = new Map<string, Opponent>();

  for (const game of games) {
    const mySeat = game.playerUids.indexOf(uid);
    if (game.status !== "finished" || mySeat < 0) continue;
    const scores = totals(game);
    const best = Math.max(...scores);
    const myScore = scores[mySeat] as number;

    game.players.forEach((player, seat) => {
      const bot = player.bot ? botLevel(player.bot) : null;
      // Someone who deleted their data has no name and can't be told apart.
      if (!bot && !player.name) return;
      const record =
        seat === mySeat
          ? me
          : opponentFor(opponents, bot ? `bot:${bot}` : player.uid, player.name, bot);
      const score = scores[seat] as number;
      record.games += 1;
      if (score === best) record.wins += 1;
      record.points += score;
      record.best = Math.max(record.best, score);
      record.places += 1 + scores.filter((other) => other > score).length;
      if (!bot && !player.left) countBids(record, game, seat);
      if (seat !== mySeat) {
        const opponent = record as Opponent;
        if (myScore > score) opponent.ahead += 1;
        else if (myScore < score) opponent.behind += 1;
        else opponent.level += 1;
      }
    });
  }
  return { me, opponents: [...opponents.values()].sort(byRank) };
}

function opponentFor(
  opponents: Map<string, Opponent>,
  key: string,
  name: string,
  bot: BotLevel | null,
): Opponent {
  let opponent = opponents.get(key);
  if (!opponent) {
    opponent = { ...emptyRecord(key, name, bot), ahead: 0, behind: 0, level: 0 };
    opponents.set(key, opponent);
  }
  return opponent;
}

/** Adds the rounds a person bid themselves; rounds a bot played for them don't count. */
function countBids(record: Tally, game: GameDoc, seat: number): void {
  const uid = game.playerUids[seat] as string;
  const byBot = new Set(game.autoPlayedRounds?.[uid] ?? []);
  for (const result of game.results) {
    if (byBot.has(result.round)) continue;
    const bid = result.bids[seat];
    const won = result.won[seat];
    if (bid === undefined || won === undefined) continue;
    record.rounds += 1;
    if (won === bid) record.hits += 1;
    else if (won > bid) record.over += 1;
    else record.under += 1;
  }
}

/** Win rate first, then average points, then more games. */
export function byRank(a: Tally, b: Tally): number {
  return winRate(b) - winRate(a) || averagePoints(b) - averagePoints(a) || b.games - a.games;
}

export function winRate(record: Tally): number {
  return record.games === 0 ? 0 : record.wins / record.games;
}

export function averagePoints(record: Tally): number {
  return record.games === 0 ? 0 : record.points / record.games;
}

export function averagePlace(record: Tally): number {
  return record.games === 0 ? 0 : record.places / record.games;
}

/** Share of rounds that won exactly the bid; null without rounds. */
export function hitRate(record: Tally): number | null {
  return record.rounds === 0 ? null : record.hits / record.rounds;
}
