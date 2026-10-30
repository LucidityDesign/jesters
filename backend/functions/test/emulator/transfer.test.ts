import { signInWithCustomToken } from "firebase/auth";
import { describe, expect, it } from "vitest";
import { newPlayers, rejection, setUpRoom } from "./client.js";

describe("transfer codes", () => {
  it("move a guest to another device, once", async () => {
    const [anna, newDevice] = await newPlayers("Anna", "New device");
    const { gameId } = await setUpRoom([anna]);
    await anna.call("createTransferCode");
    const { code, expiresAt } = await anna.call<{ code: string; expiresAt: number }>(
      "createTransferCode",
    );
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(expiresAt).toBeGreaterThan(Date.now() + 9 * 60_000);

    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    const { token } = await newDevice.call<{ token: string; displayName: string | null }>(
      "redeemTransferCode",
      { code: typed },
    );
    const { user } = await signInWithCustomToken(newDevice.auth, token);
    expect(user.uid).toBe(anna.uid);
    expect(await newDevice.read(`games/${gameId}`)).toMatchObject({ playerUids: [anna.uid] });

    // Used up; a wrong code doesn't work either.
    expect(await rejection(newDevice.call("redeemTransferCode", { code }))).toBe(
      "TRANSFER_CODE_INVALID",
    );
    expect(await rejection(newDevice.call("redeemTransferCode", { code: "AAAA-AAAA" }))).toBe(
      "TRANSFER_CODE_INVALID",
    );
    expect(await rejection(newDevice.call("redeemTransferCode", { code: "nope" }))).toBe(
      "TRANSFER_CODE_INVALID",
    );
  });

  it("stop working when a new one is made", async () => {
    const [anna, newDevice] = await newPlayers("Anna", "New device");
    const first = await anna.call<{ code: string }>("createTransferCode");
    await anna.call("createTransferCode");
    expect(await rejection(newDevice.call("redeemTransferCode", { code: first.code }))).toBe(
      "TRANSFER_CODE_INVALID",
    );
  });
});
