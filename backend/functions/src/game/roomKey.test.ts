import { describe, expect, it } from "vitest";
import { seededRandom } from "../../test/helpers.js";
import { generateRoomKey, normalizeRoomKey, ROOM_KEY_ALPHABET } from "./roomKey.js";

describe("generateRoomKey", () => {
  it("creates 6 characters from the unambiguous alphabet", () => {
    const rng = seededRandom(9);
    for (let i = 0; i < 100; i++) {
      const key = generateRoomKey(rng);
      expect(key).toMatch(/^[A-Z2-9]{6}$/);
      expect([...key].every((char) => ROOM_KEY_ALPHABET.includes(char))).toBe(true);
      expect(key).not.toMatch(/[01OIL]/);
    }
  });
});

describe("normalizeRoomKey", () => {
  it.each([
    ["K7Q2XM", "K7Q2XM"],
    ["k7q2xm", "K7Q2XM"],
    [" K7Q-2XM ", "K7Q2XM"],
    ["K7Q 2XM", "K7Q2XM"],
  ])("accepts %j", (input, key) => {
    expect(normalizeRoomKey(input)).toBe(key);
  });

  it.each(["", "K7Q2X", "K7Q2XMM", "K7Q2X0", "K7Q2XI", "K7Q2X!"])("rejects %j", (input) => {
    expect(normalizeRoomKey(input)).toBeNull();
  });
});
