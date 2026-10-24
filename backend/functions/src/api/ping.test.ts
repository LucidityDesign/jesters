import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { handlePing } from "./ping.js";

describe("handlePing", () => {
  it("rejects unauthenticated callers", () => {
    expect(() => handlePing(undefined, {})).toThrow(HttpsError);
  });

  it("echoes the message for signed-in callers", () => {
    expect(handlePing("u1", { message: "hi" })).toEqual({ ok: true, uid: "u1", echo: "hi" });
  });

  it("accepts an empty request", () => {
    expect(handlePing("u1", null)).toEqual({ ok: true, uid: "u1", echo: null });
  });

  it("rejects invalid input", () => {
    expect(() => handlePing("u1", { message: 42 })).toThrow(HttpsError);
  });
});
