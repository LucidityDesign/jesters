// English and German. Texts are written in English in the code; `DE` holds the German version,
// mostly the same wording as the iOS app's string catalog. Placeholders: {name}.

export type Lang = "en" | "de";

/** German if the browser prefers it over English, otherwise English. */
export function detectLang(languages: readonly string[]): Lang {
  for (const language of languages) {
    const code = language.toLowerCase().split("-")[0];
    if (code === "de" || code === "en") return code;
  }
  return "en";
}

export const lang: Lang =
  typeof navigator === "undefined" ? "en" : detectLang(navigator.languages ?? [navigator.language]);

export const DE: Record<string, string> = {
  // Cards
  Hearts: "Herz",
  Spades: "Pik",
  Diamonds: "Karo",
  Clubs: "Kreuz",
  Wizard: "Zauberer",
  Jester: "Narr",
  Jack: "Bube",
  Queen: "Dame",
  King: "König",
  Ace: "Ass",
  "{rank} of {suit}": "{suit} {rank}",
  // Session, name and profile
  "No connection": "Keine Verbindung",
  Notifications: "Mitteilungen",
  "Get a notification when it's your turn.": "Lass dich benachrichtigen, wenn du dran bist.",
  "Turn on": "Einschalten",
  "Turn off": "Ausschalten",
  "Not now": "Nicht jetzt",
  OK: "OK",
  "Notifications are on.": "Mitteilungen sind eingeschaltet.",
  "Notifications are blocked. Allow them for this site in your browser's settings.":
    "Mitteilungen sind blockiert. Erlaube sie für diese Seite in den Einstellungen deines Browsers.",
  "This browser can't show notifications.": "Dieser Browser kann keine Mitteilungen anzeigen.",
  "Could not turn on notifications.": "Mitteilungen konnten nicht eingeschaltet werden.",
  "To get notifications on iPhone or iPad, add Jesters to your Home Screen (Share → Add to Home Screen) and open it from there. You start there as a new guest.":
    "Für Mitteilungen auf iPhone oder iPad füge Jesters zum Home-Bildschirm hinzu (Teilen → Zum Home-Bildschirm) und öffne es von dort. Dort startest du als neuer Gast.",
  "Connection lost. Reconnecting…": "Verbindung unterbrochen. Verbinde neu …",
  "Connected again": "Wieder verbunden",
  "Could not connect to the server. Check your internet connection.":
    "Keine Verbindung zum Server. Prüfe deine Internetverbindung.",
  "Try again": "Erneut versuchen",
  "Loading…": "Wird geladen …",
  "Your name": "Dein Name",
  "You play as a guest. Your games are linked to this browser and are lost if you clear its site data.":
    "Du spielst als Gast. Deine Spiele sind an diesen Browser gebunden und gehen verloren, wenn du seine Websitedaten löschst.",
  "Let's play": "Los geht’s",
  Save: "Sichern",
  Saved: "Gesichert",
  "Welcome to Jesters": "Willkommen bei Jesters",
  Profile: "Profil",
  Privacy: "Datenschutz",
  "Privacy policy": "Datenschutzerklärung",
  "Delete my data": "Meine Daten löschen",
  "Delete all your data?": "Alle deine Daten löschen?",
  "Your running games end for everyone. This can't be undone.":
    "Deine laufenden Spiele enden für alle. Das kann nicht rückgängig gemacht werden.",
  "Deleting your data ends your running games, removes your name from finished games and deletes your guest account. You then start over as a new guest.":
    "Wenn du deine Daten löschst, enden deine laufenden Spiele, dein Name wird aus beendeten Spielen entfernt und dein Gastkonto gelöscht. Danach startest du als neuer Gast.",
  "Former player": "Ehemaliger Spieler",
  "Page not found": "Seite nicht gefunden",
  "Back to your games": "Zurück zu deinen Spielen",
  // Home and join
  "New game": "Neues Spiel",
  "Join with key": "Mit Raumcode beitreten",
  "Your turn": "Du bist dran",
  "Other games": "Andere Spiele",
  Finished: "Beendet",
  "Show all": "Alle anzeigen",
  "Could not load your games.": "Deine Spiele konnten nicht geladen werden.",
  "No games yet. Start a new game and invite your friends with the room key.":
    "Noch keine Spiele. Starte ein neues Spiel und lade deine Freunde mit dem Raumcode ein.",
  "In the lobby · key {key}": "In der Lobby · Raumcode {key}",
  "Your turn · round {round}": "Du bist dran · Runde {round}",
  "Waiting for {name} · round {round}": "Warten auf {name} · Runde {round}",
  "Finished · winner: {names}": "Beendet · Gewonnen: {names}",
  "Ended early": "Vorzeitig beendet",
  "Room key": "Raumcode",
  "Ask the host for the 6-character room key.": "Frag den Gastgeber nach dem 6-stelligen Raumcode.",
  "Join game": "Spiel beitreten",
  Join: "Beitreten",
  // Game and lobby
  "Game not available": "Spiel nicht verfügbar",
  "This game was deleted or you are no longer part of it.":
    "Dieses Spiel wurde gelöscht oder du bist nicht mehr dabei.",
  "Leave game": "Spiel verlassen",
  "Leave and end the game for everyone?": "Verlassen und das Spiel für alle beenden?",
  "Leave this game?": "Dieses Spiel verlassen?",
  "Join my Jesters game with the room key {key}": "Spiel mit mir Jesters! Raumcode: {key}",
  "Invite players": "Mitspieler einladen",
  "Link copied": "Link kopiert",
  Host: "Gastgeber",
  You: "Du",
  Remove: "Entfernen",
  Bot: "Bot",
  "Add bot": "Bot hinzufügen",
  "At least 3 players are needed. Invite friends or add bots.":
    "Es werden mindestens 3 Spieler benötigt. Lade Freunde ein oder füge Bots hinzu.",
  "Bots play at beginner level and make their moves right away.":
    "Bots spielen auf Anfängerniveau und ziehen sofort.",
  "Players ({count} of {max})": "Spieler ({count} von {max})",
  "Waiting for the host to start the game.": "Warten, bis der Gastgeber das Spiel startet.",
  "At least 3 players are needed.": "Es werden mindestens 3 Spieler benötigt.",
  "No even bids": "Keine glatten Ansagen",
  "With this rule, the dealer may not bid so that the total of all bids equals the number of cards.":
    "Mit dieser Regel darf der Geber nicht so ansagen, dass die Summe aller Ansagen der Kartenzahl entspricht.",
  "Start game": "Spiel starten",
  Lobby: "Lobby",
  // Table
  Scores: "Punkte",
  "Round {number} of {total}": "Runde {number} von {total}",
  "A Wizard was turned up. Choose trump.": "Ein Zauberer wurde aufgedeckt. Wähle Trumpf.",
  "Waiting for {name} to choose trump": "Warten, bis {name} Trumpf wählt",
  "How many tricks will you take?": "Wie viele Stiche machst du?",
  "Waiting for {name} to bid": "Warten auf die Ansage von {name}",
  "Your turn: click a card, then click it again to play":
    "Du bist dran: Klicke eine Karte an und klicke erneut, um sie zu spielen",
  "Waiting for {name} to play": "Warten, bis {name} spielt",
  Dealer: "Geber",
  "Current turn": "Ist am Zug",
  "won {won} of {bid}": "{won} von {bid} gemacht",
  "Score: {score}": "Punkte: {score}",
  "Trump: {suit}": "Trumpf: {suit}",
  "Trump: to be chosen": "Trumpf: wird gewählt",
  "No trump (Jester)": "Kein Trumpf (Narr)",
  "No trump (last round)": "Kein Trumpf (letzte Runde)",
  "Trump: {suit} (chosen by {name})": "Trumpf: {suit} (gewählt von {name})",
  "Bids: {total} of {cards}": "Ansagen: {total} von {cards}",
  "Current trick": "Aktueller Stich",
  "In the lead": "In Führung",
  React: "Reagieren",
  Reactions: "Reaktionen",
  "{name}, highest card so far": "{name}, bisher höchste Karte",
  "{name} won the last trick": "{name} hat den letzten Stich gemacht",
  "No cards played yet": "Noch keine Karten gespielt",
  "Your cards": "Deine Karten",
  "You can't bid {bid}: the total of all bids must not equal the number of cards.":
    "Du kannst nicht {bid} ansagen: Die Summe aller Ansagen darf nicht der Kartenzahl entsprechen.",
  // Results
  "Scores appear after the first round.": "Punkte erscheinen nach der ersten Runde.",
  Round: "Runde",
  "Bid {bid}, won {won}": "{bid} angesagt, {won} gemacht",
  "You made your bid!": "Ansage erfüllt!",
  "You missed your bid": "Ansage verfehlt",
  "Round {round}": "Runde {round}",
  "Last trick and round": "Letzter Stich und letzte Runde",
  "Auto-play": "Autopilot",
  "Let a bot play for you": "Lass einen Bot für dich spielen",
  "Until I take over": "Bis ich übernehme",
  Minutes: "Minuten",
  Rounds: "Runden",
  "{minutes} minutes": "{minutes} Minuten",
  "Rounds: {rounds}": "Runden: {rounds}",
  "Auto-play is on": "Autopilot ist an",
  "· {minutes} min left": "· noch {minutes} Min.",
  "· until the end of round {round}": "· bis Ende von Runde {round}",
  "· until you take over": "· bis du übernimmst",
  "Take over": "Übernehmen",
  "Last trick": "Letzter Stich",
  "No trick played yet": "Noch kein Stich gespielt",
  "Last round": "Letzte Runde",
  "No round finished yet": "Noch keine Runde beendet",
  Player: "Spieler",
  Bid: "Ansage",
  Won: "Stiche",
  Points: "Punkte",
  "{points} points": "{points} Punkte",
  Close: "Schließen",
  "Small numbers: bid / tricks won": "Kleine Zahlen: Ansage / gemachte Stiche",
  "{name} left, so the game ended early.":
    "{name} hat das Spiel verlassen, daher wurde es vorzeitig beendet.",
  "Winner: {names}": "Gewonnen: {names}",
  Standings: "Rangliste",
  "Place {place}": "Platz {place}",
  "Score sheet": "Punkteliste",
  "Game ended": "Spiel beendet",
  "Game over": "Spiel vorbei",
  "This game was closed after 14 days without a move.":
    "Dieses Spiel wurde nach 14 Tagen ohne Zug beendet.",
  // Errors
  "No connection to the server. Please try again.":
    "Keine Verbindung zum Server. Bitte versuche es erneut.",
  "Something went wrong. Please try again.": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  "There is no game with this key.": "Es gibt kein Spiel mit diesem Raumcode.",
  "This game no longer exists.": "Dieses Spiel gibt es nicht mehr.",
  "You are not part of this game.": "Du bist nicht Teil dieses Spiels.",
  "Only the host can do that.": "Das kann nur der Gastgeber.",
  "This game has already started.": "Dieses Spiel hat bereits begonnen.",
  "This game is full.": "Dieses Spiel ist voll.",
  "This game is over.": "Dieses Spiel ist vorbei.",
  "The game changed in the meantime. Please try again.":
    "Das Spiel hat sich inzwischen geändert. Bitte versuche es erneut.",
  "You are in too many games. Finish or leave one first.":
    "Du bist in zu vielen Spielen. Beende oder verlasse zuerst eines.",
  "It's not your turn.": "Du bist nicht dran.",
  "You must follow suit.": "Du musst Farbe bedienen.",
  "The total of all bids must not equal the number of cards.":
    "Die Summe aller Ansagen darf nicht der Kartenzahl entsprechen.",
  "Please check your input.": "Bitte überprüfe deine Eingabe.",
};

export function translate(
  language: Lang,
  text: string,
  values: Record<string, string | number> = {},
): string {
  const template = language === "de" ? (DE[text] ?? text) : text;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** The text in the browser's language, with `{placeholders}` filled in. */
export function t(text: string, values?: Record<string, string | number>): string {
  return translate(lang, text, values);
}

/** "Anna, Ben and Cleo" / "Anna, Ben und Cleo". */
export function formatList(items: string[]): string {
  return new Intl.ListFormat(lang, { type: "conjunction" }).format(items);
}
