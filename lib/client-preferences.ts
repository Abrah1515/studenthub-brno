"use client";

import { useEffect, useState } from "react";
import type { AcademicCatalog, StudentPreference } from "@/lib/types";

import { defaultCitySlug } from "@/lib/cities";
import { fallbackAcademicCatalog, resolveStudySelection } from "@/lib/universities";

import { academicCycleStartYear, isStudyYear } from "@/lib/study-years";

export const preferenceKey = "studenthub-preference-v4";
export const previousPreferenceKey = "studenthub-preference-v3";
export const olderPreferenceKey = "studenthub-preference-v2";
export const legacyPreferenceKey = "studenthub-preference-v1";
export const calendarPreferenceRequestedEvent = "studenthub-calendar-preference-requested";
export const defaultPreference: StudentPreference = { version: 4, cityId: defaultCitySlug, universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: false };

export function normalizePreference(value: Partial<StudentPreference> & Record<string, unknown>, catalog: AcademicCatalog = fallbackAcademicCatalog, now = new Date()): StudentPreference {
  const selected = resolveStudySelection(value.universityId, value.facultyId, catalog);
  const studyYear = isStudyYear(value.studyYear) ? value.studyYear : null;
  const currentCycle = academicCycleStartYear(now);
  const savedCycle = studyYear && Number.isInteger(value.studyYearCycleStart) ? Number(value.studyYearCycleStart) : null;
  const elapsedCycles = savedCycle == null ? 0 : Math.max(0, currentCycle - savedCycle);
  const candidateYear = studyYear == null ? null : studyYear + elapsedCycles;
  const advancedYear = isStudyYear(candidateYear) ? candidateYear : null;
  const requiresNewSelection = studyYear != null && candidateYear != null && !isStudyYear(candidateYear);
  return { version: 4, cityId: typeof value.cityId === "string" && value.cityId ? value.cityId : defaultCitySlug, universityId: selected.universityId || null, facultyId: selected.facultyId || null, studyYear: advancedYear, studyYearCycleStart: advancedYear == null ? null : currentCycle, completed: requiresNewSelection ? false : Boolean(value.completed) };
}

export function readPreference(catalog: AcademicCatalog = fallbackAcademicCatalog, now = new Date()): StudentPreference {
  if (typeof window === "undefined") return defaultPreference;
  try {
    const current = localStorage.getItem(preferenceKey);
    const previous = !current ? localStorage.getItem(previousPreferenceKey) : null;
    const older = !current && !previous ? localStorage.getItem(olderPreferenceKey) : null;
    const legacy = !current && !previous && !older ? localStorage.getItem(legacyPreferenceKey) : null;
    const parsed = JSON.parse(current || previous || older || legacy || "{}") as Partial<StudentPreference>;
    const value = normalizePreference({ ...defaultPreference, ...parsed }, catalog, now);
    if (previous || older || legacy || current !== JSON.stringify(value)) localStorage.setItem(preferenceKey, JSON.stringify(value));
    if (previous) localStorage.removeItem(previousPreferenceKey);
    if (older) localStorage.removeItem(olderPreferenceKey);
    if (legacy) localStorage.removeItem(legacyPreferenceKey);
    return value;
  } catch { return defaultPreference; }
}

export function savePreference(value: Partial<StudentPreference>, catalog: AcademicCatalog = fallbackAcademicCatalog, now = new Date()) {
  const manualYearChange = Object.prototype.hasOwnProperty.call(value, "studyYear");
  const next = normalizePreference({ ...readPreference(catalog, now), ...value, ...(manualYearChange ? { studyYearCycleStart: value.studyYear == null ? null : academicCycleStartYear(now) } : {}) }, catalog, now);
  localStorage.setItem(preferenceKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("studenthub-preference-changed", { detail: next }));
  return next;
}

export function resetPreference() {
  savePreference(defaultPreference);
}

export function useStudentPreference(catalog: AcademicCatalog = fallbackAcademicCatalog) {
  const [preference, setPreference] = useState<StudentPreference>(defaultPreference);
  useEffect(() => {
    const update = () => setPreference(readPreference(catalog));
    update();
    window.addEventListener("studenthub-preference-changed", update);
    return () => window.removeEventListener("studenthub-preference-changed", update);
  }, [catalog]);
  return preference;
}
