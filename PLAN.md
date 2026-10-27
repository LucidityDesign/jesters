# Jesters — Project Plan

A native iOS trick-taking card game for 3–6 players, following the rules of
**Wizard** ([Wikipedia](https://de.wikipedia.org/wiki/Wizard_(Spiel))).
Online, round-based multiplayer with an authoritative Node.js backend on Firebase.
Games are **asynchronous**: a turn can take hours, and players are notified by push.

> "Wizard" is a registered trademark (Amigo / U.S. Games Systems). The app ships
> under its own name ("Jesters") with original card artwork and wording, and
> never uses the Wizard name or logo in the store listing or UI.

## Product decisions (v1)

| Topic | Decision |
|---|---|
| Bid rule | **"No even bids" is on by default**: the dealer may not make the total of all bids equal the number of cards dealt. The host can switch it off in the lobby. |
| Pace | **Asynchronous.** There is no turn timer; turns can take hours. The next player gets a push notification. |
| Accounts | **Guest only.** There is no sign-up. Players pick a display name and get an anonymous Firebase identity. |
| Joining | Players join a room with a short **room key** (e.g. `K7Q2XM`), typed in or opened from a shared link. |
| Bots | The host can add **beginner bots** in the lobby; the server makes their moves. The server never plays a card for a person. Stronger, AI-based bots may follow. |
| Design | **Very simple.** System fonts, colors and SF Symbols; cards drawn in SwiftUI; minimal animation; no custom artwork beyond the app icon. |
| Region | **Europe.** All regional Google Cloud resources are in `europe-west3` (Frankfurt). Schedules use the `Europe/Berlin` time zone. Only EU-hosted services are used where there is a choice (see §2). |
| Locales | The app follows the device's language and region (date, time and number formats; 24-hour clock where that is the local convention). Languages: English (base) and German; more European languages can be added through the string catalog. |

---

## 1. Game rules (the spec the engine implements)

### Cards
- 60 cards: 52 regular cards in 4 suits (values 2–14, Ace high),
  4 **Wizards** (Z) and 4 **Jesters** (N, "Narren").

### Setup and rounds
- 3–6 players. Number of rounds = 60 / players
  (3 → 20, 4 → 15, 5 → 12, 6 → 10).
- Round *n*: each player is dealt *n* cards. The dealer rotates clockwise each round;
  the first dealer is random.

### Trump
- After dealing, the top card of the remaining deck is turned face up:
  - regular card → its suit is trump,
  - Jester → no trump this round,
  - Wizard → the dealer chooses the trump suit.
- In the last round all cards are dealt, so there is no trump.

### Bidding
- Starting left of the dealer, each player in turn announces how many tricks they expect to win (0…*n*).
- Bids are visible to everyone.
- **No even bids** (default on): the dealer, who bids last, may not make the total of all bids equal *n*.

### Playing tricks
- The player left of the dealer leads the first trick; the winner of each trick leads the next.
- **Follow suit**: a player who holds a card of the led suit must play one.
  Wizards and Jesters may **always** be played, even if the player could follow suit.
- If no suit can be followed, any card may be played (including trump).
- Led suit special cases:
  - Wizard led → no suit to follow; the first Wizard wins.
  - Jester led → the first non-Jester card played sets the led suit
    (if that card is a Wizard, it wins).
- Trick winner:
  1. the **first** Wizard played, otherwise
  2. the highest trump, otherwise
  3. the highest card of the led suit.
  4. If only Jesters were played, the first Jester wins.

### Scoring (per round)
- Bid met exactly: **20 + 10 × tricks won**.
- Bid missed: **−10 × |tricks won − bid|**.
- After the last round the highest total wins (ties are shared).

---

## 2. Architecture overview

```
┌────────────────────┐   callable functions (HTTPS)   ┌──────────────────────────┐
│  iOS app (SwiftUI) │ ─────────────────────────────▶ │ Cloud Functions (Node.js │
│                    │                                │ / TypeScript) — the      │
│  Firestore         │ ◀───── realtime listeners ──── │ authoritative game engine│
│  snapshot listeners│                                └────────────┬─────────────┘
└─────────┬──────────┘                                             │ transactions
          │ Firebase Auth (anonymous)                              ▼
          │ FCM / APNs push ◀── "your turn"           ┌──────────────────┐
          └──────────────────────────────────────────▶│ Cloud Firestore  │
                                                      └──────────────────┘
```

**Principles**
- **Server-authoritative.** Clients never write game state. Every action
  (`createRoom`, `joinRoom`, `startGame`, `placeBid`, `chooseTrump`, `playCard`, …)
  goes through a callable Cloud Function that validates it against the rules engine
  inside a Firestore transaction.
- **Hidden information stays hidden.** Each player's hand is stored in a private
  document that only that player can read (enforced by security rules). The public
  game document never contains other players' cards or the deck.
- **Built for async.** The state lives entirely in Firestore, so a player can close the app,
  get a push hours later, and continue where the game is. While the app is open, live
  listeners update it in real time.
- **One rules engine.** A pure, framework-free TypeScript module is the single source of
  truth. The server also writes each player's `legalCards`, so the client never needs to
  reimplement the follow-suit logic.

### Firebase services
| Service | Location | Purpose |
|---|---|---|
| Cloud Firestore | `europe-west3` | Rooms/games, private hands, device push tokens |
| Cloud Functions (2nd gen, Node 22, TypeScript) | `europe-west3` | Room and game actions, push triggers, scheduled jobs |
| Cloud Scheduler (`onSchedule`) | `europe-west3`, time zone `Europe/Berlin` | Hourly reminder run (see §3); expire games after 14 days without a move; delete ended games after 90 days |
| Authentication | global (Google) | Anonymous auth only (guest identity per device) |
| Cloud Messaging (FCM → APNs, Web Push) | global (Google, Apple, browser push services) | "Your turn", "Game started", "Game finished" notifications |
| App Check (App Attest) | global (Google, Apple) | Only allow calls from the genuine app (important with anonymous auth) |
| Emulator Suite | local | Local development and integration tests |

**Data location:** all game data (games, hands, display names, push tokens) is stored and
processed in Frankfurt. Firebase Authentication, FCM and App Check are global services with no
region choice. With anonymous auth they only hold a random user ID and technical tokens, with no
names or emails. **Google Analytics for Firebase is not enabled.** Crash reports come from Apple's
built-in reporting (Xcode Organizer / TestFlight) instead of Crashlytics, so the app has no
third-party crash or analytics SDK.

**Time:** timestamps are always stored in UTC (Firestore `Timestamp`) and shown in the device's
time zone. Server schedules are defined in `Europe/Berlin`, so they follow daylight saving time.

---

## 3. Guest identity and rooms

- On first launch the app calls `signInAnonymously()` and asks for a **display name**
  (stored on device and in `users/{uid}`). There are no passwords or emails.
- The Firebase session is stored in the iOS Keychain. **Known limitation:** a guest who
  deletes the app or switches devices may lose their identity and their running games.
  This is acceptable for v1, and the app says so in one line on the name screen.
- **Room key:** 6 characters from an unambiguous alphabet (no `0/O`, `1/I/L`), e.g. `K7Q2XM`.
  It is unique among open rooms (`roomKeys/{key}` → `gameId`) and is freed when the game ends.
- **Joining:** type the key on the home screen, or open a share link
  `https://<app-domain>/join/K7Q2XM` (universal link → the app opens prefilled).
  Players can join only while the room is in the lobby.
- The host (room creator) starts the game when 3–6 players have joined and can remove
  players while in the lobby.
- **Bots:** in the lobby the host can fill seats with computer players (`addBot`), so a game can
  start with a single person. Bots have no account (`uid` `bot-…`, `bot: "beginner"` on the
  player). A Firestore trigger (`moveBot`) makes each bot move 0.5 to 2 s (at random) after the move
  before, one card at a time, so people can follow along. A bot never becomes host; a lobby with
  only bots left is deleted. Bots get no notifications. Strategies live in `functions/src/bots/` and see only a `BotView`
  (their own hand plus the table), so they can't cheat. The beginner bot follows simple rules of
  thumb: it bids what its cards should win given the bids so far, keeps its Jesters for tricks it
  must lose, and has a random aggression (-0.1 to 0.1, `aggression` on the player) that makes it
  bid higher or lower and take tricks with stronger or cheaper cards; while playing, more bids
  than cards make it more aggressive, fewer more cautious. Stronger, AI-based levels
  can be added later as further strategies.
- **Abandoned games:** without turn timers, a game can stall. Mitigations in v1:
  - a reminder push to the player whose turn it is, once their turn has been pending for 24 h
    and then daily. Reminders are sent only between 09:00 and 21:00 in **the player's own time
    zone** (stored on their profile), so nobody is woken at night. The scheduled job runs hourly
    and picks the players who are in that window,
  - any player can **leave** a running game, which ends it for everyone
    (final scores are shown as "abandoned"),
  - games with no move for 14 days are closed automatically.

---

## 4. Data model (Firestore)

```
users/{uid}                             // written by the app itself (fields checked by rules)
  displayName, fcmTokens[]
  timeZone: "Europe/Berlin"             // IANA id from the device, updated on app start
  locale: "de-DE"                       // device language, for anything the server must phrase

roomKeys/{key}                          // functions only
  gameId

games/{gameId}                          // readable by the game's players
  status: "lobby" | "choosingTrump" | "bidding" | "playing" | "finished" | "abandoned"
  roomKey: "K7Q2XM", hostUid, settings { noEvenBids: true }
  players: [{ uid, name, bot? }]        // index = seat, in join order; bot: "beginner" for bots
  playerUids: [uid]                     // for "my games" queries
  active: bool                          // false once finished or abandoned
  // Arrays below are indexed by seat.
  round: { number, totalRounds, dealerSeat, trumpCard, trumpSuit,
           bids: [int | null], tricksWon: [int], handSizes: [int] } | null
  trick: { leaderSeat, cards: [card] } | null       // in play order from the leader
  lastTrick: { leaderSeat, cards, winnerSeat } | null // so a returning player sees what happened
  turnSeat, turnUid, turnSince
  results: [{ round, bids: [int], won: [int], deltas: [int], totals: [int] }]
  version: int                          // incremented on every change
  abandonedBy?, createdAt, updatedAt

games/{gameId}/hands/{uid}              // readable only by that player
  cards: [card]
  legalCards: [card]                    // empty unless it is this player's turn to play
  forbiddenBid: int | null              // the dealer's "no even bids" restriction, on their turn

games/{gameId}/secret/state             // readable by no client (functions only)
  state: "<engine GameState as JSON>"   // incl. hands and the undealt deck
  schema: 1
```

`Card` is encoded as a compact string: `"H14"` (Ace of hearts), `"S2"`, `"W1"`–`"W4"`
(Wizards), `"J1"`–`"J4"` (Jesters).

**Security rules (summary)**
- `games/{id}`: read if `request.auth.uid in resource.data.playerUids`; no client writes.
- `hands/{uid}`: read only by the owner; no client writes.
- `secret/*`, `roomKeys/*`: no client access.
- `users/{uid}`: the owner can read and write `displayName`, `fcmTokens`, `timeZone` and `locale` only.

---

## 5. Backend (Node.js / TypeScript)

```
backend/
  functions/
    src/
      engine/            // pure rules engine, no Firebase imports
        cards.ts         // deck, shuffle (crypto RNG), card encoding
        trick.ts         // legal moves, trick winner
        round.ts         // dealing, trump, bidding (incl. no-even-bids), round transitions
        scoring.ts
        game.ts          // state machine: reduce(state, action) -> state | error
      bots/              // computer players, pure like the engine: BotView, strategies, playBots()
      game/              // Firestore mapping
        model.ts         // document shapes; engine state → public game / hand documents
        store.ts         // document references; writeState() inside a transaction
        roomKey.ts       // room key generation and normalization
      api/               // callable functions: thin wrappers around engine + transaction
        rooms.ts         // createRoom, joinRoom, addBot, removePlayer, leaveGame, startGame
        actions.ts       // chooseTrump, placeBid, playCard
        schemas.ts       // Zod input validation
        errors.ts        // error reasons sent to the app in HttpsError.details.reason
      notifications.ts   // Firestore trigger on turnUid change → FCM push
      scheduled.ts       // hourly reminders (09–21 h player-local), expire stale games, free room keys
    test/                // Vitest unit tests + emulator integration tests
  firestore.rules
  firestore.indexes.json
  firebase.json
```

**Engine design:** `reduce(state, action)` is a pure function that returns either the
new full state or a typed error (`NOT_YOUR_TURN`, `MUST_FOLLOW_SUIT`,
`BID_SUM_NOT_ALLOWED`, …). Each callable:
1. checks that the caller is authenticated (anonymous counts) and passes App Check,
2. runs a Firestore transaction: read the public, secret and hand docs → `reduce` →
   write the public doc and the hand docs,
3. checks `version` so stale or duplicate requests are rejected (idempotency).

Shuffling uses `crypto.randomInt` (Fisher–Yates) on the server only.

**Push:** an `onDocumentUpdated` trigger on `games/{id}` sends a push to the new
`turnUid` when it changes ("Your turn in game K7Q2XM — bid for round 5"). The push opens
the app directly on that game. It also notifies all players when a game starts or ends.
Invalid FCM tokens are removed when a send fails.

Push texts are **localized on the device**: the server sends APNs `loc-key` / `loc-args`
(e.g. `PUSH_YOUR_TURN_BID`, `["K7Q2XM", "5"]`), and the app's string catalog holds the
translations. The server never needs to know the player's language.

---

## 6. iOS app (Swift / SwiftUI)

- **Target:** iOS 17+, Swift 6, SwiftUI, Swift Concurrency, `@Observable` models.
- **Dependencies (SPM):** `firebase-ios-sdk` (Auth, Firestore, Functions, Messaging,
  AppCheck). No other third-party dependencies; no analytics or crash SDK.
- **Localization:** one `Localizable.xcstrings` string catalog (English base, German). Dates,
  times, numbers and relative times ("3 hours ago") always use `Locale.current` /
  `FormatStyle`, never fixed formats, so European conventions (24-hour clock, `dd.MM.yyyy`,
  decimal comma) come from the device. Timestamps are shown in `TimeZone.current`.

```
ios/Jesters/
  App/              JestersApp.swift, AppDelegate (push), deep-link routing
  Core/
    Models/         Card, Suit, GameState, Player, Round (Codable, mirror the server DTOs)
    Services/       AuthService (anonymous), GameService (listeners + callables), PushService
  Features/
    Welcome/        Enter display name (first launch only)
    Home/           "New room", "Join with key", list of my games (your turn first)
    Lobby/          Player list, room key + share button, start (host)
    Table/          Game screen: TableView, HandView, BidPicker, TrumpPicker, ScoreSheet
  UI/               CardView (simple SwiftUI card), small shared components
  Resources/        Assets (app icon only), Localizable.xcstrings (de, en)
```

**Data flow:** `GameService` attaches two Firestore listeners (the public game doc and
the private hand doc) and publishes a combined `GameViewState`. Views are pure functions
of that state. User intents call `Functions.httpsCallable(...)` asynchronously, and errors
are shown as a short inline message.

**Simple design guidelines**
- Standard SwiftUI controls (`List`, `Form`, `Button`, sheets), system font, light and dark mode.
- **Cards:** a white rounded rectangle showing the value and suit symbol in one of 4 suit colors;
  Wizard = `Z`, Jester = `N`. No images.
- **Game screen** (top to bottom):
  - a compact player list (name · bid · tricks won · ● whose turn),
  - the trump indicator,
  - the current trick as a row of cards with the player names below,
  - a "Your turn" / "Waiting for Anna" banner,
  - the player's hand as a horizontal row; tap a card to select it and tap again to play;
    illegal cards are dimmed.
- **Bidding:** a row of number buttons (0…*n*); the forbidden dealer bid is disabled
  with a one-line explanation.
- **Score sheet:** a plain table (rounds × players) in a sheet.
- The only animation is the default SwiftUI transition; there are no sounds; there is light haptic feedback on your turn.
- Push permission is requested when the player first joins or creates a room
  (and the reason is explained).

**Accessibility:** VoiceOver labels for every card ("Queen of hearts", "Wizard"),
Dynamic Type, and suits that differ by symbol, not just by color.

---

## 7. Testing strategy

| Layer | Tooling | Focus |
|---|---|---|
| Rules engine | Vitest | Exhaustive cases: Wizard/Jester leads, follow-suit, trump selection, last round without trump, no-even-bids rule, scoring. Property tests (fast-check) that run random full games with random legal moves and check invariants. |
| Functions + rules | Firebase Emulator + `@firebase/rules-unit-testing` | Players cannot read other hands or the secret doc; actions out of turn are rejected; concurrent plays are rejected; room key join flow. |
| iOS | Swift Testing | Model decoding, view-state mapping, card sorting |
| End-to-end | Node test script with several emulator clients | A full 3-player game from room creation to final scores, in CI |

The random-move test clients exist only in the test suite; they are not a product feature.

---

## 8. Tooling, CI/CD and environments

- **Monorepo:** `backend/`, `web/`, `ios/`, `docs/`, `.github/workflows/`.
- **Firebase project:** one project for now (ID in the GitHub secret `PROJECT_ID`); the emulators
  use `demo-jesters`. A separate test project can be added later.
- **GitHub Actions:**
  - `firebase.yml`: backend and web checks (lint, typecheck, unit tests, emulator and browser
    tests) → deploy functions, rules, indexes and hosting on `main`.
  - `ios.yml` (macOS runner): build and run tests.
  - `testflight.yml`: archive and upload to TestFlight on `v*` tags.
- **Secrets:** a service account key or Workload Identity Federation for deploys;
  `GoogleService-Info.plist` for TestFlight builds; an APNs auth key uploaded to Firebase.

---

## 9. Milestones

| # | Milestone | Deliverables |
|---|---|---|
| **M0** | Foundations (≈1 wk) | Monorepo, Firebase projects, emulator setup, Xcode project with SPM Firebase, CI skeleton |
| **M1** | Rules engine (≈1–2 wk) | Complete TypeScript engine with full branch coverage on trick, bidding and scoring logic |
| **M2** | Backend API (≈2 wk) | Room keys, room and game callables, transactions, security rules, rules tests, end-to-end test |
| **M3** | iOS MVP (≈2–3 wk) | Guest name, home, lobby, join by key, game screen, score sheet — a full game between 3 devices |
| **M4** | Async and push (≈1 wk) | Turn pushes, deep link from push and share links, reminders, leave/abandon, stale-game cleanup |
| **M5** | Beta and launch (≈2 wk) | Localization pass, accessibility, App Check, privacy manifest and privacy policy (GDPR), TestFlight beta, App Store listing in the EU storefronts first |
| **M6** | Web app | React web app with the full game (guest, lobby, table, scores), English and German, served by Firebase Hosting; invite links and the privacy policy on the web domain; no web notifications |
| **M7** | Bots | Beginner bots the host can add in the lobby (web and iOS); the server moves for them. Stronger, AI-based levels later |

**After v1 (maybe):** an optional account upgrade (Sign in with Apple) to keep games
across devices, stronger (AI-based) bots, rule variants (blind bidding), an iPad layout,
chat and emotes.

---

## 10. Risks

- **Trademark:** use original names (see the note at the top).
- **Lost guest identities:** reinstalling the app loses the guest identity. This is accepted
  for v1; the account upgrade after v1 addresses it.
- **Stalled games:** without timers or bots, one inactive player blocks a game. Reminders,
  "leave = end game" and the 14-day expiry keep this manageable.
- **Abuse with anonymous auth:** App Check, per-user rate limits on `createRoom`,
  and a maximum of 20 active games per guest.
- **GDPR:** data is minimal (random ID, display name, push token, time zone) and stored in the EU.
  Players delete their data in the app (`deleteMyData`); ended games are deleted after 90 days.
  The privacy policy draft (`docs/privacy-policy.md`) needs the controller's details and a legal
  review; the data processing terms are accepted in the Firebase console.
- **Abandoned guest profiles:** a guest who deletes the app without deleting their data leaves a
  profile behind (name, push token). A cleanup of profiles without games is a possible follow-up.
- **Push reliability:** if notifications are disabled, the home screen still sorts
  "your turn" games to the top and shows a badge.
