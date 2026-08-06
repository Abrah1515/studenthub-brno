"use client";

import { ArrowUpDown, ExternalLink, RotateCcw, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Offer } from "@/lib/types";
import { formatDate, formatPragueTimestamp } from "@/lib/format";
import { useStudentPreference } from "@/lib/client-preferences";
import { facultiesFor, universities } from "@/lib/universities";
import { includesFolded } from "@/lib/search";

export function OffersExplorer({ items }: { items: Offer[] }) {
  const search = useSearchParams();
  const [query, setQuery] = useState(search.get("q") || "");
  const [category, setCategory] = useState(search.get("category") || "Všechny");
  const [sort, setSort] = useState("Doporučené");
  const preference = useStudentPreference();
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string | null>(null);
  const urlUniversity = universities.some((item) => item.id === search.get("university")) ? search.get("university")! : "";
  const universityId = schoolFilter ?? (search.has("university") ? urlUniversity : preference.universityId ?? "");
  const urlFaculty = facultiesFor(universityId).some((item) => item.id === search.get("faculty")) ? search.get("faculty")! : "";
  const facultyId = facultyFilter ?? (search.has("faculty") ? urlFaculty : preference.facultyId ?? "");
  const filtered = useMemo(() => items.filter((offer) => (category === "Všechny" || offer.category === category) && (!universityId || !offer.universityIds?.length || offer.universityIds.includes(universityId)) && (!facultyId || !offer.facultyIds?.length || offer.facultyIds.includes(facultyId)) && includesFolded(`${offer.title} ${offer.partner} ${offer.conditions}`, query)).sort((a, b) => sort === "Platnost" ? a.validTo.localeCompare(b.validTo) : Number(b.featured) - Number(a.featured)), [items, query, category, sort, universityId, facultyId]);
  const categories = ["Všechny", ...new Set(items.map((offer) => offer.category))];
  async function track(offer: Offer) {
    try { await fetch("/api/clicks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "offer", targetId: offer.id, destinationHost: new URL(offer.url).hostname, universityId: preference.universityId, facultyId: preference.facultyId, referralCode: sessionStorage.getItem("studenthub-referral") }) }); } catch { /* Navigace nesmí být blokovaná. */ }
  }
  return (
    <><section className="filter-panel offers-filters"><label className="search-field"><span>Hledat nabídku</span><div><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Název nebo partner…" /></div></label><label><span>Kategorie</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Univerzita</span><select value={universityId} onChange={(event) => { setSchoolFilter(event.target.value); setFacultyFilter(""); }}><option value="">Všechny školy</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Fakulta</span><select value={facultyId} onChange={(event) => setFacultyFilter(event.target.value)} disabled={!universityId}><option value="">Všechny</option>{facultiesFor(universityId).map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Řazení</span><div className="select-with-icon"><ArrowUpDown size={16} /><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Doporučené</option><option>Platnost</option></select></div></label><div className="filter-actions"><button className="button button-secondary" onClick={() => { setQuery(""); setCategory("Všechny"); setSchoolFilter(""); setFacultyFilter(""); setSort("Doporučené"); }}><RotateCcw size={16} />Resetovat filtry</button></div></section>
    <div className="result-count"><strong>{filtered.length}</strong> dostupných nabídek</div>
    <section className="offer-grid" aria-live="polite">{filtered.length === 0 ? <div className="empty-state"><Sparkles size={26} /><h2>Žádná nabídka neodpovídá filtrům</h2><p>Aktivní filtry: {[query, category !== "Všechny" ? category : "", universityId, facultyId].filter(Boolean).join(" · ") || "žádné"}. ISIC feed zůstává bez písemného souhlasu vypnutý.</p><button className="button button-secondary" onClick={() => { setQuery(""); setCategory("Všechny"); setSchoolFilter(""); setFacultyFilter(""); }}>Resetovat filtry</button></div> : filtered.map((offer) => <article className={`offer-card ${offer.featured ? "featured" : ""}`} key={offer.id} id={offer.id}><div className="offer-card-top"><span className="offer-value">{offer.discount}</span><div className="result-labels"><span className="tag">{offer.category}</span>{offer.sponsored && <span className="sponsored">SPONZOROVÁNO</span>}{offer.affiliate && <span className="sponsored">AFFILIATE</span>}</div></div><h2>{offer.title}</h2><p className="partner-name">{offer.partner}</p><p>{offer.conditions}</p><dl className="meta-list"><div><dt>Platí do</dt><dd>{formatDate(offer.validTo)}</dd></div><div><dt>Ověřeno</dt><dd>{formatPragueTimestamp(offer.lastVerifiedAt)}</dd></div>{offer.requiresIsic && <div><dt>Podmínka</dt><dd>Platný průkaz ISIC</dd></div>}</dl><small className="source-note">Zdroj: <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer">veřejná stránka nabídky</a></small><div className="card-actions"><a href={offer.url} target="_blank" rel={offer.sponsored || offer.affiliate ? "sponsored nofollow noopener" : "noopener noreferrer"} onClick={() => track(offer)} className="button button-primary">Využít nabídku <ExternalLink size={16} /></a></div></article>)}</section></>
  );
}
