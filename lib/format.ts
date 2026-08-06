const pragueTimeZone = "Europe/Prague";
const dateFormatter = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long", year: "numeric", timeZone: pragueTimeZone });
const shortDateFormatter = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "short", timeZone: pragueTimeZone });
const dayNumberFormatter = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", timeZone: pragueTimeZone });
const shortMonthFormatter = new Intl.DateTimeFormat("cs-CZ", { month: "short", timeZone: pragueTimeZone });
const pragueTimestampFormatter = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: pragueTimeZone, timeZoneName: "short" });

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export function formatShortDate(value: string) {
  return shortDateFormatter.format(new Date(value));
}

export function formatPragueTimestamp(value: string) { return pragueTimestampFormatter.format(new Date(value)); }

export function formatDayNumber(value: string) {
  return dayNumberFormatter.formatToParts(new Date(value)).find((part) => part.type === "day")?.value || "";
}

export function formatShortMonth(value: string) {
  return shortMonthFormatter.format(new Date(value));
}

export function daysUntil(value: string, now = new Date()) {
  const target = new Date(value);
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86_400_000));
}

export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
