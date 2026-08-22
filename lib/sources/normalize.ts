import type { EventCategory } from "@/lib/types";
import type { NormalizedEvent } from "@/lib/sources/types";

const czechMonths: Record<string, number> = { leden: 1, ledna: 1, únor: 2, února: 2, březen: 3, března: 3, duben: 4, dubna: 4, květen: 5, května: 5, červen: 6, června: 6, červenec: 7, července: 7, srpen: 8, srpna: 8, září: 9, říjen: 10, října: 10, listopad: 11, listopadu: 11, prosinec: 12, prosince: 12 };

export function inferCategory(value: string): EventCategory {
  const text = value.toLocaleLowerCase("cs-CZ");
  const folded = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (/zmen.*zapis/.test(folded)) return "Změny zápisu";
  if (/seminar.*skup|rozvrhov.*seminar/.test(folded)) return "Zápis do seminárních skupin";
  if (/prihl.*(?:statni.*zkou|szz)/.test(folded)) return "Přihlášky ke státním zkouškám";
  if (/(?:dekansk|rektorsk).*voln/.test(folded)) return "Děkanské a rektorské volno";
  if (/zverejnen.*rozvrh/.test(folded)) return "Zveřejnění rozvrhu";
  if (/registrac/.test(folded)) return "Registrace předmětů";
  if (/statni.*zkou|szz/.test(folded)) return "Státní závěrečné zkoušky";
  if (/zkou.?kov/.test(folded)) return "Zkouškové období";
  if (/odevzd.*(prac|bakal|diplom)/.test(folded)) return "Odevzdání závěrečných prací";
  if (/prazdnin|studijni volno/.test(folded)) return "Prázdniny";
  if (/imatrikul/.test(folded)) return "Imatrikulace";
  if (/promoc/.test(folded)) return "Promoce";
  if (/praxe|praktick.*vyuka|internship/.test(folded)) return "Praxe";
  if (/začátek|zahájení/.test(text) && /semestr|akademick/.test(text)) return "Začátek semestru";
  if (/konec|ukončení|poslední den/.test(text) && /semestr|výuk/.test(text)) return "Konec semestru";
  if (/změn.*zápis/.test(text)) return "Změny zápisu";
  if (/zveřejnění.*rozvrh/.test(text)) return "Zveřejnění rozvrhu";
  if (/registrac/.test(text)) return "Registrace předmětů";
  if (/zápis/.test(text)) return "Zápis předmětů";
  if (/zkouškov/.test(text)) return "Zkouškové období";
  if (/státní.*zkouš|szz/.test(text)) return "Státní závěrečné zkoušky";
  if (/odevzd.*(prác|bakalář|diplom)/.test(text)) return "Odevzdání závěrečných prací";
  if (/prázdnin|studijní volno/.test(text)) return "Prázdniny";
  if (/imatrikul/.test(text)) return "Imatrikulace";
  if (/promoc/.test(text)) return "Promoce";
  if (/praxe|praktick[aáé] výuka|internship/.test(text)) return "Praxe";
  if (/v.?uka|teaching/.test(folded)) return "Výuka";
  if (/výuk|teaching/.test(text)) return "Výuka";
  if (/koncert|konferenc|workshop|seminář|festival|akce/.test(text)) return "Fakultní akce";
  return "Ostatní";
}

export function academicYearFor(date: Date) {
  const year = date.getUTCMonth() >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${year}/${year + 1}`;
}

export function zonedDateTimeToIso(year: number, month: number, day: number, hour = 0, minute = 0) {
  const approximate = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(approximate));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute));
  return new Date(approximate - (represented - approximate)).toISOString();
}

export function parseCzechDatePoint(input: string, endOfDay = false) {
  const clean = input.replace(/\u00a0/g, " ").trim();
  const match = clean.match(/(\d{1,2})\.\s*(?:(\d{1,2})\.|([\p{L}]+))\s*(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/iu);
  if (!match) return null;
  const month = match[2] ? Number(match[2]) : czechMonths[match[3].toLocaleLowerCase("cs-CZ")];
  if (!month) return null;
  const hasTime = Boolean(match[5]);
  const hour = hasTime ? Number(match[5]) : endOfDay ? 23 : 0;
  const minute = hasTime ? Number(match[6]) : endOfDay ? 59 : 0;
  return { iso: zonedDateTimeToIso(Number(match[4]), month, Number(match[1]), hour, minute), hasTime };
}

export function parseCzechDateRange(input: string, defaultYear = 2026) {
  const clean = input.replace(/\u00a0/g, " ").replace(/[–—]/g, "-").trim();
  const numeric = clean.match(/(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (numeric) {
    const endYear = Number(numeric[6]); const endMonth = Number(numeric[5]); const startMonth = Number(numeric[2]);
    const startYear = numeric[3] ? Number(numeric[3]) : startMonth > endMonth ? endYear - 1 : endYear;
    return { start: zonedDateTimeToIso(startYear, startMonth, Number(numeric[1])), end: zonedDateTimeToIso(endYear, endMonth, Number(numeric[4]), 23, 59), allDay: true };
  }
  const words = clean.match(/(\d{1,2})\.\s*([\p{L}]+)(?:\s*(\d{4}))?\s*-\s*(\d{1,2})\.\s*([\p{L}]+)\s*(\d{4})/iu);
  if (words) {
    const startMonth = czechMonths[words[2].toLocaleLowerCase("cs-CZ")]; const endMonth = czechMonths[words[5].toLocaleLowerCase("cs-CZ")];
    if (!startMonth || !endMonth) return null;
    const endYear = Number(words[6]); const startYear = words[3] ? Number(words[3]) : startMonth > endMonth ? endYear - 1 : endYear;
    return { start: zonedDateTimeToIso(startYear, startMonth, Number(words[1])), end: zonedDateTimeToIso(endYear, endMonth, Number(words[4]), 23, 59), allDay: true };
  }
  const singleNumeric = clean.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (singleNumeric) return { start: zonedDateTimeToIso(Number(singleNumeric[3]), Number(singleNumeric[2]), Number(singleNumeric[1])), allDay: true };
  const singleWord = clean.match(/(\d{1,2})\.\s*([\p{L}]+)\s*(\d{4})/iu);
  if (singleWord) { const month = czechMonths[singleWord[2].toLocaleLowerCase("cs-CZ")]; if (month) return { start: zonedDateTimeToIso(Number(singleWord[3]), month, Number(singleWord[1])), allDay: true }; }
  void defaultYear;
  return null;
}

export async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function semanticText(value?: string) {
  return (value || "").replace(/<[^>]+>/g, " ").normalize("NFKC").toLocaleLowerCase("cs-CZ").replace(/\s+/g, " ").trim();
}

export function semanticEventPayload(event: Pick<NormalizedEvent, "title" | "description" | "startAt" | "endAt" | "allDay" | "category" | "academicYear" | "studyYears">) {
  return JSON.stringify({ title: semanticText(event.title), description: semanticText(event.description), startAt: event.startAt, endAt: event.endAt || null, allDay: event.allDay, category: event.category, academicYear: event.academicYear, studyYears: event.studyYears || [] });
}

export function semanticEventHash(event: Parameters<typeof semanticEventPayload>[0]) {
  return sha256(semanticEventPayload(event));
}
