import { foldSearchText } from "@/lib/search";
import { decideSourceConflict, type SourceRevision } from "@/lib/sources/conflict-resolution";

export function calendarDuplicateGroups(events: Record<string, unknown>[]) {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const event of events) {
    if (event.is_cancelled) continue;
    const studyYears = Array.isArray(event.study_years) ? event.study_years.map(String).sort().join(",") : "";
    const key = [event.university_id, event.faculty_id, event.programme_id || "", studyYears, event.academic_year, event.semester, event.category, foldSearchText(String(event.title || ""))].join("|");
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return [...groups].filter(([, group]) => group.length > 1 && new Set(group.map((event) => String(event.source_id))).size > 1);
}

export function calendarConflictRecommendation(existing: SourceRevision, proposed: SourceRevision) {
  const priority = decideSourceConflict(existing, proposed);
  const recommendedAction = priority === "proposed"
    ? "Nově načtený oficiální zdroj má prokazatelně novější revizi. Ručně potvrdit opravu termínu."
    : priority === "existing"
      ? "Uložený oficiální zdroj má prokazatelně novější revizi. Nechat termín beze změny a prověřit starší zdroj."
      : "Pořadí oficiálních revizí nelze prokázat. Ponechat konflikt otevřený k ruční kontrole.";
  return { priority, recommendedAction };
}

type CalendarRow = Record<string, unknown>;
type CalendarIdentity = {
  externalId: string;
  duplicateFingerprint: string;
  title: string;
  category: string;
  semester: string;
  academicYear: string;
  universityId: string;
  facultyId: string | null;
};

/** The source synchronizer also preserves old IDs by duplicate_fingerprint. */
export function findCalendarEventMatch(rows: CalendarRow[], usedIds: Set<string>, event: CalendarIdentity) {
  const available = rows.filter((row) => !usedIds.has(String(row.id)));
  const exact = available.filter((row) => String(row.external_id) === event.externalId);
  if (exact.length === 1) return { row: exact[0], ambiguous: false };
  if (exact.length > 1) return { row: null, ambiguous: true };
  const fingerprint = available.filter((row) => String(row.duplicate_fingerprint || "") === event.duplicateFingerprint);
  if (fingerprint.length === 1) return { row: fingerprint[0], ambiguous: false };
  if (fingerprint.length > 1) return { row: null, ambiguous: true };
  const semantic = available.filter((row) =>
    String(row.university_id || "") === event.universityId &&
    String(row.faculty_id || "") === String(event.facultyId || "") &&
    String(row.academic_year || "") === event.academicYear &&
    String(row.semester || "") === event.semester &&
    String(row.category || "") === event.category &&
    foldSearchText(String(row.title || "")) === foldSearchText(event.title),
  );
  return { row: semantic.length === 1 ? semantic[0] : null, ambiguous: semantic.length > 1 };
}

function normalizedText(value: unknown) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("cs");
}
function sameInstant(first: unknown, second: unknown) {
  if (!first && !second) return true;
  const a = Date.parse(String(first)); const b = Date.parse(String(second));
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
function sameYears(first: unknown, second: unknown) {
  const years = (value: unknown) => Array.isArray(value) ? value.map(String).sort() : [];
  return JSON.stringify(years(first)) === JSON.stringify(years(second));
}
function sameUrl(first: unknown, second: unknown) {
  try {
    const normalize = (value: unknown) => { const url = new URL(String(value)); url.hash = ""; return url.toString().replace(/\/$/, ""); };
    return normalize(first) === normalize(second);
  } catch { return String(first || "") === String(second || ""); }
}

/** Only substantive differences become findings; formatting alone does not. */
export function calendarEventDifferences(current: CalendarRow, proposed: CalendarRow) {
  const differences: string[] = [];
  if (normalizedText(current.title) !== normalizedText(proposed.title)) differences.push("název");
  if (normalizedText(current.description) !== normalizedText(proposed.description)) differences.push("popis");
  if (!sameInstant(current.starts_at, proposed.starts_at)) differences.push("začátek");
  if (!sameInstant(current.ends_at, proposed.ends_at)) differences.push("konec");
  if (String(current.category || "") !== String(proposed.category || "")) differences.push("typ");
  if (String(current.semester || "") !== String(proposed.semester || "")) differences.push("semestr");
  if (!sameYears(current.study_years, proposed.study_years)) differences.push("ročník");
  if (String(current.university_id || "") !== String(proposed.university_id || "")) differences.push("univerzita");
  if (String(current.faculty_id || "") !== String(proposed.faculty_id || "")) differences.push("fakulta");
  if (!sameUrl(current.source_url, proposed.source_url)) differences.push("odkaz na zdroj");
  return differences;
}
