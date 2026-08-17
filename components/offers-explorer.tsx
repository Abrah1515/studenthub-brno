"use client";

import { ArrowUpDown, ExternalLink, RotateCcw, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Offer } from "@/lib/types";
import { MobileFilterToolbar } from "@/components/mobile-filter-toolbar";
import { formatDate, formatPragueTimestamp } from "@/lib/format";
import { useStudentPreference } from "@/lib/client-preferences";
import { facultiesFor, universities } from "@/lib/universities";
import { includesFolded } from "@/lib/search";

const allCategories = "Všechny";
const recommended = "Doporučené";

export function OffersExplorer({ items }: { items: Offer[] }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState(search.get("q") || "");
  const [category, setCategory] = useState(search.get("category") || allCategories);
  const [sort, setSort] = useState(search.get("sort") === "validity" ? "Platnost" : recommended);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const preference = useStudentPreference();
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string | null>(null);
  const showAll = search.get("filters") === "all";
  const urlUniversity = universities.some((item) => item.id === search.get("university")) ? search.get("university")! : "";
  const universityId = schoolFilter ?? (showAll ? "" : search.has("university") ? urlUniversity : preference.universityId ?? "");
  const urlFaculty = facultiesFor(universityId).some((item) => item.id === search.get("faculty")) ? search.get("faculty")! : "";
  const facultyId = facultyFilter ?? (showAll ? "" : search.has("faculty") ? urlFaculty : preference.facultyId ?? "");
  const filtered = useMemo(() => items.filter((offer) => (category === allCategories || offer.category === category) && (!universityId || !offer.universityIds?.length || offer.universityIds.includes(universityId)) && (!facultyId || !offer.facultyIds?.length || offer.facultyIds.includes(facultyId)) && includesFolded(`${offer.title} ${offer.partner} ${offer.conditions}`, query)).sort((a, b) => sort === "Platnost" ? a.validTo.localeCompare(b.validTo) : Number(b.featured) - Number(a.featured)), [items, query, category, sort, universityId, facultyId]);
  const categories = [allCategories, ...new Set(items.map((offer) => offer.category))];
  const activeFilterCount = [query.trim(), category !== allCategories, universityId, facultyId, sort !== recommended].filter(Boolean).length;

  useEffect(() => {
    setQuery(search.get("q") || "");
    setCategory(search.get("category") || allCategories);
    setSort(search.get("sort") === "validity" ? "Platnost" : recommended);
    setSchoolFilter(search.get("filters") === "all" ? "" : search.has("university") ? urlUniversity : null);
    setFacultyFilter(search.get("filters") === "all" ? "" : search.has("faculty") ? urlFaculty : null);
  }, [search, urlFaculty, urlUniversity]);

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  function resetFilters() {
    setQuery(""); setCategory(allCategories); setSchoolFilter(""); setFacultyFilter(""); setSort(recommended);
    replaceQuery({ q: undefined, category: undefined, university: undefined, faculty: undefined, sort: undefined, filters: "all" });
  }
  async function track(offer: Offer) {
    try { await fetch("/api/clicks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "offer", targetId: offer.id, destinationHost: new URL(offer.url).hostname, universityId: preference.universityId, facultyId: preference.facultyId, referralCode: sessionStorage.getItem("studenthub-referral") }) }); } catch { /* Navigace nesmí být blokovaná. */ }
  }
  return <>
    <MobileFilterToolbar open={filtersOpen} activeCount={activeFilterCount} onToggle={() => setFiltersOpen((value) => !value)} onReset={resetFilters} controlsId="offers-filters" />
    <section id="offers-filters" className={`filter-panel offers-filters collapsible-filter-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Filtry nabídek"><label className="search-field"><span>Hledat nabídku</span><div><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); replaceQuery({ q: event.target.value.trim() || undefined, filters: undefined }); }} placeholder="Název nebo partner…" /></div></label><label><span>Kategorie</span><select value={category} onChange={(event) => { setCategory(event.target.value); replaceQuery({ category: event.target.value === allCategories ? undefined : event.target.value, filters: undefined }); }}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Univerzita</span><select value={universityId} onChange={(event) => { setSchoolFilter(event.target.value); setFacultyFilter(""); replaceQuery({ university: event.target.value || undefined, faculty: undefined, filters: undefined }); }}><option value="">Všechny školy</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Fakulta</span><select value={facultyId} onChange={(event) => { setFacultyFilter(event.target.value); replaceQuery({ faculty: event.target.value || undefined, filters: undefined }); }} disabled={!universityId}><option value="">Všechny</option>{facultiesFor(universityId).map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Řazení</span><div className="select-with-icon"><ArrowUpDown size={16} /><select value={sort} onChange={(event) => { setSort(event.target.value); replaceQuery({ sort: event.target.value === "Platnost" ? "validity" : undefined, filters: undefined }); }}><option>{recommended}</option><option>Platnost</option></select></div></label><div className="filter-actions"><button className="button button-secondary" onClick={resetFilters}><RotateCcw size={16} />Resetovat filtry</button></div></section>
    <div className="result-count"><strong>{filtered.length}</strong> dostupných nabídek</div>
    <section className="offer-grid" aria-live="polite">{filtered.length === 0 ? <div className="empty-state"><Sparkles size={26} /><h2>Žádná nabídka neodpovídá filtrům</h2><p>Aktivní filtry: {[query, category !== allCategories ? category : "", universityId, facultyId].filter(Boolean).join(" · ") || "žádné"}. ISIC feed zůstává bez písemného souhlasu vypnutý.</p><button className="button button-secondary" onClick={resetFilters}>Resetovat filtry</button></div> : filtered.map((offer) => <article className={`offer-card ${offer.featured ? "featured" : ""}`} key={offer.id} id={offer.id}><div className="offer-card-top"><span className="offer-value">{offer.discount}</span><div className="result-labels"><span className="tag">{offer.category}</span>{offer.sponsored && <span className="sponsored">SPONZOROVÁNO</span>}{offer.affiliate && <span className="sponsored">AFFILIATE</span>}</div></div><h2>{offer.title}</h2><p className="partner-name">{offer.partner}</p><p>{offer.conditions}</p><dl className="meta-list"><div><dt>Platí do</dt><dd>{formatDate(offer.validTo)}</dd></div><div><dt>Ověřeno</dt><dd>{formatPragueTimestamp(offer.lastVerifiedAt)}</dd></div>{offer.requiresIsic && <div><dt>Podmínka</dt><dd>Platný průkaz ISIC</dd></div>}</dl><small className="source-note">Zdroj: <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer">veřejná stránka nabídky</a></small><div className="card-actions"><a href={offer.url} target="_blank" rel={offer.sponsored || offer.affiliate ? "sponsored nofollow noopener" : "noopener noreferrer"} onClick={() => track(offer)} className="button button-primary">Využít nabídku <ExternalLink size={16} /></a></div></article>)}</section>
  </>;
}
