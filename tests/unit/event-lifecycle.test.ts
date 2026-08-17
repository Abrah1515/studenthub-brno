import { describe, expect, it } from "vitest";
import { eventLifecycle, eventTimeRange, partitionAcademicEvents } from "@/lib/event-lifecycle";
import type { AcademicEvent } from "@/lib/types";

function academicEvent(id: string, start: string, end?: string, allDay = true): AcademicEvent {
  return { id, title: id, category: "Ostatní" as AcademicEvent["category"], school: "Test", faculty: "Test", start, end, allDay, source: "Veřejný zdroj", sourceUrl: "https://example.test", updatedAt: "2026-08-17", lastVerifiedAt: "2026-08-17", description: "" };
}

describe("životní cyklus akademické události v Europe/Prague", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  it("rozliší ukončenou, probíhající a budoucí událost při pevném čase", () => { expect(eventLifecycle(academicEvent("ended", "2026-08-16", "2026-08-16"), now)).toBe("ended"); expect(eventLifecycle(academicEvent("ongoing", "2026-05-25", "2026-08-17"), now)).toBe("ongoing"); expect(eventLifecycle(academicEvent("upcoming", "2026-08-18", "2026-08-19"), now)).toBe("upcoming"); });
  it("považuje celé koncové datum za platné v pražském pásmu", () => { const range = eventTimeRange(academicEvent("day", "2026-08-17", "2026-08-17")); expect(new Date(range.end).toISOString()).toBe("2026-08-17T21:59:59.999Z"); });
  it("řadí probíhající před budoucími a minulost drží v archivu", () => { const result = partitionAcademicEvents([academicEvent("later", "2026-09-10"), academicEvent("ended", "2026-08-01"), academicEvent("ongoing", "2026-08-01", "2026-08-30"), academicEvent("nearest", "2026-08-18")], now); expect(result.ongoing.map((item) => item.id)).toEqual(["ongoing"]); expect(result.upcoming.map((item) => item.id)).toEqual(["nearest", "later"]); expect(result.ended.map((item) => item.id)).toEqual(["ended"]); });
});
