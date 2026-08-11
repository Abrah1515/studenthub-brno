import { describe, expect, it } from "vitest";
import { eventFreshness } from "@/lib/event-freshness";

describe("stav aktuálnosti akademické události", () => {
  const now = new Date("2026-08-12T10:00:00Z");

  it("označí výsledek posledního devítihodinového běhu jako aktuální", () => {
    expect(eventFreshness("2026-08-12T01:30:00Z", now)).toEqual({ label: "Aktuální", tone: "fresh" });
  });

  it("rozliší čekání na další kontrolu a staré ověření", () => {
    expect(eventFreshness("2026-08-10T10:00:00Z", now).tone).toBe("waiting");
    expect(eventFreshness("2026-08-08T10:00:00Z", now)).toEqual({ label: "Starší ověření", tone: "stale" });
  });
});
