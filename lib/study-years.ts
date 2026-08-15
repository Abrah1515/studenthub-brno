import type { StudyYear } from "@/lib/types";

export const studyYears: StudyYear[] = [1, 2, 3, 4, 5, 6];

export function isStudyYear(value: unknown): value is StudyYear {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function parseStudyYear(value: string | null | undefined): StudyYear | undefined {
  if (!value || !/^[1-6]$/.test(value)) return undefined;
  return Number(value) as StudyYear;
}

export function academicCycleStartYear(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return month >= 7 ? year : year - 1;
}

export function currentAcademicYear(date = new Date()) {
  const start = academicCycleStartYear(date);
  return `${start}/${start + 1}`;
}

export function inferStudyYears(originalText?: string | null): StudyYear[] | undefined {
  if (!originalText) return undefined;
  const text = originalText.normalize("NFKC").toLowerCase();
  const found = new Set<StudyYear>();
  for (const match of text.matchAll(/([1-6])\s*\.?\s*(?:[–—-]|až)\s*([1-6])\s*\.?\s*ročník(?:u|y|ům|em)?/giu)) {
    const from = Number(match[1]); const to = Number(match[2]);
    if (from <= to) for (let year = from; year <= to; year += 1) found.add(year as StudyYear);
  }
  for (const match of text.matchAll(/([1-6])\s*\.\s*ročník(?:u|y|ům|em)?/giu)) found.add(Number(match[1]) as StudyYear);
  for (const match of text.matchAll(/(?:ročník|year)\s*[:.]?\s*([1-6])\b/giu)) found.add(Number(match[1]) as StudyYear);
  for (const match of text.matchAll(/((?:[1-6]\s*\.\s*(?:,|a|nebo)?\s*){2,})ročník(?:u|y|ům|em)?/giu)) {
    for (const year of match[1].matchAll(/[1-6]/g)) found.add(Number(year[0]) as StudyYear);
  }
  return found.size ? [...found].sort((a, b) => a - b) : undefined;
}
