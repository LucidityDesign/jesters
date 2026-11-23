import { Loading, Page } from "../components/Layout";
import { useEndedGames } from "../hooks";
import { lang, t } from "../i18n";
import {
  averagePlace,
  averagePoints,
  byRank,
  computeStats,
  hitRate,
  type Opponent,
  type Tally,
  winRate,
} from "../stats";
import { botLevelName } from "./Lobby";

const percent = new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 });

/** The player's statistics and a leaderboard of everyone they have played with. */
export function Stats({ uid }: { uid: string }) {
  const games = useEndedGames(uid);
  const stats = games ? computeStats(games, uid) : null;

  return (
    <Page title={t("Leaderboard")}>
      {games === undefined && <Loading />}
      {games === null && <p className="hint">{t("Could not load your games.")}</p>}
      {stats && stats.me.games === 0 && (
        <p className="hint">{t("Finish a game to see your statistics here.")}</p>
      )}
      {stats && stats.me.games > 0 && (
        <>
          <MyStats me={stats.me} />
          <Leaderboard me={stats.me} opponents={stats.opponents} />
        </>
      )}
    </Page>
  );
}

function MyStats({ me }: { me: Tally }) {
  const hits = hitRate(me);
  const share = (count: number) => percent.format(me.rounds === 0 ? 0 : count / me.rounds);
  const tiles: [string, string, string?][] = [
    [t("Games"), String(me.games)],
    [t("Wins"), String(me.wins), percent.format(winRate(me))],
    [t("Average points"), decimal.format(averagePoints(me))],
    [t("Best game"), String(me.best)],
    [t("Average place"), decimal.format(averagePlace(me))],
    [
      t("Bids made"),
      hits === null ? "–" : percent.format(hits),
      t("{hits} of {rounds} rounds", { hits: me.hits, rounds: me.rounds }),
    ],
    [t("Too many tricks"), share(me.over)],
    [t("Too few tricks"), share(me.under)],
  ];
  return (
    <section>
      <h2>{t("Your statistics")}</h2>
      <dl className="stat-tiles">
        {tiles.map(([label, value, note]) => (
          <div key={label} className="stat-tile">
            <dt>{label}</dt>
            <dd>
              <strong>{value}</strong>
              {note && <span className="hint">{note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="hint">{t("Rounds a bot played for you don't count for your bids.")}</p>
    </section>
  );
}

function Leaderboard({ me, opponents }: { me: Tally; opponents: Opponent[] }) {
  const rows: (Tally | Opponent)[] = [me, ...opponents].sort(byRank);
  return (
    <section>
      <h2>{t("Leaderboard")}</h2>
      <p className="hint">
        {t(
          "Everyone you have played with, from your games together. You: games you finished ahead of them – behind them.",
        )}
      </p>
      <div className="leaderboard-scroll">
        <table className="leaderboard">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t("Player")}</th>
              <th scope="col">{t("Games")}</th>
              <th scope="col">{t("Wins")}</th>
              <th scope="col">
                <abbr title={t("Average points")}>Ø</abbr>
              </th>
              <th scope="col">
                <abbr title={t("Bids made")}>{t("Bids")}</abbr>
              </th>
              <th scope="col">{t("You")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isMe = row === me;
              const hits = hitRate(row);
              return (
                <tr key={row.key} className={isMe ? "me" : undefined}>
                  <td>{index + 1}</td>
                  <th scope="row">{nameOf(row, isMe)}</th>
                  <td>{row.games}</td>
                  <td>{percent.format(winRate(row))}</td>
                  <td>{whole.format(averagePoints(row))}</td>
                  <td>{hits === null ? "–" : percent.format(hits)}</td>
                  <td>{"ahead" in row ? versus(row) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function nameOf(row: Tally, isMe: boolean): string {
  if (isMe) return t("You");
  if (row.bot) return `${t("Bot")} (${botLevelName(row.bot)})`;
  return row.name;
}

/** "3–1": games finished ahead of them – behind them (ties left out). */
function versus(opponent: Opponent): string {
  return `${opponent.ahead}–${opponent.behind}`;
}
