import { z } from "zod";
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

export const UpdateSettingsInput = z.object({ gameId: GameId, noEvenBids: z.boolean() });

export const RemovePlayerInput = z.object({ gameId: GameId, uid: z.string().min(1).max(128) });

export const ChooseTrumpInput = z.object({ gameId: GameId, version: Version, suit: z.enum(SUITS) });

export const PlaceBidInput = z.object({
  gameId: GameId,
  version: Version,
  bid: z.number().int().min(0).max(20),
});

export const PlayCardInput = z.object({
  gameId: GameId,
  version: Version,
  card: z.custom<Card>(isCard, "Invalid card."),
});
