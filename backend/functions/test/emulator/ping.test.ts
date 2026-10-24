import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, signOut } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { describe, expect, it } from "vitest";

const app = initializeApp({ projectId: "demo-jesters", apiKey: "demo-api-key" });
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const functions = getFunctions(app, "europe-west3");
connectFunctionsEmulator(functions, "127.0.0.1", 5001);
const ping = httpsCallable(functions, "ping");

describe("ping callable", () => {
  it("answers anonymous guests with their uid", async () => {
    const { user } = await signInAnonymously(auth);
    const result = await ping({ message: "hello" });
    expect(result.data).toEqual({ ok: true, uid: user.uid, echo: "hello" });
  });

  it("rejects signed-out callers", async () => {
    await signOut(auth);
    await expect(ping({})).rejects.toMatchObject({ code: "functions/unauthenticated" });
  });
});
