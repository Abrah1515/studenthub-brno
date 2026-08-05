"use client";

import { ChevronDown, ExternalLink, LocateFixed, MapPin, Navigation, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Place } from "@/lib/types";
import type { City } from "@/lib/cities";
import { useStudentPreference } from "@/lib/client-preferences";
import { facultiesFor, universities } from "@/lib/universities";
import { formatDate } from "@/lib/format";

function PlacesMap({ items, city }: { items: Place[]; city: City }) {
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
      items.forEach((place) => L.circleMarker([place.lat, place.lng], { radius: 8, color: "#fff", weight: 2, fillColor: "#0b6b4d", fillOpacity: 1 }).bindPopup(`<strong>${place.name}</strong><br>${place.address}`).addTo(layerRef.current!));
      if (items.length) {
        const bounds = L.latLngBounds(items.map((place) => [place.lat, place.lng] as [number, number]));
        mapRef.current.fitBounds(bounds.pad(.18), { maxZoom: 14 });
      } else mapRef.current.setView([city.latitude, city.longitude], city.mapZoom);
    });
    return () => { mounted = false; };
  }, [items, city.latitude, city.longitude, city.mapBounds, city.mapZoom]);
  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);
  return <div className="leaflet-host" ref={element} aria-label={`Interaktivní mapa míst ve městě ${city.name}`} />;
}

export function PlacesExplorer({ items, city }: { items: Place[]; city: City }) {
  const search = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Všechny");
  const [selected, setSelected] = useState<string | null>(null);
  const preference = useStudentPreference();
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string | null>(null);
  const urlUniversity = universities.some((item) => item.id === search.get("university")) ? search.get("university")! : "";
  const universityId = schoolFilter ?? (search.has("university") ? urlUniversity : preference.universityId ?? "");
  const urlFaculty = facultiesFor(universityId).some((item) => item.id === search.get("faculty")) ? search.get("faculty")! : "";
  const facultyId = facultyFilter ?? (search.has("faculty") ? urlFaculty : preference.facultyId ?? "");
  const filtered = useMemo(() => items.filter((place) => (category === "Všechny" || place.category === category) && (!universityId || !place.universityIds?.length || place.universityIds.includes(universityId)) && (!facultyId || !place.facultyIds?.length || place.facultyIds.includes(facultyId)) && `${place.name} ${place.address}`.toLowerCase().includes(query.toLowerCase())), [items, query, category, universityId, facultyId]);
  const categories = ["Všechny", ...new Set(items.map((place) => place.category))];
  return (
    <>
      <section className="filter-panel places-filters" aria-label="Filtry míst"><label className="search-field"><span>Hledat místo nebo adresu</span><div><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Např. studovna…" /></div></label><label><span>Kategorie</span><div className="select-wrap"><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label><label><span>Univerzita</span><select aria-label="Univerzita" value={universityId} onChange={(event) => { setSchoolFilter(event.target.value); setFacultyFilter(""); }}><option value="">Všechny školy</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Fakulta</span><select value={facultyId} onChange={(event) => setFacultyFilter(event.target.value)} disabled={!universityId}><option value="">Všechny fakulty</option>{facultiesFor(universityId).map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label></section>
      <section className="places-layout">
        <div className="places-list"><div className="result-count"><strong>{filtered.length}</strong> míst v seznamu</div>{filtered.length === 0 ? <div className="empty-state"><MapPin size={26} /><h2>Zatím žádné ověřené místo</h2><p>Změňte filtry nebo nám pošlete tip k ověření.</p></div> : filtered.map((place) => <article id={place.id} key={place.id} className={`place-card ${selected === place.id ? "selected" : ""}`}><button className="place-card-main" type="button" onClick={() => setSelected(selected === place.id ? null : place.id)} aria-expanded={selected === place.id}><span className="place-icon"><MapPin size={19} /></span><span><span className="result-labels"><i className="tag">{place.category}</i></span><strong>{place.name}</strong><small>{place.address}</small></span><LocateFixed size={17} /></button>{selected === place.id && <div className="place-details"><p>{place.note}</p><dl><div><dt>Otevírací doba</dt><dd>{place.hours || "Ověřte na webu provozovatele"}</dd></div><div><dt>Ověřeno</dt><dd>{formatDate(place.lastVerifiedAt)}</dd></div></dl><div><a href={place.website} target="_blank" rel="noopener noreferrer" className="button button-secondary"><ExternalLink size={16} />Web</a><a href={`https://www.openstreetmap.org/directions?to=${place.lat}%2C${place.lng}`} target="_blank" rel="noopener noreferrer" className="button button-primary"><Navigation size={16} />Navigovat</a><a href={`/kontakt?subject=${encodeURIComponent(`Oprava místa: ${place.name}`)}`} className="text-link">Nahlásit změnu</a></div></div>}</article>)}</div>
        <div className="map-shell"><PlacesMap items={filtered} city={city} /><div className="map-caption"><span><MapPin size={16} />{city.name} a okolí</span><small>Mapová data © OpenStreetMap</small></div></div>
      </section>
    </>
  );
}
