import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import type { RandomInt } from "../engine/index.js";
import { ROOM_KEY_ALPHABET } from "../game/roomKey.js";
import { secureRandomInt } from "../game/store.js";
import { CALLABLE } from "../setup.js";
import { fail, parse, requireAuth } from "./errors.js";
import { RedeemTransferCodeInput } from "./schemas.js";

// Moving a guest to another device: the old device shows a short code, the new one enters it and
// signs in as the same guest. Codes are single-use and short-lived; only their hash is stored.

export const TRANSFER_CODE_LENGTH = 8;
export const TRANSFER_CODE_TTL_MS = 10 * 60 * 1000;

const TRANSFER_CODE_PATTERN = new RegExp(`^[${ROOM_KEY_ALPHABET}]{${TRANSFER_CODE_LENGTH}}$`);

/** `transferCodes/{sha256 of the code}`: not readable by clients. */
export interface TransferCodeDoc {
  uid: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export function generateTransferCode(randomInt: RandomInt): string {
  let code = "";
  for (let i = 0; i < TRANSFER_CODE_LENGTH; i++) {
    code += ROOM_KEY_ALPHABET[randomInt(ROOM_KEY_ALPHABET.length)];
  }
  return code;
}

/** Uppercases and strips spaces and dashes; `null` if the result can't be a code. */
export function normalizeTransferCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return TRANSFER_CODE_PATTERN.test(code) ? code : null;
}

export const transferCodes = () => getFirestore().collection("transferCodes");

const transferCodeRef = (code: string) =>
  transferCodes().doc(createHash("sha256").update(code).digest("hex"));

/** Deletes the codes `uid` asked for (one is valid at a time). */
export async function deleteTransferCodes(uid: string): Promise<void> {
  const codes = await transferCodes().where("uid", "==", uid).get();
  await Promise.all(codes.docs.map((code) => code.ref.delete()));
}

/** A new code for the caller to enter on their other device; earlier ones stop working. */
export const createTransferCode = onCall(CALLABLE, async (request) => {
  const uid = requireAuth(request.auth);
  await deleteTransferCodes(uid);
  const code = generateTransferCode(secureRandomInt);
  const expiresAt = Timestamp.fromMillis(Date.now() + TRANSFER_CODE_TTL_MS);
  const data: TransferCodeDoc = { uid, createdAt: Timestamp.now(), expiresAt };
  await transferCodeRef(code).set(data);
  return { code, expiresAt: expiresAt.toMillis() };
});

/**
 * Signs the caller's device in as the guest who asked for `code`: returns a sign-in token for that
 * guest and their name. The code is used up.
 */
export const redeemTransferCode = onCall(CALLABLE, async (request) => {
  requireAuth(request.auth);
  const input = parse(RedeemTransferCodeInput, request.data);
  const code = normalizeTransferCode(input.code);
  if (!code) fail("TRANSFER_CODE_INVALID", "This code is wrong or has expired.");

  const ref = transferCodeRef(code);
  const found = (await ref.get()).data() as TransferCodeDoc | undefined;
  if (!found || found.expiresAt.toMillis() <= Date.now()) {
    fail("TRANSFER_CODE_INVALID", "This code is wrong or has expired.");
  }
  // The token first: if it can't be made, the code stays usable for another try.
  const token = await getAuth().createCustomToken(found.uid);
  await getFirestore().runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as TransferCodeDoc | undefined;
    if (current?.uid !== found.uid) fail("TRANSFER_CODE_INVALID", "This code was used already.");
    tx.delete(ref);
  });
  const profile = (await getFirestore().doc(`users/${found.uid}`).get()).data();
  const displayName = typeof profile?.displayName === "string" ? profile.displayName : null;
  return { token, displayName };
});
