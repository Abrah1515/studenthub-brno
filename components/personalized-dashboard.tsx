"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarDays, GraduationCap, MapPinned, Settings2, Sparkles, Wrench } from "lucide-react";
import { useMemo } from "react";
import type { City } from "@/lib/cities";
import type { AcademicEvent, Job, Offer } from "@/lib/types";
import { useStudentPreference } from "@/lib/client-preferences";
import { formatShortDate } from "@/lib/format";
import { useAcademicCatalog } from "@/components/academic-catalog-provider";
import type { StudySelection } from "@/lib/academic-events";
import { relevantAcademicEvents } from "@/lib/event-lifecycle";

export function DashboardHeading({ city, selection }: { city: City; selection?: StudySelection }) {
  const catalog = useAcademicCatalog(); const preference = useStudentPreference(catalog); const selected = selection || preference;
  const university = catalog.universities.find((item) => item.id === selected.universityId);
  const faculty = university ? catalog.faculties.find((item) => item.id === selected.facultyId && item.universityId === university.id) : undefined;
  const today = new Intl.DateTimeFormat("cs-CZ", { weekday: "long", day: "numeric", month: "long", timeZone: city.timezone }).format(new Date());
  return <header className="page-heading"><div><span className="eyebrow">{today}</span><h1>{university ? `Přehled pro ${faculty?.shortName || university.shortName}` : `StudentHub ${city.name}`}</h1><p>{university ? `${university.name}${faculty ? ` · ${faculty.name}` : ""}. K tomu obsah užitečný pro celé město ${city.name}.` : `Ověřené termíny, místa a praktické služby pro studenty ve městě ${city.name}.`}</p></div><div className="heading-actions"><Link href="/nastaveni" className="button button-secondary"><Settings2 size={18} />Moje škola</Link><Link href="/pomoc" className="button button-primary"><Wrench size={18} />Potřebuji technickou pomoc</Link></div></header>;
}

export function PersonalizedDashboard({ events, offers, jobs, city, selection }: { events: AcademicEvent[]; offers: Offer[]; jobs: Job[]; city: City; selection?: StudySelection }) {
  const catalog = useAcademicCatalog(); const preference = useStudentPreference(catalog); const selected = selection || preference;
  const university = catalog.universities.find((item) => item.id === selected.universityId);
  const faculty = university ? catalog.faculties.find((item) => item.id === selected.facultyId && item.universityId === university.id) : undefined;
  const personalized = useMemo(() => {
    const matchesUniversity = (ids?: string[]) => !selected.universityId || !ids?.length || ids.includes(selected.universityId);
    const matchesFaculty = (ids?: string[]) => !selected.facultyId || !ids?.length || ids.includes(selected.facultyId);
    return {
      events: relevantAcademicEvents(events.filter((item) => item.scope === "city" || item.scope === "brno" || (!selected.universityId ? true : item.universityId === selected.universityId && (!selected.facultyId || !item.facultyId || item.facultyId === selected.facultyId)))).slice(0, 2),
      offers: offers.filter((item) => matchesUniversity(item.universityIds) && matchesFaculty(item.facultyIds)).slice(0, 2),
      jobs: jobs.filter((item) => matchesUniversity(item.universityIds) && matchesFaculty(item.facultyIds)).slice(0, 2),
    };
  }, [events, offers, jobs, selected.facultyId, selected.universityId]);
  if ((!selection && !preference.completed) || !university) return <section className="personalized-empty"><GraduationCap size={21} /><div><h2>Přizpůsobte si StudentHub</h2><p>Vyberte školu a fakultu bez registrace. Doporučení pak budou konkrétnější.</p></div><Link href="/nastaveni" className="button button-secondary">Vybrat školu <ArrowRight size={16} /></Link></section>;
  return <section className="personalized-panel"><div className="personalized-head"><div><span className="eyebrow">Pro vás · {faculty?.shortName || university.shortName}</span><h2>Výběr podle vaší školy</h2></div><Link href="/nastaveni">Změnit výběr</Link></div><div className="personalized-grid"><div><span className="section-icon"><CalendarDays size={17} /></span><strong>{personalized.events[0]?.title || `Společné termíny · ${city.name}`}</strong><small>{personalized.events[0] ? formatShortDate(personalized.events[0].start) : "Průběžně doplňujeme"}</small></div><div><span className="section-icon"><Sparkles size={17} /></span><strong>{personalized.offers[0]?.title || "Společné studentské nabídky"}</strong><small>{personalized.offers[0]?.partner || "Pro všechny školy"}</small></div><div><span className="section-icon"><BriefcaseBusiness size={17} /></span><strong>{personalized.jobs[0]?.title || `Brigády · ${city.name}`}</strong><small>{personalized.jobs[0]?.company || "Napříč obory"}</small></div><Link href={university.slug === "muni" || university.slug === "vut" || university.slug === "mendelu" ? `/${city.slug}/skoly/${university.slug}` : `/${city.slug}/mista`}><MapPinned size={18} /><span>Školní rozcestník</span><ArrowRight size={16} /></Link></div></section>;
}
