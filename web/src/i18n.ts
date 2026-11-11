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
  "Leave the game? A bot will play your seat until the end.":
    "Spiel verlassen? Ein Bot spielt deinen Platz bis zum Ende.",
  "You left this game": "Du hast dieses Spiel verlassen",
  "A bot plays your seat until the end.": "Ein Bot spielt deinen Platz bis zum Ende.",
  "You left · a bot plays for you": "Verlassen · ein Bot spielt für dich",
  "Left the game · a bot plays": "Hat das Spiel verlassen · ein Bot spielt",
  "Auto-play · {minutes} min left": "Autopilot · noch {minutes} Min.",
  "Auto-play · until the end of round {round}": "Autopilot · bis Ende von Runde {round}",
  "Auto-play · until they take over": "Autopilot · bis zur Übernahme",
  "You left this game. A bot plays for you.":
    "Du hast dieses Spiel verlassen. Ein Bot spielt für dich.",
  "Give them a little more time.": "Gib noch etwas Zeit.",
  "{name} hasn't moved for {minutes} min.": "{name} hat seit {minutes} Min. nicht gespielt.",
  "Let a bot move": "Bot ziehen lassen",
  "−{points} points for stalling": "−{points} Punkte fürs Warten-Lassen",
  "When someone keeps everyone waiting for 30 minutes and the others let a bot move for them, they lose {points} points.":
    "Wer alle 30 Minuten warten lässt und für wen die anderen dann einen Bot ziehen lassen, verliert {points} Punkte.",
  "A bot move costs them {points} points.": "Ein Bot-Zug kostet {points} Punkte.",
  "−{points} for stalling": "−{points} fürs Warten-Lassen",
  "−{points} points for each move a bot made after stalling":
    "−{points} Punkte für jeden Bot-Zug nach Warten-Lassen",
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
  "Easy bots play by simple rules; Medium and Hard ones think ahead.":
    "Leichte Bots spielen nach einfachen Regeln, mittlere und schwere denken voraus.",
  "Bot level": "Bot-Stärke",
  Easy: "Leicht",
  Medium: "Mittel",
  Hard: "Schwer",
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
  "More emojis": "Mehr Emojis",
  "All emojis": "Alle Emojis",
  "Search emojis": "Emojis suchen",
  "Emoji groups": "Emoji-Gruppen",
  "Recently used": "Zuletzt verwendet",
  "No emoji found.": "Kein Emoji gefunden.",
  "The emojis could not be loaded.": "Die Emojis konnten nicht geladen werden.",
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
  Minutes: "Minuten",
  Rounds: "Runden",
  "{minutes} minutes": "{minutes} Minuten",
  "Rounds: {rounds}": "Runden: {rounds}",
  "Auto-play is on": "Autopilot ist an",
  "· {minutes} min left": "· noch {minutes} Min.",
  "· until the end of round {round}": "· bis Ende von Runde {round}",
  "· until you take over": "· bis du übernimmst",
  "Take over": "Übernehmen",
  "Move to another device": "Auf ein anderes Gerät umziehen",
  "Play on another phone or browser as the same guest, with your name and games. On the other device, choose “I already play on another device” (or open the link of the QR code) and enter this code. Both devices stay signed in.":
    "Spiele auf einem anderen Handy oder Browser als derselbe Gast weiter, mit Name und Spielen. Wähle auf dem anderen Gerät „Ich spiele schon auf einem anderen Gerät“ (oder öffne den Link des QR-Codes) und gib diesen Code ein. Beide Geräte bleiben angemeldet.",
  "Show transfer code": "Umzugscode anzeigen",
  "Transfer code": "Umzugscode",
  "QR code": "QR-Code",
  "Valid for 10 minutes, once.": "10 Minuten lang einmal gültig.",
  "The code has expired.": "Der Code ist abgelaufen.",
  "Move a guest from another device here": "Gast von einem anderen Gerät hierher holen",
  "I already play on another device": "Ich spiele schon auf einem anderen Gerät",
  "Move to this device": "Auf dieses Gerät umziehen",
  "On the device you play on now, open your profile, choose “Show transfer code” and enter the code here.":
    "Öffne auf dem Gerät, auf dem du jetzt spielst, dein Profil, wähle „Umzugscode anzeigen“ und gib den Code hier ein.",
  "Move here": "Hierher umziehen",
  "Move here?": "Hierher umziehen?",
  "The games you play on this device stay with the guest you are here now, and you can't get back to them.":
    "Die Spiele, die du auf diesem Gerät spielst, bleiben beim bisherigen Gast hier, und du kommst nicht mehr an sie heran.",
  "This code is wrong or has expired.": "Dieser Code ist falsch oder abgelaufen.",
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
  "Played by auto-play": "Vom Autopilot gespielt",
  "Your queued bid of {bid} isn't possible. Choose again.":
    "Deine vorgemerkte Ansage {bid} ist nicht möglich. Wähle neu.",
  "Choose your bid now: it is placed when it's your turn.":
    "Wähle deine Ansage schon jetzt: Sie wird abgegeben, sobald du dran bist.",
  "Your bid {bid} is placed when it's your turn. Tap it again to clear it.":
    "Deine Ansage {bid} wird abgegeben, sobald du dran bist. Tippe sie erneut an, um sie zu löschen.",
  "Your chosen card {card} can't be played on this trick. Choose another.":
    "Deine vorgemerkte Karte {card} kann in diesem Stich nicht gespielt werden. Wähle eine andere.",
  "Tap a card to play it when it's your turn.":
    "Tippe eine Karte an, um sie zu spielen, sobald du dran bist.",
  "{card} is played when it's your turn, if it's allowed then. Tap it again to clear it.":
    "{card} wird gespielt, sobald du dran bist, wenn sie dann erlaubt ist. Tippe sie erneut an, um sie zu löschen.",
  "Blind first round": "Blinde erste Runde",
  "In the first round, everyone sees the others' cards but not their own.":
    "In der ersten Runde sieht jeder die Karten der anderen, aber nicht die eigene.",
  "Round 1 is played blind: you see everyone's card but your own.":
    "Runde 1 wird blind gespielt: Du siehst die Karten aller anderen, aber nicht deine eigene.",
  "Your card, face down": "Deine Karte, verdeckt",
  "Your card": "Deine Karte",
  "Play again with the same players?": "Noch eine Runde mit denselben Leuten?",
  "Play again": "Noch einmal spielen",
  "{name} wants to play again.": "{name} möchte noch einmal spielen.",
  "Join the new game": "Beim neuen Spiel mitmachen",
  "You are in the new game.": "Du bist im neuen Spiel.",
  "Go to the new game": "Zum neuen Spiel",
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
