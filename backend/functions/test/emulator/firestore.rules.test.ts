import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-jesters",
    firestore: { rules: readFileSync("../firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "games/rules-g1"), { playerUids: ["alice", "bob"], status: "bidding" });
    await setDoc(doc(db, "games/rules-g1/hands/alice"), { cards: ["H14"] });
    await setDoc(doc(db, "games/rules-g1/hands/bob"), { cards: ["S2"] });
    await setDoc(doc(db, "games/rules-g1/secret/state"), { state: "{}" });
    await setDoc(doc(db, "roomKeys/ABCDEF"), { gameId: "rules-g1" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("games", () => {
  it("are readable by their players only", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "games/rules-g1")));
    await assertFails(getDoc(doc(as("mallory"), "games/rules-g1")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "games/rules-g1")));
  });

  it("can be listed only with a query for one's own games", async () => {
    const games = collection(as("alice"), "games");
    await assertSucceeds(getDocs(query(games, where("playerUids", "array-contains", "alice"))));
    await assertFails(getDocs(games));
    await assertFails(getDocs(query(games, where("playerUids", "array-contains", "bob"))));
  });

  it("cannot be written by clients", async () => {
    await assertFails(updateDoc(doc(as("alice"), "games/rules-g1"), { status: "finished" }));
    await assertFails(setDoc(doc(as("alice"), "games/new"), { playerUids: ["alice"] }));
    await assertFails(deleteDoc(doc(as("alice"), "games/rules-g1")));
  });
});

describe("hands", () => {
  it("are readable only by their owner", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "games/rules-g1/hands/alice")));
    await assertFails(getDoc(doc(as("alice"), "games/rules-g1/hands/bob")));
    await assertFails(getDocs(collection(as("alice"), "games/rules-g1/hands")));
  });

  it("cannot be written by clients", async () => {
    await assertFails(setDoc(doc(as("alice"), "games/rules-g1/hands/alice"), { cards: ["W1"] }));
  });
});

describe("reactions", () => {
  const react = (uid: string, emoji = "👍", game = "rules-g1") =>
    setDoc(doc(as(uid), `games/${game}/reactions/${uid}`), {
      emoji,
      at: serverTimestamp(),
      nonce: "abc",
    });

  it("can be sent by players, at most one per second", async () => {
    await assertSucceeds(react("bob"));
    await assertFails(react("bob", "🎉"));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "games/rules-g1/reactions/bob"), {
        at: Timestamp.fromMillis(Date.now() - 2000),
      });
    });
    // Also emojis made of several characters.
    await assertSucceeds(react("bob", "😮‍💨"));
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "games/rules-g1/reactions/bob"), {
        at: Timestamp.fromMillis(Date.now() - 2000),
      });
    });
    // ❤️ with its emoji variation selector, as the picker sends it.
    await assertSucceeds(react("bob", "❤️"));
  });

  it("are readable by the game's players only", async () => {
    await assertSucceeds(getDocs(collection(as("alice"), "games/rules-g1/reactions")));
    await assertFails(getDocs(collection(as("mallory"), "games/rules-g1/reactions")));
  });

  it("reject other players, games, emojis, fields and times", async () => {
    await assertFails(react("mallory"));
    await assertFails(
      setDoc(doc(as("alice"), "games/rules-g1/reactions/bob"), {
        emoji: "👍",
        at: serverTimestamp(),
        nonce: "abc",
      }),
    );
    await assertFails(react("alice", "💩"));
    await assertFails(react("alice", "👍", "missing"));
    const mine = doc(as("alice"), "games/rules-g1/reactions/alice");
    await assertFails(setDoc(mine, { emoji: "👍", at: Timestamp.now(), nonce: "abc" }));
    await assertFails(setDoc(mine, { emoji: "👍", at: serverTimestamp(), nonce: "abc", x: 1 }));
    await assertFails(setDoc(mine, { emoji: "👍", at: serverTimestamp(), nonce: "" }));
    await assertFails(deleteDoc(doc(as("bob"), "games/rules-g1/reactions/bob")));
  });
});

describe("secret state, room keys and transfer codes", () => {
  it("are never readable by clients", async () => {
    await assertFails(getDoc(doc(as("alice"), "games/rules-g1/secret/state")));
    await assertFails(getDoc(doc(as("alice"), "roomKeys/ABCDEF")));
    await assertFails(getDoc(doc(as("alice"), "transferCodes/abc")));
    await assertFails(getDocs(collection(as("alice"), "transferCodes")));
    await assertFails(getDocs(collection(as("alice"), "roomKeys")));
  });
});

describe("users", () => {
  it("lets players write their own profile fields", async () => {
    const profile = doc(as("alice"), "users/alice");
    await assertSucceeds(
      setDoc(profile, { displayName: "Alice", timeZone: "Europe/Berlin", locale: "de-DE" }),
    );
    await assertSucceeds(getDoc(profile));
    await assertSucceeds(updateDoc(profile, { fcmTokens: ["token"] }));
  });

  it("rejects other fields, invalid values and other users", async () => {
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { displayName: "A", admin: true }));
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { displayName: "" }));
    await assertFails(setDoc(doc(as("alice"), "users/bob"), { displayName: "Bob" }));
    await assertFails(getDoc(doc(as("alice"), "users/bob")));
  });
});
