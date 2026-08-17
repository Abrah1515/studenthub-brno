import type { AcademicEvent } from "@/lib/types";

export type EventLifecycle = "ended" | "ongoing" | "upcoming";

const pragueTimeZone = "Europe/Prague";

function pragueOffsetMs(timestamp: number) {
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: pragueTimeZone,
    timeZoneName: "longOffset",
  }).formatToParts(new Date(timestamp)).find((part) => part.type === "timeZoneName")?.value;
  const match = offset?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const value = (Number(match[2]) * 60 + Number(match[3])) * 60_000;
  return match[1] === "+" ? value : -value;
}

function localPragueTimestamp(value: string, endOfDay: boolean) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (!match) return Number.NaN;
  const hasTime = match[4] !== undefined;
  const hour = hasTime ? Number(match[4]) : endOfDay ? 23 : 0;
  const minute = hasTime ? Number(match[5]) : endOfDay ? 59 : 0;
  const second = hasTime ? Number(match[6] || 0) : endOfDay ? 59 : 0;
  const millisecond = hasTime ? Number((match[7] || "0").padEnd(3, "0")) : endOfDay ? 999 : 0;
  const wallClockUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute, second, millisecond);
  let timestamp = wallClockUtc - pragueOffsetMs(wallClockUtc);
  timestamp = wallClockUtc - pragueOffsetMs(timestamp);
  return timestamp;
}

export function eventTimestamp(value: string, endOfDay = false) {
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(value)) return localPragueTimestamp(value, endOfDay);
  return new Date(value).getTime();
}

export function eventTimeRange(event: Pick<AcademicEvent, "start" | "end" | "allDay">) {
  const start = eventTimestamp(event.start);
  const endValue = event.end || event.start;
  const end = eventTimestamp(endValue, Boolean(event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(endValue)));
  return { start, end: Number.isFinite(end) ? Math.max(start, end) : start };
}

export function eventLifecycle(event: Pick<AcademicEvent, "start" | "end" | "allDay">, now = new Date()): EventLifecycle {
  const range = eventTimeRange(event);
  const current = now.getTime();
  if (range.end < current) return "ended";
  if (range.start <= current) return "ongoing";
  return "upcoming";
}

export function eventLifecycleLabel(status: EventLifecycle) {
  if (status === "ongoing") return "Právě probíhá";
  if (status === "upcoming") return "Nadcházející";
  return "Ukončeno";
}

export function partitionAcademicEvents(events: AcademicEvent[], now = new Date()) {
  const ongoing: AcademicEvent[] = [];
  const upcoming: AcademicEvent[] = [];
  const ended: AcademicEvent[] = [];
  for (const event of events) {
    const lifecycle = eventLifecycle(event, now);
    if (lifecycle === "ongoing") ongoing.push(event);
    else if (lifecycle === "upcoming") upcoming.push(event);
    else ended.push(event);
  }
  ongoing.sort((a, b) => eventTimeRange(a).end - eventTimeRange(b).end);
  upcoming.sort((a, b) => eventTimeRange(a).start - eventTimeRange(b).start);
  ended.sort((a, b) => eventTimeRange(b).end - eventTimeRange(a).end);
  return { ongoing, upcoming, ended };
}

export function relevantAcademicEvents(events: AcademicEvent[], now = new Date()) {
  const { ongoing, upcoming } = partitionAcademicEvents(events, now);
  return [...ongoing, ...upcoming];
}
