import { describe, expect, it } from "vitest";
import { calendarDateRange, calendarEventToIcs, compactPragueDay, googleCalendarUrl } from "@/lib/calendar-export";
import type { AcademicEvent } from "@/lib/types";

const base: AcademicEvent = { id: "event-1", title: "Výuka", description: "Popis", category: "Výuka", school: "VUT", faculty: "FIT", start: "2026-09-14T00:00:00+02:00", allDay: true, source: "Oficiální zdroj", sourceUrl: "https://www.fit.vut.cz/", updatedAt: "2026-08-02", lastVerifiedAt: "2026-08-02", scope: "faculty", universityId: "vut", facultyId: "vut-fit" };

describe("export akademického kalendáře", () => {
  it("neposune české celodenní datum přes UTC na předchozí den", () => { expect(compactPragueDay(base.start)).toBe("20260914"); expect(calendarEventToIcs(base, "Brno", "2026-08-02T00:00:00Z")).toContain("DTSTART;VALUE=DATE:20260914"); });
  it("jednodenní událost končí exkluzivně následující den", () => { expect(calendarDateRange(base)).toBe("20260914/20260915"); });
  it("rozsah s UI koncem 11. prosince exportuje exkluzivní 12. prosinec", () => { const event = { ...base, end: "2026-12-11T23:59:59+01:00" }; const ics = calendarEventToIcs(event, "Brno", "2026-08-02T00:00:00Z"); expect(ics).toContain("DTSTART;VALUE=DATE:20260914"); expect(ics).toContain("DTEND;VALUE=DATE:20261212"); });
  it("respektuje lokální datum v letním i zimním čase", () => { expect(compactPragueDay("2026-09-13T22:00:00.000Z")).toBe("20260914"); expect(compactPragueDay("2027-01-03T23:00:00.000Z")).toBe("20270104"); });
  it("Google Calendar používá stejný exkluzivní rozsah", () => { const url = new URL(googleCalendarUrl({ ...base, end: "2026-12-11T23:59:59+01:00" })); expect(url.hostname).toBe("calendar.google.com"); expect(url.searchParams.get("dates")).toBe("20260914/20261212"); expect(url.searchParams.get("action")).toBe("TEMPLATE"); });
  it("živý feed drží stabilní UID, verzi, poslední změnu a zrušení", () => {
    const ics = calendarEventToIcs({ ...base, externalId: "stable-fit-teaching", revisionSequence: 3, changeState: "cancelled", updatedAt: "2026-08-22T11:12:13Z" }, "Brno", "2026-08-22T12:00:00Z");
    expect(ics).toContain("UID:stable-fit-teaching@studenthub.cz");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("LAST-MODIFIED:20260822T111213Z");
    expect(ics).toContain("STATUS:CANCELLED");
  });
});
