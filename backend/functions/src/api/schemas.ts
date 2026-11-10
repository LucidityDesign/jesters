import { z } from "zod";
import { BOT_LEVELS, normalizeLevel } from "../bots/index.js";
import { type Card, isCard, SUITS } from "../engine/index.js";

export const PlayerName = z
  .string()
  .trim()
  .min(1, "Name is empty.")
  .max(24, "Name is too long.")
  .regex(/^[^\p{Cc}\p{Cf}]+$/u, "Name contains invalid characters.");

const GameId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9]+$/, "Invalid game id.");

/** Optional: the game version the client saw. If set and outdated, the action is rejected. */
const Version = z.number().int().nonnegative().optional();

export const CreateRoomInput = z.object({
  name: PlayerName,
  settings: z.object({ noEvenBids: z.boolean().default(true) }).default({ noEvenBids: true }),
});

export const JoinRoomInput = z.object({
  roomKey: z.string().max(20),
  name: PlayerName,
});

export const GameInput = z.object({ gameId: GameId });

export const UpdateSettingsInput = z.object({
  gameId: GameId,
  noEvenBids: z.boolean().optional(),
  stallPenalty: z.boolean().optional(),
  blindFirstRound: z.boolean().optional(),
});

export const AddBotInput = z.object({
  gameId: GameId,
  // Older app versions send "beginner", which plays as easy now.
  level: z
    .preprocess(
      (level) => (typeof level === "string" ? (normalizeLevel(level) ?? level) : level),
      z.enum(BOT_LEVELS),
    )
    .default("easy"),
});

export const RemovePlayerInput = z.object({ gameId: GameId, uid: z.string().min(1).max(128) });

export const ChooseTrumpInput = z.object({ gameId: GameId, version: Version, suit: z.enum(SUITS) });

export const PlaceBidInput = z.object({
  gameId: GameId,
  version: Version,
  bid: z.number().int().min(0).max(20),
});

export const QueueBidInput = z.object({
  gameId: GameId,
  /** `null` clears the queued bid. */
  bid: z.number().int().min(0).max(20).nullable(),
});

/** A card, or `"hidden"` for the player's own card they can't see (see `blindFirstRound`). */
const CardOrHidden = z.union([z.custom<Card>(isCard, "Invalid card."), z.literal("hidden")]);

export const QueueCardInput = z.object({
  gameId: GameId,
  /** `null` clears the queued card. */
  card: CardOrHidden.nullable(),
});

export const PlayCardInput = z.object({
  gameId: GameId,
  version: Version,
  card: CardOrHidden,
});

/** How long auto-play may last: some minutes or some rounds, never open-ended. */
export const AUTO_PLAY_MINUTES = [5, 10, 30] as const;
export const AUTO_PLAY_ROUNDS = [1, 2, 3] as const;

/**
 * Auto-play on or off. Switching it on takes exactly one limit: `minutes`, or `rounds` rounds
 * counting the current one.
 */
export const SetAutoPlayInput = z
  .object({
    gameId: GameId,
    on: z.boolean(),
    minutes: z.union(AUTO_PLAY_MINUTES.map((minutes) => z.literal(minutes))).optional(),
    rounds: z.union(AUTO_PLAY_ROUNDS.map((rounds) => z.literal(rounds))).optional(),
  })
  .refine((input) => !input.on || (input.minutes === undefined) !== (input.rounds === undefined), {
    message: "Choose minutes or rounds.",
  });

export const LetBotMoveInput = z.object({
  gameId: GameId,
  version: z.number().int().nonnegative(),
});

/** The actions `gameAction` makes in a running game. */
export const GAME_ACTION_NAMES = [
  "chooseTrump",
  "placeBid",
  "queueBid",
  "queueCard",
  "playCard",
  "setAutoPlay",
  "letBotMove",
] as const;
export type GameActionName = (typeof GAME_ACTION_NAMES)[number];

/** Which action, plus that action's own input (checked by the action). */
export const GameActionInput = z.looseObject({ action: z.enum(GAME_ACTION_NAMES) });

export const RedeemTransferCodeInput = z.object({ code: z.string().max(32) });
