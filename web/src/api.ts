import { signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { type FunctionsError, httpsCallable } from "firebase/functions";
import { firebase } from "./firebase";
import { t } from "./i18n";
import type { Card, Suit } from "./model";

async function call<Response = { ok: true }>(name: string, data: object = {}): Promise<Response> {
  const result = await httpsCallable<object, Response>(firebase().functions, name)(data);
  return result.data;
}

export const api = {
  /** Stores the name, time zone and language, used for reminders at sensible local times. */
  saveProfile: (uid: string, displayName: string) =>
    setDoc(
      doc(firebase().db, "users", uid),
      {
        displayName,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: navigator.language,
      },
      { merge: true },
    ),
  createRoom: (name: string) => call<{ gameId: string; roomKey: string }>("createRoom", { name }),
  joinRoom: (roomKey: string, name: string) =>
    call<{ gameId: string }>("joinRoom", { roomKey, name }),
  updateSettings: (gameId: string, noEvenBids: boolean) =>
    call("updateSettings", { gameId, noEvenBids }),
  startGame: (gameId: string) => call("startGame", { gameId }),
  addBot: (gameId: string) => call("addBot", { gameId, level: "beginner" }),
  removePlayer: (gameId: string, uid: string) => call("removePlayer", { gameId, uid }),
  leaveGame: (gameId: string) => call("leaveGame", { gameId }),
  chooseTrump: (gameId: string, version: number, suit: Suit) =>
    call("chooseTrump", { gameId, version, suit }),
  placeBid: (gameId: string, version: number, bid: number) =>
    call("placeBid", { gameId, version, bid }),
  playCard: (gameId: string, version: number, card: Card) =>
    call("playCard", { gameId, version, card }),
  /** Deletes the guest's data and account on the server, then signs out. */
  deleteMyData: async () => {
    await call("deleteMyData");
    await signOut(firebase().auth);
  },
};

/** The machine-readable reason the backend sends in `HttpsError.details.reason`. */
export function errorReason(error: unknown): string | undefined {
  const details = (error as Partial<FunctionsError> | undefined)?.details;
  return (details as { reason?: string } | undefined)?.reason;
}

const MESSAGES: Record<string, string> = {
  ROOM_NOT_FOUND: "There is no game with this key.",
  GAME_NOT_FOUND: "This game no longer exists.",
  NOT_IN_GAME: "You are not part of this game.",
  NOT_HOST: "Only the host can do that.",
  ALREADY_STARTED: "This game has already started.",
  ROOM_FULL: "This game is full.",
  NOT_ENOUGH_PLAYERS: "At least 3 players are needed.",
  GAME_OVER: "This game is over.",
  STALE_VERSION: "The game changed in the meantime. Please try again.",
  TOO_MANY_GAMES: "You are in too many games. Finish or leave one first.",
  NOT_YOUR_TURN: "It's not your turn.",
  MUST_FOLLOW_SUIT: "You must follow suit.",
  BID_SUM_NOT_ALLOWED: "The total of all bids must not equal the number of cards.",
  INVALID_REQUEST: "Please check your input.",
  INVALID_BID: "Please check your input.",
  INVALID_SUIT: "Please check your input.",
};

/** A message for the player. */
export function errorMessage(error: unknown): string {
  const reason = errorReason(error);
  if (reason && MESSAGES[reason]) return t(MESSAGES[reason]);
  if ((error as Partial<FunctionsError> | undefined)?.code === "functions/unavailable") {
    return t("No connection to the server. Please try again.");
  }
  return t("Something went wrong. Please try again.");
}
