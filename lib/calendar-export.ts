import type { AcademicEvent } from "@/lib/types";

const pragueDateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

function escapeIcs(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function compactUtc(value: string) { return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

export function foldIcsLine(line: string) {
  const chunks: string[] = []; let current = ""; let bytes = 0;
  for (const character of line) { const size = new TextEncoder().encode(character).length; if (bytes + size > 75 && current) { chunks.push(current); current = ` ${character}`; bytes = 1 + size; } else { current += character; bytes += size; } }
  if (current) chunks.push(current); return chunks.join("\r\n");
}

export function compactPragueDay(value: string) {
  const parts = Object.fromEntries(pragueDateFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}${parts.month}${parts.day}`;
}

export function addCalendarDays(day: string, count: number) {
  const date = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)) + count));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function calendarDateRange(event: AcademicEvent) {
  if (!event.allDay) {
    const fallback = new Date(new Date(event.start).getTime() + 3_600_000).toISOString();
    return `${compactUtc(event.start)}/${compactUtc(event.end || fallback)}`;
  }
  const start = compactPragueDay(event.start);
  const inclusiveEnd = compactPragueDay(event.end || event.start);
  return `${start}/${addCalendarDays(inclusiveEnd, 1)}`;
}

export function googleCalendarUrl(event: AcademicEvent, location = "Brno") {
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: calendarDateRange(event), details: `${event.description}\n\nZdroj: ${event.sourceUrl || event.source}`, location })}`;
}

export function calendarEventToIcs(event: AcademicEvent, cityName: string, timestamp = new Date().toISOString()) {
  const [rangeStart, rangeEnd] = calendarDateRange(event).split("/");
  const start = event.allDay ? `DTSTART;VALUE=DATE:${rangeStart}` : `DTSTART:${rangeStart}`;
  const end = event.allDay ? `DTEND;VALUE=DATE:${rangeEnd}` : `DTEND:${rangeEnd}`;
  return ["BEGIN:VEVENT", `UID:${escapeIcs(event.externalId || event.id)}@studenthub.cz`, `DTSTAMP:${compactUtc(timestamp)}`, `LAST-MODIFIED:${compactUtc(event.updatedAt || event.lastVerifiedAt)}`, `SEQUENCE:${Math.max(0, event.revisionSequence || 0)}`, start, end, `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(`${event.description}\n\nZdroj: ${event.sourceUrl || event.source}`)}`, `LOCATION:${escapeIcs(cityName)}`, `URL:${escapeIcs(event.sourceUrl || "")}`, ...(event.changeState === "cancelled" ? ["STATUS:CANCELLED"] : ["STATUS:CONFIRMED"]), "END:VEVENT"].map(foldIcsLine).join("\r\n");
}

export function academicCalendarDocument(events: AcademicEvent[], cityName: string) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//StudentHub ${cityName}//Academic Calendar//CS`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-TIMEZONE:Europe/Prague", `X-WR-CALNAME:${escapeIcs(`StudentHub ${cityName}`)}`, ...events.map((event) => calendarEventToIcs(event, cityName)), "END:VCALENDAR"].map((line) => line.includes("\r\n") ? line : foldIcsLine(line)).join("\r\n");
}
