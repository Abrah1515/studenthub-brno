"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronDown, ExternalLink, FileDown, RotateCcw, School, Search, Settings2, Share2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AcademicEvent, StudyYear } from "@/lib/types";
import { formatDate, formatDayNumber, formatPragueTimestamp, formatShortMonth } from "@/lib/format";
import { useAcademicCatalog } from "@/components/academic-catalog-provider";
import { MobileFilterToolbar } from "@/components/mobile-filter-toolbar";
import { calendarPreferenceRequestedEvent, useStudentPreference } from "@/lib/client-preferences";
import { googleCalendarUrl } from "@/lib/calendar-export";
import { includesFolded } from "@/lib/search";
import { eventFreshness } from "@/lib/event-freshness";
import { eventLifecycle, eventLifecycleLabel, partitionAcademicEvents, type EventLifecycle } from "@/lib/event-lifecycle";
import { academicEventMatchesSelection } from "@/lib/academic-events";
import { studyYears } from "@/lib/study-years";

const allCategories = "Všechny";

export function EventExplorer({ events, initialUniversityId = "", initialFacultyId = "", initialStudyYear, cityId }: { events: AcademicEvent[]; initialUniversityId?: string; initialFacultyId?: string; initialStudyYear?: StudyYear; cityId: string }) {
  const catalog = useAcademicCatalog();
  const preference = useStudentPreference(catalog);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(searchParams.get("category") || allCategories);
  const [universityId, setUniversityId] = useState(initialUniversityId);
  const [facultyId, setFacultyId] = useState(initialFacultyId);
  const [studyYear, setStudyYear] = useState<StudyYear | undefined>(initialStudyYear);
  const [showEnded, setShowEnded] = useState(searchParams.get("ended") === "1");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const initialized = useRef(false);
  const availableUniversities = useMemo(() => catalog.universities.filter((item) => item.active), [catalog]);
  const availableFaculties = useMemo(() => catalog.faculties.filter((item) => item.active && item.universityId === universityId), [catalog, universityId]);
  const hasPreferredScope = preference.cityId === cityId && Boolean(preference.universityId || preference.studyYear);
  const activeFilterCount = [query.trim(), category !== allCategories, universityId, facultyId, studyYear, showEnded].filter(Boolean).length;

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  useEffect(() => { setUniversityId(initialUniversityId); setFacultyId(initialFacultyId); setStudyYear(initialStudyYear); }, [initialFacultyId, initialStudyYear, initialUniversityId]);
  useEffect(() => { setQuery(searchParams.get("q") || ""); setCategory(searchParams.get("category") || allCategories); setShowEnded(searchParams.get("ended") === "1"); }, [searchParams]);
  useEffect(() => {
    const applyNavigationPreference = (rawEvent: Event) => {
      const detail = (rawEvent as CustomEvent<{ universityId?: string; facultyId?: string; studyYear?: StudyYear }>).detail;
      const nextUniversity = detail?.universityId || "";
      const validFaculty = catalog.faculties.some((item) => item.active && item.id === detail?.facultyId && item.universityId === nextUniversity) ? detail.facultyId || "" : "";
      setUniversityId(nextUniversity); setFacultyId(validFaculty); setStudyYear(detail?.studyYear);
    };
    window.addEventListener(calendarPreferenceRequestedEvent, applyNavigationPreference);
    return () => window.removeEventListener(calendarPreferenceRequestedEvent, applyNavigationPreference);
  }, [catalog]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const hasSelection = searchParams.has("university") || searchParams.has("faculty") || searchParams.has("year");
    if (!hasSelection && (preference.universityId || preference.studyYear)) changeScope(preference.universityId || "", preference.facultyId || "", preference.studyYear || undefined);
    else if ((searchParams.get("university") || "") !== initialUniversityId || (searchParams.get("faculty") || "") !== initialFacultyId || (searchParams.has("year") && String(initialStudyYear || "") !== searchParams.get("year"))) changeScope(initialUniversityId, initialFacultyId, initialStudyYear);
    // Preference is intentionally applied only once. Explicit URL parameters always win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference.universityId, preference.studyYear]);

  function changeScope(nextUniversity: string, nextFaculty: string, nextStudyYear = studyYear) {
    const validFaculty = catalog.faculties.some((item) => item.active && item.id === nextFaculty && item.universityId === nextUniversity) ? nextFaculty : "";
    setUniversityId(nextUniversity); setFacultyId(validFaculty); setStudyYear(nextStudyYear);
    replaceQuery({ university: nextUniversity || undefined, faculty: validFaculty || undefined, year: nextStudyYear ? String(nextStudyYear) : undefined });
  }
  function applyPreferredScope() { changeScope(preference.universityId || "", preference.facultyId || "", preference.studyYear || undefined); }
  function resetFilters() {
    setQuery(""); setCategory(allCategories); setShowEnded(false); setUniversityId(""); setFacultyId(""); setStudyYear(undefined);
    replaceQuery({ q: undefined, category: undefined, ended: undefined, university: undefined, faculty: undefined, year: undefined });
  }
  function changeQuery(value: string) { setQuery(value); replaceQuery({ q: value.trim() || undefined }); }
  function changeCategory(value: string) { setCategory(value); replaceQuery({ category: value === allCategories ? undefined : value }); }
  function changeEnded(value: boolean) { setShowEnded(value); replaceQuery({ ended: value ? "1" : undefined }); }
  async function shareEvent(event: AcademicEvent) {
    const url = `${window.location.origin}${pathname}?${new URLSearchParams({ ...(universityId && { university: universityId }), ...(facultyId && { faculty: facultyId }), ...(studyYear && { year: String(studyYear) }) })}#${event.id}`;
    if (navigator.share) await navigator.share({ title: event.title, text: `${formatDate(event.start)} · ${event.school}`, url }); else await navigator.clipboard.writeText(url);
    setShareNotice(`Odkaz na událost „${event.title}“ je připraven ke sdílení.`); window.setTimeout(() => setShareNotice(""), 3000);
  }

  const scopeWithoutYear = useMemo(() => events.filter((event) => academicEventMatchesSelection(event, { universityId: universityId || undefined, facultyId: facultyId || undefined })), [events, facultyId, universityId]);
  const hasScopedYearData = scopeWithoutYear.some((event) => Boolean(event.studyYears?.length));
  const filtered = useMemo(() => events.filter((event) => includesFolded(`${event.title} ${event.description}`, query) && (category === allCategories || event.category === category) && academicEventMatchesSelection(event, { universityId: universityId || undefined, facultyId: facultyId || undefined, studyYear })), [events, query, category, universityId, facultyId, studyYear]);
  const partitioned = useMemo(() => partitionAcademicEvents(filtered), [filtered]);
  const visibleCount = partitioned.ongoing.length + partitioned.upcoming.length + (showEnded ? partitioned.ended.length : 0);
  const categories = [allCategories, ...new Set(events.map((item) => item.category))];
  const exportQuery = new URLSearchParams({ city: cityId });
  if (universityId) exportQuery.set("university", universityId); if (facultyId) exportQuery.set("faculty", facultyId); if (studyYear) exportQuery.set("year", String(studyYear)); if (category !== allCategories) exportQuery.set("category", category); if (query.trim()) exportQuery.set("q", query.trim()); if (showEnded) exportQuery.set("ended", "1");

  function renderEventCard(event: AcademicEvent) {
    const freshness = eventFreshness(event.lastVerifiedAt);
    const lifecycle = eventLifecycle(event);
    const endedQuery = lifecycle === "ended" ? "&ended=1" : "";
    return <article className={`result-card event-card ${event.changeState === "changed" ? "event-changed" : ""}`} key={event.id} id={event.id}>
      <time dateTime={event.start}><strong>{formatDayNumber(event.start)}</strong><span>{formatShortMonth(event.start)}</span></time>
      <div className="result-main"><div className="result-labels"><span className="tag">{event.category}</span><span className={`tag ${lifecycle === "ongoing" ? "tag-green" : lifecycle === "upcoming" ? "tag-blue" : ""}`}>{eventLifecycleLabel(lifecycle)}</span>{event.changeState === "changed" && <span className="sponsored">AKTUALIZOVÁNO</span>}{event.changeState === "cancelled" && <span className="sponsored">ZRUŠENO</span>}</div><h2>{event.title}</h2><p>{event.description}</p><dl className="meta-list"><div><dt>Škola / fakulta</dt><dd>{event.school} · {event.faculty}</dd></div><div><dt>{lifecycle === "ongoing" ? "Probíhá do" : "Termín"}</dt><dd>{lifecycle === "ongoing" && event.end ? formatDate(event.end) : <>{formatDate(event.start)}{event.end ? ` – ${formatDate(event.end)}` : ""}</>}</dd></div><div><dt>Stav události</dt><dd>{eventLifecycleLabel(lifecycle)}</dd></div><div><dt>Naposledy ověřen zdroj</dt><dd>{formatPragueTimestamp(event.lastVerifiedAt)}</dd></div><div><dt>Čerstvost zdroje</dt><dd><span className={`tag ${freshness.tone === "fresh" ? "tag-green" : freshness.tone === "waiting" ? "tag-blue" : ""}`}>{freshness.label}</span></dd></div></dl></div>
      <div className="card-actions">{event.sourceUrl && <a className="button button-secondary" target="_blank" rel="noopener noreferrer" href={event.sourceUrl}><ExternalLink size={16} />Oficiální zdroj</a>}<a className="button button-secondary" target="_blank" rel="noopener noreferrer" href={googleCalendarUrl(event)}><ExternalLink size={16} />Google Calendar</a><a className="button button-secondary" href={`/api/calendar/${event.id}.ics?city=${cityId}${endedQuery}`}><FileDown size={16} />Stáhnout .ics</a><button className="button button-secondary" type="button" onClick={() => shareEvent(event)}><Share2 size={16} />Sdílet</button></div>
    </article>;
  }
  function renderEventGroup(title: string, status: EventLifecycle, items: AcademicEvent[]) {
    if (!items.length) return null;
    return <section className="event-result-group" aria-labelledby={`event-group-${status}`}><div className="result-group-heading"><h2 id={`event-group-${status}`}>{title}</h2><span>{items.length}</span></div>{items.map(renderEventCard)}</section>;
  }

  return <>
    <MobileFilterToolbar open={filtersOpen} activeCount={activeFilterCount} onToggle={() => setFiltersOpen((value) => !value)} onReset={resetFilters} controlsId="calendar-filters" />
    <section id="calendar-filters" className={`filter-panel collapsible-filter-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Filtry událostí">
      <label className="search-field"><span>Hledat termín</span><div><Search size={17} /><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Např. zkouškové…" /></div></label>
      <label><span>Kategorie</span><div className="select-wrap"><select aria-label="Kategorie" value={category} onChange={(event) => changeCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Univerzita</span><div className="select-wrap"><select aria-label="Univerzita" value={universityId} onChange={(event) => changeScope(event.target.value, "")}><option value="">Všechny školy</option>{availableUniversities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Fakulta</span><div className="select-wrap"><select aria-label="Fakulta" value={facultyId} onChange={(event) => changeScope(universityId, event.target.value)} disabled={!universityId}><option value="">Všechny fakulty</option>{availableFaculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Ročník</span><div className="select-wrap"><select aria-label="Ročník" value={studyYear || ""} onChange={(event) => changeScope(universityId, facultyId, event.target.value ? Number(event.target.value) as StudyYear : undefined)}><option value="">Všechny ročníky</option>{studyYears.map((year) => <option key={year} value={year}>{year}. ročník</option>)}</select><ChevronDown size={16} /></div></label>
      <label className="checkbox-row"><input type="checkbox" checked={showEnded} onChange={(event) => changeEnded(event.target.checked)} /><span>Zobrazit ukončené</span></label>
      <div className="filter-actions"><button className="button button-secondary" type="button" onClick={resetFilters}><RotateCcw size={16} />Resetovat filtry</button>{hasPreferredScope && <button className="button button-secondary" type="button" onClick={applyPreferredScope}><School size={16} />Moje nastavení</button>}<Link className="button button-secondary" href="/nastaveni"><Settings2 size={16} />Změnit nastavení</Link><a className="button button-secondary" href={`/api/calendar/all.ics?${exportQuery}`}><FileDown size={16} />Exportovat výběr</a></div>
    </section>
    <div className="trust-note"><ShieldCheck size={18} /><p>Stav události vychází z jejího termínu. Čerstvost zdroje zvlášť říká, kdy byl veřejný zdroj naposledy ověřen.</p></div>
    {studyYear && !hasScopedYearData && <div className="info-state" role="status">Pro tento výběr zatím zdroje nerozlišují jednotlivé ročníky. Zobrazené termíny platí společně pro všechny ročníky.</div>}
    {shareNotice && <div className="success-message" role="status">{shareNotice}</div>}
    <div className="result-count"><strong>{visibleCount}</strong> ověřených událostí v relevantním výběru{!showEnded && partitioned.ended.length > 0 ? ` · ${partitioned.ended.length} v archivu` : ""}</div>
    <section className="result-stack" aria-live="polite">
      {visibleCount === 0 ? <div className="empty-state"><CalendarPlus size={26} /><h2>Žádný relevantní termín neodpovídá filtrům</h2><p>Ukončené události jsou dostupné po zapnutí volby „Zobrazit ukončené“.</p><button className="button button-secondary" onClick={resetFilters}>Resetovat filtry</button></div> : <>{renderEventGroup("Právě probíhá", "ongoing", partitioned.ongoing)}{renderEventGroup("Nadcházející termíny", "upcoming", partitioned.upcoming)}{showEnded && renderEventGroup("Ukončené · archiv", "ended", partitioned.ended)}</>}
    </section>
  </>;
}
