> **Status: not started.** The search bots (Easy, Medium, Hard; see PLAN.md, Bots) came first.
> This plan would add LLM-based levels on top of them. If it is picked up: level names and ids
> must not clash with `easy`/`medium`/`hard`, `engine`'s `roundTricks` (step 0) already exists, and
> every failure should fall back to the Medium bot instead of the old beginner bot.

# ✨ AI bots on Vertex AI Gemini

## Context
Bots today are rule-based only: a single `beginner` level (`backend/functions/src/bots/beginner.ts`)
that the server plays from the Firestore trigger `moveBot` (`backend/functions/src/triggers.ts`).
PLAN.md has always said "stronger, AI-based bots may follow". The goal: in the lobby the host
picks either a **regular bot** (today's beginner) or a **✨ AI bot**, and AI bots come in three
levels. The AI runs on **Vertex AI Gemini in europe-west3**, the same project and region as
everything else, signed in as the functions' service account (no API keys).

**Level names** (in place of "beginner / intermediate / advanced", to fit the wizard theme):
**Novice · Adept · Archmage**. Ids: `ai-novice`, `ai-adept`, `ai-archmage`; the regular bot keeps
the id `beginner`, so existing games and clients keep working.

What separates the levels (one table in code, easy to tune):
| Level | Model | Thinking | Prompt |
|---|---|---|---|
| Novice | Gemini Flash-Lite | off | the full table (below) |
| Adept | Gemini Flash | small budget | the full table + a short strategy brief |
| Archmage | Gemini Pro (or Flash, high budget) | large budget | the full table + a detailed strategy brief (card counting, bid pressure, endgame) |

**Every level sees the full table**: its hand, trump, bids, tricks won, scores, the current trick,
and **every card already played this round, trick by trick** (who led, who played what, who
won), plus a derived summary of what's still out (unseen Wizards/Jesters and unseen cards per
suit, i.e. 60 cards minus its hand, the trump card and all played cards). The levels differ in
model strength, thinking budget and how much strategy advice they get, not in what they may know.

The exact model ids are params (`defineString`), checked against Vertex's europe-west3 model list
at implementation time, so they can change without a code change.

## Design

### 0. Remember the round's played cards (`backend/functions/src/engine/game.ts`)
Today `GameState` keeps only `lastTrick`, so the history the AI needs doesn't exist yet.
- Add `roundTricks: CompletedTrick[]` to `GameState`: `[]` in the new-game state and in
  `startRound`, appended in `playCard` when a trick completes (next to `lastTrick`).
- `stateFromSecret` (`src/game/model.ts`) defaults it to `[]` for games saved before the change,
  so running games keep working (the round in progress simply starts its history late).
- This is public information (everyone saw these cards), so it's fine in a bot's view. The
  public game doc and clients stay unchanged.
- Add `roundTricks` to `BotView` / `viewFor` (`src/bots/view.ts`); the beginner bot ignores it.
- Engine tests: `roundTricks` grows by one per trick, resets each round; extend the property test
  in `game.property.test.ts` (played cards + hands + trump card never overlap, sizes add up).

### 1. Bot levels and the strategy interface (`backend/functions/src/bots/`)
- `index.ts`: `BOT_LEVELS = ["beginner", "ai-novice", "ai-adept", "ai-archmage"]`, plus
  `AI_BOT_LEVELS` and `isAiLevel(level)`. `botAction` stays synchronous and only handles
  `beginner`; AI levels go through the new async path below. `playBots` (tests/simulations)
  accepts an optional decider so simulations can use a fake AI.
- The directory stays pure (no I/O), like now. New pure files:
  - `bots/ai/prompt.ts`: builds the prompt from a `BotView` (reuse `viewFor` from `bots/view.ts`;
    only cards, bids, tricks, scores, seat numbers — **never names or uids**; includes the
    played tricks of this round and the "still unseen" summary, computed by a pure
    `unseenCards(view)` helper), plus the
    **response schema**: an enum of exactly the legal moves (`view.legalCards`, the bids
    `0…round` minus `view.forbiddenBid`, or `SUITS`), so Gemini can't answer with an illegal move.
  - `bots/ai/parse.ts`: turns the model's JSON into an `Action`, validating it again against the
    view; returns `null` if anything is off.
  - `bots/ai/levels.ts`: the table above (model param name, thinking budget, prompt detail).

### 2. Vertex client (`backend/functions/src/ai/vertex.ts`, new, I/O lives here)
- Dependency: `@google/genai` with `{ vertexai: true, project, location: REGION }` (REGION from
  `src/setup.ts`). Structured output (`responseMimeType: "application/json"`, `responseSchema`),
  low temperature, a hard timeout (~8 s via `AbortSignal`).
- An `AiClient` interface (`decide(level, prompt, schema) → Promise<unknown>`) with the Vertex
  implementation and a fake one. `AI_BOT_PROVIDER` env (`vertex` | `off`): `off` in
  `.env.demo-jesters`, so emulators, CI and e2e never call Vertex.

### 3. Playing the move (`backend/functions/src/triggers.ts` → `moveBot`)
Calling an LLM inside the Firestore transaction would repeat the call on every transaction retry,
so for AI levels:
1. After the delay, read `game` + `secret` outside the transaction, build the state
   (`stateFromSecret`) and view, call the AI client.
2. On timeout, error, or an unparsable/illegal answer: **fall back to the beginner strategy**
   (`botAction(state, "beginner", aggression)`) and `logger.warn` — a game never stalls on Vertex.
3. Run the existing transaction; if `game.version` moved on meanwhile, do nothing (as today).
   Apply with `reduce` + `writeState(..., { byBot: true })` unchanged.
4. Subtract the model's thinking time from `botDelayMs`, so AI bots don't feel slower than the
   0.5–2 s already planned (the 5 s new-round pause stays).
- Raise the trigger's `timeoutSeconds` modestly (e.g. 60 → 120) for Archmage calls.
- Auto-play (`AUTO_PLAY_LEVEL` in `game/model.ts`) stays `beginner`.

### 4. API
- `api/schemas.ts` `AddBotInput.level`: already `z.enum(BOT_LEVELS)`, picks up the new ids.
- `api/rooms.ts` `addBot`: unchanged except names; optionally an `AI_BOTS_ENABLED` switch that
  rejects AI levels with a clear error if Vertex isn't set up.

### 5. Clients
- **Web** (`web/src/api.ts`, `web/src/model.ts` `bot?` type, `web/src/pages/Lobby.tsx`,
  `web/src/i18n.ts` en+de): "Add bot" and "✨ Add AI bot"; the AI button opens a small level
  picker (Novice / Adept / Archmage). Show ✨ and the level next to AI bots in the lobby and at
  the table. Replace the hint "Bots play at beginner level…" with one that explains both kinds.
- **iOS** (`ios/Jesters/Core/Services/API.swift` `addBot(gameId:level:)`,
  `Features/Lobby/LobbyView.swift`, `Features/Game/GameModel.swift`, localizations): the same
  two buttons, with a `Menu` for the AI level. `Player.bot` is already a string.

### 6. Safe before Vertex is set up (nothing may crash)
AI bots must work, and nothing may fail, whether or not Vertex AI has been set up yet.
- **Off by default.** `AI_BOT_PROVIDER` defaults to `off`; only `vertex` turns on calls. With
  `off`, AI bots can still be added and play, using the beginner strategy, so games always finish.
  You turn on `vertex` (repository variable → deploy env, like `ENFORCE_APP_CHECK` in
  `src/setup.ts`) once the API and IAM role are in place.
- **Nothing at load time.** The `@google/genai` client is created lazily on the first AI move,
  never when the module loads, so deploys and cold starts can't fail on missing config. The
  project id comes from the runtime (`GCLOUD_PROJECT`); model ids are params with defaults.
- **Every failure falls back.** Missing API, permission denied (403), unknown model (404), quota
  (429), timeout, network error, bad JSON, illegal move: all caught in one place in `moveBot`,
  the move is played by the beginner strategy, and the trigger **does not throw** (so `retry: true`
  can't loop on a config error). Errors are logged with `logger.warn`, plus a circuit breaker:
  after a config-type error (403/404) the instance skips Vertex for ~10 minutes, so a missing setup
  doesn't add a timeout to every move.
- **Clients.** Unknown or new `bot` values must render fine: web `model.ts` widens `bot` to
  `string` and treats anything other than `beginner` as an AI bot only if it starts with `ai-`;
  iOS `Player.bot` is already a `String` (old app builds just show the bot without ✨). If the
  server rejects an AI level (e.g. an older backend), the lobby shows the existing error toast via
  `useAction`, no crash. Deploy order: backend before clients (CI already does this for web; for
  iOS, ship after the backend).
- Tests for each of these: provider `off`, client throwing 403/404/429/timeout, garbage answer,
  module import without any env set.

### 7. Setup, docs, privacy
- README "Firebase project setup": an optional step "AI bots": enable the **Vertex AI API**,
  grant the functions' service account `roles/aiplatform.user`, then set `AI_BOT_PROVIDER=vertex`;
  note the model params. Without this step, AI bots play like regular bots.
- PLAN.md: rules table (Bots row), §bots, data model (`bot` values), M7 note.
- `docs/privacy-policy.md` (de + en): games with AI bots send the bot's hand and the table
  (no names or account data) to Google Vertex AI in Frankfurt; Google doesn't train on it.
  Google is already listed as processor.

## Tests / verification
- Unit (`pnpm test` in `backend/functions`): prompt contains no names/uids; schema enum equals the
  legal moves for each phase; parser rejects illegal/garbage answers; fallback path used on
  timeout/illegal answer (fake `AiClient`); `playBots` simulation with a fake AI finishes games
  for 3–6 players. Existing `bots.test.ts` and `triggers.test.ts` keep passing.
- `pnpm lint && pnpm typecheck` in backend and web; `pnpm test` in web.
- Emulator (`pnpm test:emulator`, web `pnpm test:e2e`): add AI bots with `AI_BOT_PROVIDER=off`,
  game completes via fallback.
- Manual against Vertex: a small script (`pnpm tsx scripts/ai-bot-smoke.ts`, uses ADC) that sends
  one prompt per level and prints the move and latency, to tune levels and check cost before
  turning AI bots on in production.
