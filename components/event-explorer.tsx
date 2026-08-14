"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronDown, ExternalLink, FileDown, RotateCcw, School, Search, Settings2, Share2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AcademicEvent, StudyYear } from "@/lib/types";
import { formatDate, formatDayNumber, formatPragueTimestamp, formatShortMonth } from "@/lib/format";
import { useAcademicCatalog } from "@/components/academic-catalog-provider";
import { calendarPreferenceRequestedEvent, useStudentPreference } from "@/lib/client-preferences";
import { googleCalendarUrl } from "@/lib/calendar-export";
import { includesFolded } from "@/lib/search";
import { eventFreshness } from "@/lib/event-freshness";
import { academicEventMatchesSelection } from "@/lib/academic-events";
import { studyYears } from "@/lib/study-years";

export function EventExplorer({ events, initialUniversityId = "", initialFacultyId = "", initialStudyYear, cityId }: { events: AcademicEvent[]; initialUniversityId?: string; initialFacultyId?: string; initialStudyYear?: StudyYear; cityId: string }) {
  const catalog = useAcademicCatalog(); const preference = useStudentPreference(catalog); const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || ""); const [category, setCategory] = useState(searchParams.get("category") || "Všechny"); const [universityId, setUniversityId] = useState(initialUniversityId); const [facultyId, setFacultyId] = useState(initialFacultyId); const [studyYear, setStudyYear] = useState<StudyYear | undefined>(initialStudyYear); const [shareNotice, setShareNotice] = useState(""); const initialized = useRef(false);
  const availableUniversities = useMemo(() => catalog.universities.filter((item) => item.active), [catalog]);
  const availableFaculties = useMemo(() => catalog.faculties.filter((item) => item.active && item.universityId === universityId), [catalog, universityId]);
  const hasPreferredScope = preference.cityId === cityId && Boolean(preference.universityId || preference.studyYear);
  useEffect(() => { setUniversityId(initialUniversityId); setFacultyId(initialFacultyId); setStudyYear(initialStudyYear); }, [initialFacultyId, initialStudyYear, initialUniversityId]);
  useEffect(() => {
    const applyNavigationPreference = (rawEvent: Event) => {
      const detail = (rawEvent as CustomEvent<{ universityId?: string; facultyId?: string; studyYear?: StudyYear }>).detail;
      const nextUniversity = detail?.universityId || "";
      const validFaculty = catalog.faculties.some((item) => item.active && item.id === detail?.facultyId && item.universityId === nextUniversity) ? detail.facultyId || "" : "";
      setUniversityId(nextUniversity);
      setFacultyId(validFaculty);
      setStudyYear(detail?.studyYear);
    };
    window.addEventListener(calendarPreferenceRequestedEvent, applyNavigationPreference);
    return () => window.removeEventListener(calendarPreferenceRequestedEvent, applyNavigationPreference);
  }, [catalog]);
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    const hasSelection = searchParams.has("university") || searchParams.has("faculty") || searchParams.has("year");
    if (!hasSelection && (preference.universityId || preference.studyYear)) changeScope(preference.universityId || "", preference.facultyId || "", preference.studyYear || undefined);
    else if (searchParams.get("university") !== initialUniversityId || (searchParams.get("faculty") || "") !== initialFacultyId || (searchParams.has("year") && String(initialStudyYear || "") !== searchParams.get("year"))) changeScope(initialUniversityId, initialFacultyId, initialStudyYear);
    // Preference is intentionally applied only once; reset must remain reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference.universityId, preference.studyYear]);
  function changeScope(nextUniversity: string, nextFaculty: string, nextStudyYear = studyYear) {
    const validFaculty = catalog.faculties.some((item) => item.active && item.id === nextFaculty && item.universityId === nextUniversity) ? nextFaculty : "";
    setUniversityId(nextUniversity); setFacultyId(validFaculty); setStudyYear(nextStudyYear);
    const next = new URLSearchParams(searchParams.toString());
    if (nextUniversity) next.set("university", nextUniversity); else next.delete("university");
    if (validFaculty) next.set("faculty", validFaculty); else next.delete("faculty");
    if (nextStudyYear) next.set("year", String(nextStudyYear)); else next.delete("year");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  function applyPreferredScope() { changeScope(preference.universityId || "", preference.facultyId || "", preference.studyYear || undefined); }
  function resetFilters() { setQuery(""); setCategory("Všechny"); changeScope("", "", undefined); }
  async function shareEvent(event: AcademicEvent) {
    const url = `${window.location.origin}${pathname}?${new URLSearchParams({ ...(universityId && { university: universityId }), ...(facultyId && { faculty: facultyId }), ...(studyYear && { year: String(studyYear) }) })}#${event.id}`;
    if (navigator.share) await navigator.share({ title: event.title, text: `${formatDate(event.start)} · ${event.school}`, url }); else await navigator.clipboard.writeText(url);
    setShareNotice(`Odkaz na událost „${event.title}“ je připraven ke sdílení.`); window.setTimeout(() => setShareNotice(""), 3000);
  }
  const filtered = useMemo(() => events.filter((event) => includesFolded(`${event.title} ${event.description}`, query) && (category === "Všechny" || event.category === category) && academicEventMatchesSelection(event, { universityId: universityId || undefined, facultyId: facultyId || undefined, studyYear })), [events, query, category, universityId, facultyId, studyYear]);
  const categories = ["Všechny", ...new Set(events.map((item) => item.category))];
  const exportQuery = new URLSearchParams({ city: cityId }); if (universityId) exportQuery.set("university", universityId); if (facultyId) exportQuery.set("faculty", facultyId); if (studyYear) exportQuery.set("year", String(studyYear)); if (category !== "Všechny") exportQuery.set("category", category); if (query.trim()) exportQuery.set("q", query.trim());
  return <>
    <section className="filter-panel" aria-label="Filtry událostí">
      <label className="search-field"><span>Hledat termín</span><div><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Např. zkouškové…" /></div></label>
      <label><span>Kategorie</span><div className="select-wrap"><select aria-label="Kategorie" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Univerzita</span><div className="select-wrap"><select aria-label="Univerzita" value={universityId} onChange={(e) => changeScope(e.target.value, "")}><option value="">Všechny školy</option>{availableUniversities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Fakulta</span><div className="select-wrap"><select aria-label="Fakulta" value={facultyId} onChange={(e) => changeScope(universityId, e.target.value)} disabled={!universityId}><option value="">Všechny fakulty</option>{availableFaculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Ročník</span><div className="select-wrap"><select aria-label="Ročník" value={studyYear || ""} onChange={(e) => changeScope(universityId, facultyId, e.target.value ? Number(e.target.value) as StudyYear : undefined)}><option value="">Všechny ročníky</option>{studyYears.map((year) => <option key={year} value={year}>{year}. ročník</option>)}</select><ChevronDown size={16} /></div></label>
      <div className="filter-actions"><button className="button button-secondary" type="button" onClick={resetFilters}><RotateCcw size={16} />Resetovat filtry</button>{hasPreferredScope && <button className="button button-secondary" type="button" onClick={applyPreferredScope}><School size={16} />Moje nastavení</button>}<Link className="button button-secondary" href="/nastaveni"><Settings2 size={16} />Změnit nastavení</Link><a className="button button-secondary" href={`/api/calendar/all.ics?${exportQuery}`}><FileDown size={16} />Exportovat výběr</a></div>
    </section>
    <div className="trust-note"><ShieldCheck size={18} /><p>Automaticky načtené změny s nízkou jistotou čekají na ruční kontrolu a veřejně se nezobrazí.</p></div>
    {shareNotice && <div className="success-message" role="status">{shareNotice}</div>}
    <section className="result-stack" aria-live="polite"><div className="result-count"><strong>{filtered.length}</strong> ověřených událostí</div>
      {filtered.length === 0 ? <div className="empty-state"><CalendarPlus size={26} /><h2>Žádný termín neodpovídá filtrům</h2><p>Aktivní filtry: {[query, category !== "Všechny" ? category : "", universityId, facultyId, studyYear ? `${studyYear}. ročník` : ""].filter(Boolean).join(" · ") || "žádné"}.</p><button className="button button-secondary" onClick={resetFilters}>Resetovat filtry</button></div> : filtered.map((event) => { const freshness = eventFreshness(event.lastVerifiedAt); return <article className={`result-card event-card ${event.changeState === "changed" ? "event-changed" : ""}`} key={event.id} id={event.id}>
        <time dateTime={event.start}><strong>{formatDayNumber(event.start)}</strong><span>{formatShortMonth(event.start)}</span></time>
        <div className="result-main"><div className="result-labels"><span className="tag">{event.category}</span>{event.changeState === "changed" && <span className="sponsored">AKTUALIZOVÁNO</span>}{event.changeState === "cancelled" && <span className="sponsored">ZRUŠENO</span>}</div><h2>{event.title}</h2><p>{event.description}</p><dl className="meta-list"><div><dt>Škola / fakulta</dt><dd>{event.school} · {event.faculty}</dd></div><div><dt>Termín</dt><dd>{formatDate(event.start)}{event.end ? ` – ${formatDate(event.end)}` : ""}</dd></div><div><dt>Úroveň</dt><dd>{event.scope || "faculty"}</dd></div><div><dt>Naposledy ověřeno</dt><dd>{formatPragueTimestamp(event.lastVerifiedAt)}</dd></div><div><dt>Stav aktuálnosti</dt><dd><span className={`tag ${freshness.tone === "fresh" ? "tag-green" : freshness.tone === "waiting" ? "tag-blue" : ""}`}>{freshness.label}</span></dd></div></dl><small className="source-note">Zdroj: {event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">{event.sourceDocumentTitle || event.source}</a> : event.source}</small></div>
        <div className="card-actions"><a className="button button-secondary" target="_blank" rel="noopener noreferrer" href={googleCalendarUrl(event)}><ExternalLink size={16} />Google Calendar</a><a className="button button-secondary" href={`/api/calendar/${event.id}.ics?city=${cityId}`}><FileDown size={16} />Stáhnout .ics</a><button className="button button-secondary" type="button" onClick={() => shareEvent(event)}><Share2 size={16} />Sdílet</button></div>
      </article>; })}
    </section>
  </>;
}
