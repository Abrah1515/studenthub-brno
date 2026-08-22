import { describe, expect, it } from "vitest";
import { statusesForPlace, summarizePlaceLiveReports } from "@/lib/place-live-status";

const now = new Date("2026-08-22T12:00:00Z");
const report = (installationId: string, status: "no_queue" | "short_queue" | "long_queue" | "closed", minutesAgo: number) => ({ installationId, status, reportedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString() });

describe("komunitní živý stav míst", () => {
  it("jeden hlas nevydává za definitivní stav", () => expect(summarizePlaceLiveReports([report("a", "no_queue", 2)], now)).toMatchObject({ code: "unknown", reportCount: 1 }));
  it("váží nová nezávislá hlášení a expiruje je po 60 minutách", () => {
    expect(summarizePlaceLiveReports([report("a", "short_queue", 2), report("b", "short_queue", 8), report("c", "long_queue", 61)], now)).toMatchObject({ code: "short_queue", reportCount: 2, available: true });
  });
  it("počítá jednu instalaci jen jednou a nerozmělňuje oficiální otevírací dobu", () => {
    expect(summarizePlaceLiveReports([report("a", "no_queue", 20), report("a", "long_queue", 1), report("b", "long_queue", 3)], now)).toMatchObject({ code: "long_queue", reportCount: 2 });
    expect(statusesForPlace("Menza")).toEqual(["no_queue", "short_queue", "long_queue", "closed"]);
    expect(statusesForPlace("Kavárna")).toEqual([]);
  });
});
