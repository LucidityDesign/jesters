import type { GameDoc } from "../game/model.js";

const HOUR = 60 * 60 * 1000;

/** A turn waiting this long gets its first reminder. */
export const REMINDER_AFTER_MS = 24 * HOUR;
/** Minimum gap between reminders; a little under a day so the hourly job keeps the same time of day. */
export const REMINDER_INTERVAL_MS = 23 * HOUR;
/** Reminders are sent only between these hours in the player's own time zone. */
export const QUIET_HOURS_END = 9;
export const QUIET_HOURS_START = 21;
/** Games without any change for this long are closed. */
export const EXPIRE_AFTER_MS = 14 * 24 * HOUR;

export const DEFAULT_TIME_ZONE = "Europe/Berlin";

/** The hour (0–23) at `date` in `timeZone`; falls back to Europe/Berlin for unknown zones. */
export function localHour(date: Date, timeZone: string | undefined): number {
  const format = (zone: string) =>
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(date),
    );
  try {
    return format(timeZone ?? DEFAULT_TIME_ZONE);
  } catch {
    return format(DEFAULT_TIME_ZONE);
  }
}

/** Whether the player whose turn it is should get a reminder now. */
export function reminderDue(
  game: Pick<GameDoc, "active" | "turnUid"> & {
    turnSince: { toMillis(): number } | null;
    lastReminderAt?: { toMillis(): number };
  },
  now: Date,
  timeZone: string | undefined,
): boolean {
  if (!game.active || game.turnUid === null || game.turnSince === null) return false;
  const turnSince = game.turnSince.toMillis();
  if (now.getTime() - turnSince < REMINDER_AFTER_MS) return false;

  const last = game.lastReminderAt?.toMillis();
  // A reminder sent for an earlier turn does not count.
  if (last !== undefined && last >= turnSince && now.getTime() - last < REMINDER_INTERVAL_MS) {
    return false;
  }
  const hour = localHour(now, timeZone);
  return hour >= QUIET_HOURS_END && hour < QUIET_HOURS_START;
}
