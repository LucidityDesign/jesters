import { describe, expect, it } from "vitest";
import { localHour, reminderDue } from "./reminders.js";

const HOUR = 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);
const ts = (date: Date) => ({ toMillis: () => date.getTime() });

describe("localHour", () => {
  it("uses the player's time zone, including daylight saving time", () => {
    expect(localHour(at("2026-07-01T12:00:00Z"), "Europe/Berlin")).toBe(14);
    expect(localHour(at("2026-12-01T12:00:00Z"), "Europe/Berlin")).toBe(13);
    expect(localHour(at("2026-07-01T12:00:00Z"), "Europe/London")).toBe(13);
    expect(localHour(at("2026-07-01T12:00:00Z"), "Europe/Helsinki")).toBe(15);
  });

  it("falls back to Europe/Berlin", () => {
    expect(localHour(at("2026-07-01T12:00:00Z"), undefined)).toBe(14);
    expect(localHour(at("2026-07-01T12:00:00Z"), "Not/AZone")).toBe(14);
  });
});

describe("reminderDue", () => {
  // 10:00 in Berlin (summer time).
  const now = at("2026-07-01T08:00:00Z");
  const waiting = (hours: number, lastReminderHoursAgo?: number) => ({
    active: true,
    turnUid: "b",
    turnSince: ts(new Date(now.getTime() - hours * HOUR)),
    ...(lastReminderHoursAgo === undefined
      ? {}
      : { lastReminderAt: ts(new Date(now.getTime() - lastReminderHoursAgo * HOUR)) }),
  });

  it("reminds once a turn has waited a day", () => {
    expect(reminderDue(waiting(23), now, "Europe/Berlin")).toBe(false);
    expect(reminderDue(waiting(25), now, "Europe/Berlin")).toBe(true);
  });

  it("reminds again only about a day later", () => {
    expect(reminderDue(waiting(30, 6), now, "Europe/Berlin")).toBe(false);
    expect(reminderDue(waiting(49, 24), now, "Europe/Berlin")).toBe(true);
  });

  it("ignores a reminder sent for an earlier turn", () => {
    expect(reminderDue(waiting(25, 26), now, "Europe/Berlin")).toBe(true);
  });

  it("respects the player's night time", () => {
    // 08:00 UTC is 03:00 in New York and 17:00 in Tokyo.
    expect(reminderDue(waiting(25), now, "America/New_York")).toBe(false);
    expect(reminderDue(waiting(25), now, "Asia/Tokyo")).toBe(true);
    expect(reminderDue(waiting(25), at("2026-07-01T19:30:00Z"), "Europe/Berlin")).toBe(false);
  });

  it("skips finished games and games without a turn", () => {
    expect(reminderDue({ ...waiting(25), active: false }, now, "Europe/Berlin")).toBe(false);
    expect(reminderDue({ ...waiting(25), turnUid: null }, now, "Europe/Berlin")).toBe(false);
    expect(reminderDue({ ...waiting(25), turnSince: null }, now, "Europe/Berlin")).toBe(false);
  });
});
