import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newPlayers, setUpRoom } from "./client.js";

interface Game {
  status: string;
  hostUid: string;
  players: { uid: string; name: string }[];
  playerUids: string[];
  active: boolean;
  abandonedBy?: string;
}

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-jesters" });
});

afterAll(async () => {
  await env.cleanup();
});

/** Whether a document exists, read without security rules. */
async function exists(path: string): Promise<boolean> {
  let found = false;
  await env.withSecurityRulesDisabled(async (context) => {
    found = (await getDoc(doc(context.firestore(), path))).exists();
  });
  return found;
}

describe("deleteMyData", () => {
  it("leaves games, removes the name and deletes the profile", async () => {
    const [anna, ben, cleo, dave] = await newPlayers("Anna", "Ben", "Cleo", "Dave");
    await setDoc(doc(anna.db, `users/${anna.uid}`), { displayName: "Anna" });

    const running = await setUpRoom([anna, ben, cleo]);
    await anna.call("startGame", { gameId: running.gameId });
    const lobby = await setUpRoom([anna, dave]);
    expect(await exists(`games/${running.gameId}/hands/${anna.uid}`)).toBe(true);
    const reaction = `games/${running.gameId}/reactions/${anna.uid}`;
    await setDoc(doc(anna.db, reaction), { emoji: "🎉", at: serverTimestamp(), nonce: "n1" });
    expect(await exists(reaction)).toBe(true);

    await anna.call("deleteMyData");

    const ended = (await ben.read<Game>(`games/${running.gameId}`)) as Game;
    expect(ended).toMatchObject({ status: "abandoned", active: false, abandonedBy: anna.uid });
    expect(ended.players.map((player) => player.name)).toEqual(["", "Ben", "Cleo"]);
    expect(await exists(`games/${running.gameId}/hands/${anna.uid}`)).toBe(false);
    expect(await exists(`games/${running.gameId}/hands/${ben.uid}`)).toBe(true);
    expect(await exists(reaction)).toBe(false);

    const room = (await dave.read<Game>(`games/${lobby.gameId}`)) as Game;
    expect(room).toMatchObject({ hostUid: dave.uid, playerUids: [dave.uid], status: "lobby" });

    expect(await exists(`users/${anna.uid}`)).toBe(false);
  });
});
