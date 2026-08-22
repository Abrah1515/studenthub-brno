import { describe, expect, it } from "vitest";
import { dueReminderDay } from "@/lib/watcher-reminder-time";

describe("výběr upozornění Hlídače", () => {
  it("vybere jednotlivé prahy bez předčasného upozornění", () => {
    const start = "2026-09-14T10:00:00+02:00";
    expect(dueReminderDay(start, [7, 3, 1, 0], new Date("2026-09-07T11:00:00+02:00"))).toBe(7);
    expect(dueReminderDay(start, [7, 3, 1, 0], new Date("2026-09-11T11:00:00+02:00"))).toBe(3);
    expect(dueReminderDay(start, [7, 3, 1, 0], new Date("2026-09-13T11:00:00+02:00"))).toBe(1);
  });

  it("použije den události podle Europe/Prague i po půlnoci", () => {
    expect(dueReminderDay("2026-09-14T00:00:00+02:00", [0], new Date("2026-09-14T08:00:00+02:00"))).toBe(0);
    expect(dueReminderDay("2026-09-14T00:00:00+02:00", [0], new Date("2026-09-15T00:01:00+02:00"))).toBeUndefined();
  });
});
