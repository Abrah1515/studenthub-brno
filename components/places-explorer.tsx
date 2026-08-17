"use client";

import { ChevronDown, ExternalLink, LocateFixed, MapPin, Navigation, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Place } from "@/lib/types";
import type { City } from "@/lib/cities";
import { MobileFilterToolbar } from "@/components/mobile-filter-toolbar";
import { useStudentPreference } from "@/lib/client-preferences";
import { facultiesFor, universities } from "@/lib/universities";
import { formatPragueTimestamp } from "@/lib/format";
import { includesFolded } from "@/lib/search";
import { deduplicatePlaces, googleMapsDirectionsUrl, haversineDistanceKm, type ClientLocation } from "@/lib/places";

const allCategories = "Všechny";

function PlacesMap({ items, city, userLocation }: { items: Place[]; city: City; userLocation: ClientLocation | null }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  useEffect(() => {
    let mounted = true;
    import("leaflet").then((L) => {
      if (!mounted || !element.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(element.current, { zoomControl: true, scrollWheelZoom: false, maxBounds: city.mapBounds }).setView([city.latitude, city.longitude], city.mapZoom);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      layerRef.current?.clearLayers();
      items.forEach((place) => L.circleMarker([place.lat, place.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#0b6b4d", fillOpacity: 1 }).bindTooltip(place.name).addTo(layerRef.current!));
      if (userLocation) L.circleMarker([userLocation.lat, userLocation.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("Vaše poloha").addTo(layerRef.current!);
      const points = [...items.map((place) => [place.lat, place.lng] as [number, number]), ...(userLocation ? [[userLocation.lat, userLocation.lng] as [number, number]] : [])];
      if (points.length) mapRef.current.fitBounds(L.latLngBounds(points).pad(.18), { maxZoom: 14 });
      else mapRef.current.setView([city.latitude, city.longitude], city.mapZoom);
    });
    return () => { mounted = false; };
  }, [items, city.latitude, city.longitude, city.mapBounds, city.mapZoom, userLocation]);
  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);
  return <div className="leaflet-host" ref={element} aria-label={`Interaktivní mapa míst ve městě ${city.name}`} />;
}

export function PlacesExplorer({ items, city }: { items: Place[]; city: City }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const preference = useStudentPreference();
  const [query, setQuery] = useState(search.get("q") || search.get("campus") || "");
  const [category, setCategory] = useState(search.get("category") || allCategories);
  const [selected, setSelected] = useState<string | null>(null);
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<ClientLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const urlUniversity = universities.some((item) => item.id === search.get("university")) ? search.get("university")! : "";
  const showAll = search.get("filters") === "all";
  const universityId = schoolFilter ?? (showAll ? "" : search.has("university") ? urlUniversity : preference.universityId ?? "");
  const urlFaculty = facultiesFor(universityId).some((item) => item.id === search.get("faculty")) ? search.get("faculty")! : "";
  const facultyId = facultyFilter ?? (showAll ? "" : search.has("faculty") ? urlFaculty : preference.facultyId ?? "");
  const uniqueItems = useMemo(() => deduplicatePlaces(items), [items]);
  const filtered = useMemo(() => uniqueItems.filter((place) => (category === allCategories || place.category === category) && (!universityId || !place.universityIds?.length || place.universityIds.includes(universityId)) && (!facultyId || !place.facultyIds?.length || place.facultyIds.includes(facultyId)) && includesFolded(`${place.name} ${place.address} ${place.note}`, query)), [uniqueItems, query, category, universityId, facultyId]);
  const categories = [allCategories, ...new Set(uniqueItems.map((place) => place.category))];
  const activeFilterCount = [query.trim(), category !== allCategories, universityId, facultyId].filter(Boolean).length;

  useEffect(() => {
    setQuery(search.get("q") || search.get("campus") || "");
    setCategory(search.get("category") || allCategories);
    setSchoolFilter(search.get("filters") === "all" ? "" : search.has("university") ? urlUniversity : null);
    setFacultyFilter(search.get("filters") === "all" ? "" : search.has("faculty") ? urlFaculty : null);
  }, [search, urlFaculty, urlUniversity]);

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  function resetFilters() {
    setQuery(""); setCategory(allCategories); setSchoolFilter(""); setFacultyFilter("");
    replaceQuery({ q: undefined, campus: undefined, category: undefined, university: undefined, faculty: undefined, filters: "all" });
  }
  function requestLocation() {
    if (!("geolocation" in navigator)) { setLocationStatus("error"); setLocationMessage("Tento prohlížeč polohu nepodporuje. Seznam míst zůstává plně dostupný."); return; }
    setLocationStatus("loading"); setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setUserLocation({ lat: coords.latitude, lng: coords.longitude }); setLocationStatus("ready"); setLocationMessage("Poloha se používá jen v tomto prohlížeči a nikam se neodesílá."); },
      () => { setLocationStatus("error"); setLocationMessage("Polohu se nepodařilo získat. Můžete dál používat seznam i mapu bez ní."); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return <>
    <MobileFilterToolbar open={filtersOpen} activeCount={activeFilterCount} onToggle={() => setFiltersOpen((value) => !value)} onReset={resetFilters} controlsId="places-filters" />
    <section id="places-filters" className={`filter-panel places-filters collapsible-filter-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Filtry míst"><label className="search-field"><span>Hledat místo nebo adresu</span><div><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); replaceQuery({ q: event.target.value.trim() || undefined, campus: undefined, filters: undefined }); }} placeholder="Např. studovna…" /></div></label><label><span>Kategorie</span><div className="select-wrap"><select value={category} onChange={(event) => { setCategory(event.target.value); replaceQuery({ category: event.target.value === allCategories ? undefined : event.target.value, filters: undefined }); }}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label><label><span>Univerzita</span><select aria-label="Univerzita" value={universityId} onChange={(event) => { setSchoolFilter(event.target.value); setFacultyFilter(""); replaceQuery({ university: event.target.value || undefined, faculty: undefined, filters: undefined }); }}><option value="">Všechny školy</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Fakulta</span><select value={facultyId} onChange={(event) => { setFacultyFilter(event.target.value); replaceQuery({ faculty: event.target.value || undefined, filters: undefined }); }} disabled={!universityId}><option value="">Všechny fakulty</option>{facultiesFor(universityId).map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><div className="filter-actions"><button className="button button-secondary" type="button" onClick={resetFilters}><RotateCcw size={16} />Resetovat filtry</button></div></section>
    <div className="location-toolbar"><button type="button" className="button button-secondary" onClick={requestLocation} disabled={locationStatus === "loading"}><LocateFixed size={17} />{locationStatus === "loading" ? "Zjišťuji polohu…" : userLocation ? "Aktualizovat moji polohu" : "Použít moji polohu"}</button>{locationMessage && <p className={locationStatus === "error" ? "location-error" : "location-note"} role="status">{locationMessage}</p>}</div>
    <section className="places-layout">
      <div className="places-list"><div className="result-count"><strong>{filtered.length}</strong> míst v seznamu</div>{filtered.length === 0 ? <div className="empty-state"><MapPin size={26} /><h2>Žádné místo neodpovídá filtrům</h2><p>Aktivní filtry: {[query, category !== allCategories ? category : "", universityId, facultyId].filter(Boolean).join(" · ") || "žádné"}.</p><button className="button button-secondary" onClick={resetFilters}>Resetovat filtry</button></div> : filtered.map((place) => { const distance = userLocation ? haversineDistanceKm(userLocation, { lat: place.lat, lng: place.lng }) : null; return <article id={place.id} key={place.id} className={`place-card ${selected === place.id ? "selected" : ""}`}><button className="place-card-main" type="button" onClick={() => setSelected(selected === place.id ? null : place.id)} aria-expanded={selected === place.id}><span className="place-icon"><MapPin size={19} /></span><span><span className="result-labels"><i className="tag">{place.category}</i></span><strong>{place.name}</strong><small>{place.address}</small>{distance !== null && <small className="place-distance">{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} od vás</small>}</span><LocateFixed size={17} /></button>{selected === place.id && <div className="place-details"><p>{place.whyVisit || place.note}</p><dl><div><dt>Otevírací doba</dt><dd>{place.hours || "Ověřte na webu provozovatele"}</dd></div><div><dt>Ověřeno</dt><dd>{formatPragueTimestamp(place.openingHoursVerifiedAt || place.lastVerifiedAt)}</dd></div>{place.priceLevel && <div><dt>Cenová úroveň</dt><dd>{place.priceLevel === "free" ? "zdarma" : place.priceLevel === "low" ? "nízká" : "liší se"}</dd></div>}{place.studentDiscount && <div><dt>Studentská podmínka</dt><dd>{place.studentDiscount}</dd></div>}</dl><div><a href={place.website} target="_blank" rel="noopener noreferrer" className="button button-secondary"><ExternalLink size={16} />Web</a><a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noopener noreferrer" className="button button-primary"><Navigation size={16} />Navigovat</a><a href={`/kontakt?subject=${encodeURIComponent(`Oprava místa: ${place.name}`)}`} className="text-link">Nahlásit změnu</a></div></div>}</article>; })}</div>
      <div className="map-shell"><PlacesMap items={filtered} city={city} userLocation={userLocation} /><div className="map-caption"><span><MapPin size={16} />{city.name} a okolí</span><small>Mapová data © OpenStreetMap</small></div></div>
    </section>
  </>;
}
