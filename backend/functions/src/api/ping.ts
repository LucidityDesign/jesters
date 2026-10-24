import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

const PingRequest = z.object({
  message: z.string().max(100).optional(),
});

export interface PingResponse {
  ok: true;
  uid: string;
  echo: string | null;
}

export function handlePing(uid: string | undefined, data: unknown): PingResponse {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const parsed = PingRequest.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid request.");
  }
  return { ok: true, uid, echo: parsed.data.message ?? null };
}

/** Smoke-test endpoint used to verify the app ↔ backend wiring. Removed once real actions exist. */
export const ping = onCall((request) => handlePing(request.auth?.uid, request.data));
