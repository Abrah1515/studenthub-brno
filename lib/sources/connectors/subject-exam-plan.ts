import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import type { StudyYear } from "@/lib/types";
import { academicYearFromText } from "@/lib/sources/discovery";
import { sha256, zonedDateTimeToIso } from "@/lib/sources/normalize";
import { currentAcademicYear } from "@/lib/sources/validation";

const PUBLIC_PLAN_NOTICE = "Veřejný fakultní plán. Rozhodující je termín uvedený studentovi v IS školy.";
const subjectCodePattern = /\b[A-Z]{2,6}-[A-Z0-9]{2,10}(?:\([A-Z0-9]+\))?/giu;
const datePattern = /(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?/g;

function validStudyYear(value: number): value is StudyYear {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function sourcePublicationDate(text: string) {
  const matches = [...text.matchAll(/(?:Brno\s+)?(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})/gi)];
  const match = matches.at(-1);
  return match ? zonedDateTimeToIso(Number(match[3]), Number(match[2]), Number(match[1])) : undefined;
}

function dateForAcademicPlan(day: number, month: number, explicitYear: number | undefined, defaultYear: number, academicYear: string) {
  const year = explicitYear || defaultYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const startYear = Number(academicYear.slice(0, 4));
  if (year < startYear || year > startYear + 1) return null;
  return zonedDateTimeToIso(year, month, day);
}

export function isSubjectExamPlanText(text: string) {
  const folded = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("cs-CZ");
  if (/prijimac[^ ]* (?:rizeni|zkous)/.test(folded) && !/predmet\s*\(?zkratka\)?/.test(folded)) return false;
  return /(casovy plan|plan|harmonogram|rozpis) zkousek/.test(folded)
    && /predmet\s*\(?zkratka\)?/.test(folded)
    && /termin zkousky/.test(folded);
}

export async function parseSubjectExamPlanText(
  text: string,
  context: ConnectorContext,
  options: { documentTitle?: string; usedOcr?: boolean; sourcePage?: number } = {},
): Promise<ConnectorResult | null> {
  const normalized = text.replace(/\u00ad/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  if (!isSubjectExamPlanText(normalized)) return null;

  const academicYear = context.source.academicYear || academicYearFromText(normalized);
  const expectedYear = currentAcademicYear(new Date(context.checkedAt));
  const documentTitleMatch = normalized.match(/(?:Časový|Casovy)\s+plán\s+zkoušek[^\n]*/i);
  const documentTitle = options.documentTitle && !/^Oficiální PDF dokument$/i.test(options.documentTitle)
    ? options.documentTitle
    : documentTitleMatch?.[0]?.replace(/\s+/g, " ").trim() || "Časový plán zkoušek";
  if (!academicYear) return { events: [], warnings: ["Plán zkoušek neobsahuje jednoznačný akademický rok."], sourceText: normalized, documentTitle, extractionMethod: options.usedOcr ? "ocr" : "native_text" };

  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerYear = Number(normalized.match(/Termín\s+zkoušky\s+(20\d{2})/i)?.[1] || Number(academicYear.slice(0, 4)) + 1);
  const sourceUpdatedAt = sourcePublicationDate(normalized);
  const automatic = !options.usedOcr && academicYear === expectedYear;
  const events: NormalizedEvent[] = [];
  let studyYear: StudyYear | undefined;

  for (const line of lines) {
    const studyYearMatch = line.match(/\b([1-6])\.\s*ročník\b/i);
    if (studyYearMatch && validStudyYear(Number(studyYearMatch[1]))) studyYear = Number(studyYearMatch[1]) as StudyYear;

    const codes = [...new Set([...line.matchAll(subjectCodePattern)].map((match) => match[0].toUpperCase()))];
    if (!codes.length || !studyYear) continue;
    const dates = [...line.matchAll(datePattern)].map((match) => ({ day: Number(match[1]), month: Number(match[2]), year: match[3] ? Number(match[3]) : undefined }));
    if (!dates.length) continue;

    const credit = /zápočet|zapocet/i.test(line);
    for (const [index, value] of dates.entries()) {
      const startAt = dateForAcademicPlan(value.day, value.month, value.year, headerYear, academicYear);
      if (!startAt) continue;
      const order = credit ? 1 : index + 1;
      const codeLabel = codes.join(", ");
      const title = credit ? `${codeLabel} – nejzazší termín zápočtu` : `${codeLabel} – ${order}. termín zkoušky`;
      const externalId = (await sha256([context.source.id, academicYear, studyYear, credit ? "credit" : "exam", codes.join("+"), order].join("|"))).slice(0, 32);
      events.push({
        externalId,
        title,
        description: `${PUBLIC_PLAN_NOTICE} Související předměty: ${codeLabel}.`,
        startAt,
        allDay: true,
        timezone: "Europe/Prague",
        category: "Zkouškové období",
        academicYear,
        studyYears: [studyYear],
        universityId: context.source.universityId,
        facultyId: context.source.facultyId,
        sourceId: context.source.id,
        sourceUrl: context.source.sourceUrl,
        sourceUpdatedAt,
        sourceModifiedBasis: sourceUpdatedAt ? "explicit_school_update" : "first_detected",
        sourceHash: await sha256(`${line}|${startAt}|${order}`),
        confidence: automatic ? 0.99 : 0.80,
        status: automatic ? "approved" : "pending",
        lastVerifiedAt: context.checkedAt,
        sourceDocumentTitle: documentTitle,
        sourcePage: options.sourcePage || 1,
        originalText: line,
      });
    }
  }

  const warnings: string[] = [];
  if (!events.length) warnings.push("Plán konkrétních zkoušek byl rozpoznán, ale žádný řádek nebylo možné bezpečně převést.");
  if (options.usedOcr) warnings.push("Plán zkoušek byl zpracován OCR a vyžaduje ruční schválení.");
  if (academicYear !== expectedYear) warnings.push(`Dokument patří do akademického roku ${academicYear}, očekáván je ${expectedYear}.`);
  return { events, warnings, sourceText: normalized, documentTitle, normalizedHash: await sha256(normalized), extractionMethod: options.usedOcr ? "ocr" : "native_text" };
}

export { PUBLIC_PLAN_NOTICE };
