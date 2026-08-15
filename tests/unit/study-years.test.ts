// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { academicEventMatchesSelection } from "@/lib/academic-events";
import { fallbackAcademicCatalog } from "@/lib/universities";
import { normalizePreference, savePreference, preferenceKey } from "@/lib/client-preferences";
import { currentAcademicYear, inferStudyYears } from "@/lib/study-years";
import type { AcademicEvent } from "@/lib/types";

const event = (studyYears?: AcademicEvent["studyYears"]): AcademicEvent => ({ id: "e", title: "Termín", category: "Výuka", school: "VUT", faculty: "FEKT", start: "2026-09-01", source: "Zdroj", sourceUrl: "https://example.cz", updatedAt: "2026-08-01", lastVerifiedAt: "2026-08-01", description: "", scope: "faculty", universityId: "vut", facultyId: "vut-fekt", studyYears });

describe("červencový přechod ročníku", () => {
  beforeEach(() => { const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, String(value)), removeItem: (key: string) => values.delete(key), clear: () => values.clear(), key: (index: number) => [...values.keys()][index] ?? null, get length() { return values.size; } }; Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true }); Object.defineProperty(window, "localStorage", { value: storage, configurable: true }); });
  it("30. června ještě neposouvá", () => expect(normalizePreference({ studyYear: 2, studyYearCycleStart: 2025 }, fallbackAcademicCatalog, new Date("2026-06-30T12:00:00Z"))).toMatchObject({ studyYear: 2, studyYearCycleStart: 2025 }));
  it("1. července posune právě jednou", () => { const first = normalizePreference({ studyYear: 2, studyYearCycleStart: 2025 }, fallbackAcademicCatalog, new Date("2026-07-01T12:00:00Z")); expect(first).toMatchObject({ studyYear: 3, studyYearCycleStart: 2026 }); expect(normalizePreference(first, fallbackAcademicCatalog, new Date("2026-07-01T18:00:00Z"))).toMatchObject({ studyYear: 3, studyYearCycleStart: 2026 }); });
  it("dopočítá víceletou nepřítomnost a po posledním ročníku vyžádá nový výběr", () => { expect(normalizePreference({ studyYear: 2, studyYearCycleStart: 2024 }, fallbackAcademicCatalog, new Date("2028-07-01T12:00:00Z")).studyYear).toBe(6); expect(normalizePreference({ studyYear: 6, studyYearCycleStart: 2024, completed: true }, fallbackAcademicCatalog, new Date("2030-07-01T12:00:00Z"))).toMatchObject({ studyYear: null, studyYearCycleStart: null, completed: false }); });
  it("ruční změna okamžitě nastaví nový výchozí cyklus", () => { localStorage.setItem(preferenceKey, JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 5, studyYearCycleStart: 2024, completed: true })); const changed = savePreference({ studyYear: 2 }, fallbackAcademicCatalog, new Date("2028-08-01T12:00:00Z")); expect(changed).toMatchObject({ studyYear: 2, studyYearCycleStart: 2028 }); });
  it("volbu všech ročníků neposouvá", () => expect(normalizePreference({ studyYear: null, studyYearCycleStart: 2020 }, fallbackAcademicCatalog, new Date("2030-08-01T12:00:00Z"))).toMatchObject({ studyYear: null, studyYearCycleStart: null }));
});

describe("aktuální akademický rok", () => {
  it("přepíná bezpečně 1. července bez ručního hardcodování", () => { expect(currentAcademicYear(new Date("2026-06-30T12:00:00Z"))).toBe("2025/2026"); expect(currentAcademicYear(new Date("2026-07-01T12:00:00Z"))).toBe("2026/2027"); });
});

describe("výslovné ročníky ve zdroji", () => {
  it("pozná jednotlivý ročník, rozsah a více ročníků", () => { expect(inferStudyYears("Termín pro 2. ročník")).toEqual([2]); expect(inferStudyYears("Výuka 1.–3. ročník")).toEqual([1, 2, 3]); expect(inferStudyYears("Akce pro 1. a 2. ročník")).toEqual([1, 2]); });
  it("bez výslovného textu nic neodhaduje", () => expect(inferStudyYears("Termín bakalářského programu 14. 9. 2026")).toBeUndefined());
  it("společný termín zůstane viditelný a jiný ročník se skryje", () => { expect(academicEventMatchesSelection(event(), { universityId: "vut", facultyId: "vut-fekt", studyYear: 2 })).toBe(true); expect(academicEventMatchesSelection(event([]), { studyYear: 2 })).toBe(true); expect(academicEventMatchesSelection(event([1]), { studyYear: 2 })).toBe(false); expect(academicEventMatchesSelection(event([2, 3]), { studyYear: 2 })).toBe(true); });
});
