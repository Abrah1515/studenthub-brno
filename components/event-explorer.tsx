"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, ChevronDown, ExternalLink, FileDown, RotateCcw, Search, Settings2, Share2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AcademicEvent } from "@/lib/types";
import { formatDate, formatDayNumber, formatShortMonth } from "@/lib/format";
import { useAcademicCatalog } from "@/components/academic-catalog-provider";
import { useStudentPreference } from "@/lib/client-preferences";
import { googleCalendarUrl } from "@/lib/calendar-export";

function matchesSelection(event: AcademicEvent, universityId: string, facultyId: string) {
  if (!universityId || event.scope === "city" || event.scope === "brno" || event.scope === "national") return !universityId || ["city", "brno", "national"].includes(event.scope || "") || event.universityId === universityId;
  if (event.universityId !== universityId) return false;
  if (!facultyId) return true;
  return !event.facultyId || event.facultyId === facultyId;
}

export function EventExplorer({ events, initialUniversityId = "", initialFacultyId = "", cityId }: { events: AcademicEvent[]; initialUniversityId?: string; initialFacultyId?: string; cityId: string }) {
  const catalog = useAcademicCatalog(); const preference = useStudentPreference(catalog); const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("Všechny"); const [universityId, setUniversityId] = useState(initialUniversityId); const [facultyId, setFacultyId] = useState(initialFacultyId); const [shareNotice, setShareNotice] = useState(""); const initialized = useRef(false);
  const availableUniversities = useMemo(() => catalog.universities.filter((item) => item.active), [catalog]);
  const availableFaculties = useMemo(() => catalog.faculties.filter((item) => item.active && item.universityId === universityId), [catalog, universityId]);
  useEffect(() => { setUniversityId(initialUniversityId); setFacultyId(initialFacultyId); }, [initialFacultyId, initialUniversityId]);
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    const hasSelection = searchParams.has("university") || searchParams.has("faculty");
    if (!hasSelection && preference.universityId) changeScope(preference.universityId, preference.facultyId || "");
    else if (searchParams.get("university") !== initialUniversityId || (searchParams.get("faculty") || "") !== initialFacultyId) changeScope(initialUniversityId, initialFacultyId);
    // Preference is intentionally applied only once; reset must remain reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference.universityId]);
  function changeScope(nextUniversity: string, nextFaculty: string) {
    const validFaculty = catalog.faculties.some((item) => item.active && item.id === nextFaculty && item.universityId === nextUniversity) ? nextFaculty : "";
    setUniversityId(nextUniversity); setFacultyId(validFaculty);
    const next = new URLSearchParams(searchParams.toString());
    if (nextUniversity) next.set("university", nextUniversity); else next.delete("university");
    if (validFaculty) next.set("faculty", validFaculty); else next.delete("faculty");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  function resetFilters() { setQuery(""); setCategory("Všechny"); changeScope("", ""); }
  async function shareEvent(event: AcademicEvent) {
    const url = `${window.location.origin}${pathname}?${new URLSearchParams({ ...(universityId && { university: universityId }), ...(facultyId && { faculty: facultyId }) })}#${event.id}`;
    if (navigator.share) await navigator.share({ title: event.title, text: `${formatDate(event.start)} · ${event.school}`, url }); else await navigator.clipboard.writeText(url);
    setShareNotice(`Odkaz na událost „${event.title}“ je připraven ke sdílení.`); window.setTimeout(() => setShareNotice(""), 3000);
  }
  const filtered = useMemo(() => events.filter((event) => event.title.toLowerCase().includes(query.toLowerCase()) && (category === "Všechny" || event.category === category) && matchesSelection(event, universityId, facultyId)), [events, query, category, universityId, facultyId]);
  const categories = ["Všechny", ...new Set(events.map((item) => item.category))];
  const exportQuery = new URLSearchParams({ city: cityId }); if (universityId) exportQuery.set("university", universityId); if (facultyId) exportQuery.set("faculty", facultyId); if (category !== "Všechny") exportQuery.set("category", category); if (query.trim()) exportQuery.set("q", query.trim());
  return <>
    <section className="filter-panel" aria-label="Filtry událostí">
      <label className="search-field"><span>Hledat termín</span><div><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Např. zkouškové…" /></div></label>
      <label><span>Kategorie</span><div className="select-wrap"><select aria-label="Kategorie" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Univerzita</span><div className="select-wrap"><select aria-label="Univerzita" value={universityId} onChange={(e) => changeScope(e.target.value, "")}><option value="">Všechny školy</option>{availableUniversities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Fakulta</span><div className="select-wrap"><select aria-label="Fakulta" value={facultyId} onChange={(e) => changeScope(universityId, e.target.value)} disabled={!universityId}><option value="">Všechny fakulty</option>{availableFaculties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} /></div></label>
      <div className="filter-actions"><button className="button button-secondary" type="button" onClick={resetFilters}><RotateCcw size={16} />Resetovat filtry</button><Link className="button button-secondary" href="/nastaveni"><Settings2 size={16} />Změnit fakultu</Link><a className="button button-secondary" href={`/api/calendar/all.ics?${exportQuery}`}><FileDown size={16} />Exportovat výběr</a></div>
    </section>
    <div className="trust-note"><ShieldCheck size={18} /><p>Automaticky načtené změny s nízkou jistotou čekají na ruční kontrolu a veřejně se nezobrazí.</p></div>
    {shareNotice && <div className="success-message" role="status">{shareNotice}</div>}
    <section className="result-stack" aria-live="polite"><div className="result-count"><strong>{filtered.length}</strong> ověřených událostí</div>
      {filtered.length === 0 ? <div className="empty-state"><CalendarPlus size={26} /><h2>Zatím žádný ověřený termín</h2><p>Změňte filtry nebo zkontrolujte oficiální harmonogram své fakulty.</p></div> : filtered.map((event) => <article className={`result-card event-card ${event.changeState === "changed" ? "event-changed" : ""}`} key={event.id} id={event.id}>
        <time dateTime={event.start}><strong>{formatDayNumber(event.start)}</strong><span>{formatShortMonth(event.start)}</span></time>
        <div className="result-main"><div className="result-labels"><span className="tag">{event.category}</span>{event.changeState === "changed" && <span className="sponsored">AKTUALIZOVÁNO</span>}{event.changeState === "cancelled" && <span className="sponsored">ZRUŠENO</span>}</div><h2>{event.title}</h2><p>{event.description}</p><dl className="meta-list"><div><dt>Škola / fakulta</dt><dd>{event.school} · {event.faculty}</dd></div><div><dt>Termín</dt><dd>{formatDate(event.start)}{event.end ? ` – ${formatDate(event.end)}` : ""}</dd></div><div><dt>Úroveň</dt><dd>{event.scope || "faculty"}</dd></div><div><dt>Naposledy ověřeno</dt><dd>{formatDate(event.lastVerifiedAt)}</dd></div></dl><small className="source-note">Zdroj: {event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">{event.sourceDocumentTitle || event.source}</a> : event.source}</small></div>
        <div className="card-actions"><a className="button button-secondary" target="_blank" rel="noopener noreferrer" href={googleCalendarUrl(event)}><ExternalLink size={16} />Google Calendar</a><a className="button button-secondary" href={`/api/calendar/${event.id}.ics?city=${cityId}`}><FileDown size={16} />Stáhnout .ics</a><button className="button button-secondary" type="button" onClick={() => shareEvent(event)}><Share2 size={16} />Sdílet</button></div>
      </article>)}
    </section>
  </>;
}
