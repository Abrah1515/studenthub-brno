import { describe, expect, it } from "vitest";
import { calendarConflictRecommendation, calendarDuplicateGroups, calendarEventDifferences, findCalendarEventMatch } from "@/lib/academic-calendar-ai-logic";

const base = { academic_year: "2026/2027", semester: "autumn", category: "teaching", university_id: "muni", faculty_id: "muni-fi", title: "Začátek výuky", is_cancelled: false };

describe("deterministické porovnání kalendáře", () => {
  it("odhalí jen vícezdrojovou duplicitu stejné školy a fakulty", () => {
    const groups = calendarDuplicateGroups([
      { ...base, id: "1", source_id: "src-a" },
      { ...base, id: "2", source_id: "src-b", title: "Začátek  výuky" },
      { ...base, id: "3", source_id: "src-a", faculty_id: "muni-fss" },
      { ...base, id: "4", source_id: "src-c", is_cancelled: true },
      { ...base, id: "5", source_id: "src-c", study_years: [1] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0][1].map((event) => event.id)).toEqual(["1", "2"]);
  });

  it("doporučí novější oficiální revizi, ale jen k ručnímu potvrzení", () => {
    const result = calendarConflictRecommendation(
      { modifiedAt: "2026-08-01T10:00:00Z", basis: "http_last_modified" },
      { modifiedAt: "2026-09-01T10:00:00Z", basis: "explicit_school_update" },
    );
    expect(result.priority).toBe("proposed");
    expect(result.recommendedAction).toContain("Ručně potvrdit");
  });

  it("bez obou dat revizí konflikt nerozhodne", () => {
    expect(calendarConflictRecommendation({ modifiedAt: null }, { modifiedAt: "2026-09-01T10:00:00Z" }).priority).toBe("needs_review");
  });

  it("páruje staré ID podle fingerprintu a nevytvoří falešný nový termín", () => {
    const rows = [{ id: "saved", external_id: "old-date-based-id", duplicate_fingerprint: "stable", ...base }];
    const result = findCalendarEventMatch(rows, new Set(), { externalId: "new-id", duplicateFingerprint: "stable", title: base.title, category: base.category, semester: base.semester, academicYear: base.academic_year, universityId: base.university_id, facultyId: base.faculty_id });
    expect(result.row?.id).toBe("saved");
    expect(result.ambiguous).toBe(false);
  });

  it("nejasnou identitu termínu neodhaduje", () => {
    const rows = ["one", "two"].map((id) => ({ id, external_id: id, duplicate_fingerprint: "stable", ...base }));
    const result = findCalendarEventMatch(rows, new Set(), { externalId: "new-id", duplicateFingerprint: "stable", title: base.title, category: base.category, semester: base.semester, academicYear: base.academic_year, universityId: base.university_id, facultyId: base.faculty_id });
    expect(result.row).toBeNull();
    expect(result.ambiguous).toBe(true);
  });

  it("ignoruje čistě formátovací změny, ale zachytí datum a typ", () => {
    const current = { title: "Začátek  výuky", description: "<p>Výuka začíná</p>", starts_at: "2026-09-14T00:00:00Z", ends_at: null, category: "teaching", semester: "autumn", study_years: [1, 2], university_id: "muni", faculty_id: "muni-fi", source_url: "https://example.cz/calendar/" };
    const proposed = { ...current, title: "Začátek výuky", description: "Výuka začíná", starts_at: "2026-09-14T02:00:00+02:00", study_years: [2, 1], source_url: "https://example.cz/calendar" };
    expect(calendarEventDifferences(current, proposed)).toEqual([]);
    expect(calendarEventDifferences(current, { ...proposed, starts_at: "2026-09-15T00:00:00Z", category: "exam" })).toEqual(["začátek", "typ"]);
  });
});
