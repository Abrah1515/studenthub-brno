"use client";

import { useEffect, useState } from "react";
import type { AcademicCatalog, StudentPreference } from "@/lib/types";

import { defaultCitySlug } from "@/lib/cities";
import { fallbackAcademicCatalog, resolveStudySelection } from "@/lib/universities";

export const preferenceKey = "studenthub-preference-v3";
export const previousPreferenceKey = "studenthub-preference-v2";
export const legacyPreferenceKey = "studenthub-preference-v1";
export const calendarPreferenceRequestedEvent = "studenthub-calendar-preference-requested";
export const defaultPreference: StudentPreference = { version: 3, cityId: defaultCitySlug, universityId: null, facultyId: null, completed: false };

export function normalizePreference(value: Partial<StudentPreference>, catalog: AcademicCatalog = fallbackAcademicCatalog): StudentPreference {
  const selected = resolveStudySelection(value.universityId, value.facultyId, catalog);
  return { version: 3, cityId: value.cityId || defaultCitySlug, universityId: selected.universityId || null, facultyId: selected.facultyId || null, completed: Boolean(value.completed) };
}

export function readPreference(catalog: AcademicCatalog = fallbackAcademicCatalog): StudentPreference {
  if (typeof window === "undefined") return defaultPreference;
  try {
    const current = localStorage.getItem(preferenceKey);
    const previous = !current ? localStorage.getItem(previousPreferenceKey) : null;
    const legacy = !current && !previous ? localStorage.getItem(legacyPreferenceKey) : null;
    const parsed = JSON.parse(current || previous || legacy || "{}") as Partial<StudentPreference>;
    const value = normalizePreference({ ...defaultPreference, ...parsed }, catalog);
    if (previous || legacy || current !== JSON.stringify(value)) localStorage.setItem(preferenceKey, JSON.stringify(value));
    if (previous) localStorage.removeItem(previousPreferenceKey);
    if (legacy) localStorage.removeItem(legacyPreferenceKey);
    return value;
  } catch { return defaultPreference; }
}

export function savePreference(value: Partial<StudentPreference>, catalog: AcademicCatalog = fallbackAcademicCatalog) {
  const next = normalizePreference({ ...readPreference(catalog), ...value }, catalog);
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
