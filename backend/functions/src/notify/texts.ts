// The push texts for browsers, which can't look them up in the app's string catalog like iOS
// does. Same keys and wording as ios/Jesters/Resources/Localizable.xcstrings; placeholders are
// `%@` (in order) or `%1$@` (by position).

export const PUSH_TEXTS = {
  en: {
    PUSH_EXPIRED: "The game was closed after 14 days without a move.",
    PUSH_FINISHED: "Winner: %@",
    PUSH_LEFT: "%@ left, so the game ended early.",
    PUSH_REMINDER: "Your game with %@ is waiting for you.",
    PUSH_STARTED: "%@ started the game.",
    PUSH_TITLE_GAME: "Jesters",
    PUSH_TITLE_GAME_OVER: "Game over",
    PUSH_TITLE_YOUR_TURN: "Your turn",
    PUSH_TURN_BID: "Round %1$@ with %2$@: how many tricks will you take?",
    PUSH_TURN_PLAY: "Round %1$@ with %2$@: it's your turn to play.",
    PUSH_TURN_TRUMP: "Round %1$@ with %2$@: a Wizard was turned up. Choose trump.",
  },
  de: {
    PUSH_EXPIRED: "Das Spiel wurde nach 14 Tagen ohne Zug beendet.",
    PUSH_FINISHED: "Gewonnen: %@",
    PUSH_LEFT: "%@ hat das Spiel verlassen, daher wurde es vorzeitig beendet.",
    PUSH_REMINDER: "Dein Spiel mit %@ wartet auf dich.",
    PUSH_STARTED: "%@ hat das Spiel gestartet.",
    PUSH_TITLE_GAME: "Jesters",
    PUSH_TITLE_GAME_OVER: "Spiel vorbei",
    PUSH_TITLE_YOUR_TURN: "Du bist dran",
    PUSH_TURN_BID: "Runde %1$@ mit %2$@: Wie viele Stiche machst du?",
    PUSH_TURN_PLAY: "Runde %1$@ mit %2$@: Du bist am Zug.",
    PUSH_TURN_TRUMP: "Runde %1$@ mit %2$@: Ein Zauberer wurde aufgedeckt. Wähle Trumpf.",
  },
} as const;

/** The text for `key` in the player's language (German for `de…`, else English), filled in. */
export function pushText(key: string, args: readonly string[], locale: string | undefined): string {
  const texts: Record<string, string> = locale?.toLowerCase().startsWith("de")
    ? PUSH_TEXTS.de
    : PUSH_TEXTS.en;
  const text = texts[key] ?? key;
  let next = 0;
  return text.replace(/%(?:(\d+)\$)?@/g, (_, position: string | undefined) =>
    String(args[position ? Number(position) - 1 : next++] ?? ""),
  );
}
