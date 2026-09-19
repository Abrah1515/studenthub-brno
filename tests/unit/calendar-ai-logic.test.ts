import { describe, expect, it } from "vitest";
import { calendarConflictRecommendation, calendarDuplicateGroups } from "@/lib/academic-calendar-ai-logic";

const base = { academic_year: "2026/2027", semester: "autumn", category: "teaching", university_id: "muni", faculty_id: "muni-fi", title: "Začátek výuky", is_cancelled: false };

describe("deterministická část AI kontroly kalendáře", () => {
  it("odhalí jen vícezdrojovou duplicitu stejné školy a fakulty", () => {
    const groups = calendarDuplicateGroups([
      { ...base, id: "1", source_id: "src-a" },
      { ...base, id: "2", source_id: "src-b", title: "Začátek  výuky" },
      { ...base, id: "3", source_id: "src-a", faculty_id: "muni-fss" },
      { ...base, id: "4", source_id: "src-c", is_cancelled: true },
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
});
