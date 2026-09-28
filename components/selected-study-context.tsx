"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useAcademicCatalog } from "@/components/academic-catalog-provider";
import { useStudentPreference } from "@/lib/client-preferences";
import { useCurrentCity } from "@/components/city-context";

export function SelectedStudyContext() {
  const catalog = useAcademicCatalog();
  const city = useCurrentCity();
  const preference = useStudentPreference(catalog);
  const university = catalog.universities.find((item) => item.id === preference.universityId);
  const faculty = university ? catalog.faculties.find((item) => item.id === preference.facultyId && item.universityId === university.id) : undefined;
  const year = preference.studyYear ? ` · ${preference.studyYear}. ročník` : "";
  const compact = (university ? `${university.shortName} · ${faculty?.shortName || "všechny fakulty"}` : `Celé město ${city.name} · všechny školy`) + year;
  const full = (university ? `${university.name} · ${faculty?.name || "všechny fakulty"}` : `Celé město ${city.name} · všechny školy`) + year;
  return <Link href={`/${city.slug}/nastaveni`} className="selected-study-context" aria-label={`Aktuální studijní nastavení: ${full}`} title={full} data-testid="selected-study-context"><GraduationCap size={14} aria-hidden="true" /><span>{compact}</span></Link>;
}
