import type { AcademicEvent, StudyYear } from "@/lib/types";

export type StudySelection = { universityId?: string; facultyId?: string; studyYear?: StudyYear };
export function academicEventMatchesSelection(event: AcademicEvent, selection: StudySelection = {}) {
  const { universityId, facultyId, studyYear } = selection;
  if (studyYear && event.studyYears?.length && !event.studyYears.includes(studyYear)) return false;
  if (!universityId) return true;
  if (["city", "brno", "national"].includes(event.scope || "")) return true;
  if (event.universityId !== universityId) return false;
  if (!facultyId) return true;
  return !event.facultyId || event.facultyId === facultyId;
}
