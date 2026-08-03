import type { AcademicEvent } from "@/lib/types";

export type StudySelection = { universityId?: string; facultyId?: string };
export function academicEventMatchesSelection(event: AcademicEvent, selection: StudySelection = {}) {
  const { universityId, facultyId } = selection;
  if (!universityId) return true;
  if (["city", "brno", "national"].includes(event.scope || "")) return true;
  if (event.universityId !== universityId) return false;
  if (!facultyId) return true;
  return !event.facultyId || event.facultyId === facultyId;
}
