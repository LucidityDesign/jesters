import type { RandomInt } from "../engine/index.js";

/** No 0/O, 1/I/L: keys are read aloud and typed on phones. */
export const ROOM_KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_KEY_LENGTH = 6;

const ROOM_KEY_PATTERN = new RegExp(`^[${ROOM_KEY_ALPHABET}]{${ROOM_KEY_LENGTH}}$`);

export function generateRoomKey(randomInt: RandomInt): string {
  let key = "";
  for (let i = 0; i < ROOM_KEY_LENGTH; i++) {
    key += ROOM_KEY_ALPHABET[randomInt(ROOM_KEY_ALPHABET.length)];
  }
  return key;
}

/** Uppercases and strips spaces and dashes; `null` if the result is not a valid key. */
export function normalizeRoomKey(input: string): string | null {
  const key = input.toUpperCase().replace(/[\s-]/g, "");
  return ROOM_KEY_PATTERN.test(key) ? key : null;
}
