# Jesters — Project Plan

A native iOS trick-taking card game for 3–6 players, following the rules of
**Wizard** ([Wikipedia](https://de.wikipedia.org/wiki/Wizard_(Spiel))).
Online, round-based multiplayer with an authoritative Node.js backend on Firebase.

> "Wizard" is a registered trademark (Amigo / U.S. Games Systems). The app ships
> under its own name ("Jesters") with original card artwork and wording, and
> never uses the Wizard name or logo in the store listing or UI.

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
- Optional house rule ("no even bids"): the dealer, who bids last, may not make
  the total of all bids equal *n*. This is a per-lobby setting.

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
          │ Firebase Auth (Sign in with Apple / anonymous)         ▼
          │ FCM / APNs push                               ┌──────────────────┐
          └──────────────────────────────────────────────▶│ Cloud Firestore  │
                                                          └──────────────────┘
```

**Principles**
- **Server-authoritative.** Clients never write game state. Every action
  (`createGame`, `joinGame`, `startGame`, `placeBid`, `chooseTrump`, `playCard`, …)
  goes through a callable Cloud Function that validates it against the rules engine
  inside a Firestore transaction.
- **Hidden information stays hidden.** Each player's hand is stored in a private
  document that only that player can read (enforced by security rules). The public
  game document never contains other players' cards or the deck.
- **Realtime through Firestore.** Clients subscribe to the public game document and
  their own private hand document; no custom WebSocket server is needed.
- **One rules engine.** A pure, framework-free TypeScript module is the single source of
  truth. The server also writes each player's `legalCards`, so the client never needs to
  reimplement the follow-suit logic.

### Firebase services
| Service | Purpose |
|---|---|
| Authentication | Sign in with Apple (primary), anonymous guest (upgradeable) |
| Cloud Functions (2nd gen, Node 22, TypeScript) | Game actions, lobby management, timeouts, push triggers |
| Cloud Firestore | Game state, lobbies, user profiles, history |
| Cloud Tasks (via `onTaskDispatched`) | Turn timeouts / auto-play for idle players |
| Cloud Messaging (FCM → APNs) | "Your turn" and invite notifications |
| App Check (App Attest) | Only allow calls from the genuine app |
| Emulator Suite | Local development and integration tests |
| Crashlytics / Analytics | Stability and usage metrics |

---

## 3. Data model (Firestore)

```
users/{uid}
  displayName, avatar, fcmTokens[], stats { gamesPlayed, wins, … }

games/{gameId}                          // public, readable by participants
  status: "lobby" | "bidding" | "choosingTrump" | "playing" | "roundEnd" | "finished"
  joinCode: "K7Q2"                      // short code for invites
  hostUid, settings { maxPlayers, noEvenBids, turnTimeoutSec }
  players: [{ uid, name, seat, connected }]
  round: { number, dealerSeat, trumpCard, trumpSuit,
           bids: { [uid]: int | null }, tricksWon: { [uid]: int } }
  currentTrick: { leaderSeat, cards: [{ uid, card }], ledSuit }
  turn: { uid, deadline }
  scores: [{ round, perPlayer: { [uid]: { bid, won, delta, total } } }]
  version: int                          // incremented on every change
  updatedAt

games/{gameId}/hands/{uid}              // private: readable only by request.auth.uid == uid
  cards: [Card], legalCards: [Card]

games/{gameId}/secret/state             // readable by no client (functions only)
  deck: [Card], rngSeed

games/{gameId}/events/{eventId}         // append-only log (bids, plays, trick results) for
                                        // animations, replays and debugging
```

`Card` is encoded as a compact string: `"H14"` (Ace of hearts), `"S2"`, `"W1"`–`"W4"`
(Wizards), `"J1"`–`"J4"` (Jesters).

**Security rules (summary)**
- `games/{id}`: read if `request.auth.uid` is in `players`; no client writes.
- `hands/{uid}`: read only by the owner; no client writes.
- `secret/*`: no client access.
- `users/{uid}`: the owner can read/write their own profile fields (not stats).

---

## 4. Backend (Node.js / TypeScript)

```
backend/
  functions/
    src/
      engine/            // pure rules engine, no Firebase imports
        cards.ts         // deck, shuffle (crypto RNG), card encoding
        trick.ts         // legal moves, trick winner
        round.ts         // dealing, trump, bidding, round transitions
        scoring.ts
        game.ts          // state machine: reduce(state, action) -> state | error
      api/               // callable functions: thin wrappers around engine + transaction
        lobby.ts         // createGame, joinGame, leaveGame, startGame
        actions.ts       // placeBid, chooseTrump, playCard
      tasks/timeouts.ts  // auto-bid / auto-play when a turn deadline passes
      notifications.ts   // Firestore trigger → FCM push on turn change
    test/                // Vitest unit tests + emulator integration tests
  firestore.rules
  firestore.indexes.json
  firebase.json
```

**Engine design:** `reduce(state, action)` is a pure function that returns either the
new full state or a typed error (`NOT_YOUR_TURN`, `MUST_FOLLOW_SUIT`,
`BID_SUM_NOT_ALLOWED`, …). Each callable:
1. authenticates the caller and checks App Check,
2. runs a Firestore transaction: read the public, secret and hand docs → `reduce` →
   write the public doc, the hand docs and an event,
3. checks `version` so stale or duplicate requests are rejected (idempotency).

Shuffling uses `crypto.randomInt` (Fisher–Yates) on the server only.

**Timeouts:** each time the turn changes, a Cloud Task is enqueued for `deadline`. If
the turn is still unchanged when the task fires, the server plays for the player:
it bids the expected number of tricks from a simple heuristic, or plays the lowest
legal card. After repeated timeouts the player is marked as disconnected.

---

## 5. iOS app (Swift / SwiftUI)

- **Target:** iOS 17+, Swift 6, SwiftUI, Swift Concurrency, `@Observable` models.
- **Dependencies (SPM):** `firebase-ios-sdk` (Auth, Firestore, Functions, Messaging,
  AppCheck, Crashlytics). No other third-party dependencies initially.

```
ios/Jesters/
  App/              JestersApp.swift, AppDelegate (push), dependency container
  Core/
    Models/         Card, Suit, GameState, Player, Round (Codable, mirror the server DTOs)
    Services/       AuthService, GameService (listeners + callables), PushService
  Features/
    Onboarding/     Sign in with Apple, choose display name
    Home/           Create game, join by code, active games, history
    Lobby/          Seats, settings (host), share invite link / code
    Table/          The main game screen
      TableView, HandView, TrickView, BidSheet, TrumpPickerSheet, ScoreboardView
    Results/        Final standings, per-round score table
  DesignSystem/     Card rendering, colors, typography, haptics, sounds
  Resources/        Assets, Localizable.xcstrings (de, en)
```

**Data flow:** `GameService` attaches two Firestore listeners (the public game doc and
the private hand doc) and publishes a combined `GameViewState`. Views are pure functions
of that state. User intents call `Functions.httpsCallable(...)` asynchronously. The UI
optimistically marks a card as "pending" and rolls back if the server returns an error.

**Table screen UX**
- The player's hand fans out along the bottom; illegal cards are dimmed using `legalCards`.
  Play a card by dragging or double-tapping it.
- Opponents sit around the table showing their bid, tricks won and a turn indicator / timer.
- The trump card and suit badge are always visible.
- Bidding uses a bottom sheet with a stepper or number grid; a forbidden "even" bid is disabled.
- Trick resolution is animated: cards fly to the winner, with haptics.
- The scoreboard is one swipe away.

**Other app features**
- Deep links / universal links (`jesters.app/join/K7Q2`) and a share sheet for invites.
- Reconnection: Firestore's offline cache plus listeners resume state automatically.
- Localization in German and English from day one.
- Accessibility: VoiceOver labels for every card, Dynamic Type, suits distinguishable without color.

---

## 6. Testing strategy

| Layer | Tooling | Focus |
|---|---|---|
| Rules engine | Vitest | Exhaustive cases: Wizard/Jester leads, follow-suit, trump selection, last round without trump, no-even-bids rule, scoring. Property tests (fast-check) that run random full games and check invariants. |
| Functions + rules | Firebase Emulator + `@firebase/rules-unit-testing` | Players cannot read other hands or the secret doc; actions out of turn are rejected; concurrent plays are rejected. |
| iOS | Swift Testing / XCTest | Model decoding, view-state mapping, card sorting |
| iOS UI | XCUITest against the emulator | Create → join → play a 3-player game with bot-driven clients |
| End-to-end | Script-driven bot clients (Node) | Full games against the emulator in CI |

---

## 7. Tooling, CI/CD and environments

- **Monorepo:** `backend/`, `ios/`, `docs/`, `.github/workflows/`.
- **Firebase projects:** `jesters-dev` and `jesters-prod` (aliases in `.firebaserc`).
- **GitHub Actions:**
  - `backend.yml`: lint (ESLint, Prettier), typecheck and tests on the emulator →
    deploy functions, rules and indexes to dev on `main` → deploy to prod on tags.
  - `ios.yml` (macOS runner): build and run tests; Fastlane / Xcode Cloud for TestFlight.
- **Secrets:** a Firebase service account via GitHub OIDC (Workload Identity Federation);
  `GoogleService-Info.plist` per environment, provided by build configuration.

---

## 8. Milestones

| # | Milestone | Deliverables |
|---|---|---|
| **M0** | Foundations (≈1 wk) | Monorepo, Firebase projects, emulator setup, Xcode project with SPM Firebase, CI skeleton |
| **M1** | Rules engine (≈1–2 wk) | Complete TypeScript engine with 100% branch coverage on trick and scoring logic; CLI simulator to play bots against each other |
| **M2** | Backend API (≈2 wk) | Lobby and game callables, transactions, security rules, rules tests, event log |
| **M3** | iOS MVP (≈3 wk) | Auth, home, lobby, join by code, a playable table with basic visuals, scoreboard — a full game between 3 devices |
| **M4** | Robustness (≈1–2 wk) | Turn timeouts and auto-play, reconnection, push notifications, App Check, leaving and rejoining |
| **M5** | Polish (≈2–3 wk) | Card art, animations, haptics and sound, localization, accessibility, results and history screens |
| **M6** | Beta and launch (≈2 wk) | TestFlight beta, Crashlytics, analytics, privacy manifest, App Store assets, prod deploy |

**Later / nice to have:** AI bots to fill empty seats, friends list, ranked matchmaking,
rule variants (e.g. blind bidding, bids hidden until all are placed), a spectator mode,
an iPad layout, Game Center achievements, chat and emotes.

---

## 9. Risks and open questions

- **Trademark:** use original names and art (see the note at the top).
- **Latency:** each card play is a callable function plus a Firestore round trip
  (about 200–500 ms). This is acceptable for a turn-based game; set `minInstances: 1`
  on hot functions in prod to avoid cold starts.
- **Cost:** Firestore reads scale with players × moves. Keep one public doc per game
  and avoid per-move document fan-out.
- **Open decisions:**
  - Is "no even bids" on by default?
  - Synchronous play only, or also asynchronous play (turns over hours with push)?
  - Will there be a guest mode without Sign in with Apple?
  - Should there be AI bots in the MVP (useful for testing and for filling empty seats)?
