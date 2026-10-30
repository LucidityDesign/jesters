import { type FunctionsErrorCode, HttpsError } from "firebase-functions/v2/https";
import type { z } from "zod";
import type { EngineError } from "../engine/index.js";

/** Machine-readable reasons, sent to the app in `HttpsError.details.reason`. */
export type ErrorReason =
  | EngineError
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "GAME_NOT_FOUND"
  | "NOT_IN_GAME"
  | "NOT_HOST"
  | "ALREADY_STARTED"
  | "ROOM_FULL"
  | "NOT_ENOUGH_PLAYERS"
  | "GAME_OVER"
  | "STALE_VERSION"
  | "TOO_MANY_GAMES"
  | "TRANSFER_CODE_INVALID";

const STATUS: Record<ErrorReason, FunctionsErrorCode> = {
  WRONG_PHASE: "failed-precondition",
  NOT_YOUR_TURN: "failed-precondition",
  INVALID_SUIT: "invalid-argument",
  INVALID_BID: "invalid-argument",
  BID_SUM_NOT_ALLOWED: "failed-precondition",
  CARD_NOT_IN_HAND: "failed-precondition",
  MUST_FOLLOW_SUIT: "failed-precondition",
  INVALID_REQUEST: "invalid-argument",
  ROOM_NOT_FOUND: "not-found",
  GAME_NOT_FOUND: "not-found",
  NOT_IN_GAME: "permission-denied",
  NOT_HOST: "permission-denied",
  ALREADY_STARTED: "failed-precondition",
  ROOM_FULL: "resource-exhausted",
  NOT_ENOUGH_PLAYERS: "failed-precondition",
  GAME_OVER: "failed-precondition",
  STALE_VERSION: "aborted",
  TOO_MANY_GAMES: "resource-exhausted",
  TRANSFER_CODE_INVALID: "not-found",
};

export function fail(reason: ErrorReason, message: string = reason): never {
  throw new HttpsError(STATUS[reason], message, { reason });
}

export function requireAuth(auth: { uid: string } | undefined): string {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  return auth.uid;
}

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    fail("INVALID_REQUEST", result.error.issues[0]?.message ?? "Invalid request.");
  }
  return result.data;
}
