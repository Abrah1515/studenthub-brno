"use client";

import Image from "next/image";
import { Beer, BookOpen, BriefcaseBusiness, ChevronDown, Coffee, Dumbbell, ExternalLink, Library, LocateFixed, MapPin, Navigation, PlusCircle, RotateCcw, Search, Sandwich, Toilet, Utensils, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Place } from "@/lib/types";
import type { City } from "@/lib/cities";
import { MobileFilterToolbar } from "@/components/mobile-filter-toolbar";
import { useStudentPreference } from "@/lib/client-preferences";
import { facultiesFor, universities } from "@/lib/universities";
import { formatPragueTimestamp } from "@/lib/format";
import { includesFolded } from "@/lib/search";
import { deduplicatePlaces, googleMapsDirectionsUrl, haversineDistanceKm, type ClientLocation } from "@/lib/places";
import { PlaceLiveStatus } from "@/components/place-live-status";
import type { PlaceLiveSummary } from "@/lib/place-live-status";
import { isPlaceOpenNow, placeCategoryCodes, placeCategoryColors, placeCategoryLabels, type PlaceCategoryCode } from "@/lib/place-community";
import { PlaceSuggestionDialog } from "@/components/place-suggestion-dialog";
import { PlaceExperiences } from "@/components/place-experiences";

const allCategories = "Všechny";
const categorySymbols: Record<PlaceCategoryCode,string>={restaurant:"R",cafe:"K",pub_bar:"B",fast_food:"F",canteen:"M",library:"L",study_room:"S",coworking:"C",public_toilet:"WC",sport:"P",student_service:"i",other:"•"};
function categoryCode(place:Place):PlaceCategoryCode{return place.categoryCode||placeCategoryCodes.find((code)=>placeCategoryLabels[code]===place.category)||"other";}
function CategoryIcon({place,size=19}:{place:Place;size?:number}){if(place.coverImageUrl)return <Image className="place-cover-thumb" src={place.coverImageUrl} alt="" width={42} height={42} unoptimized/>;const props={size,"aria-hidden":true};switch(categoryCode(place)){case"restaurant":return <Utensils {...props}/>;case"cafe":return <Coffee {...props}/>;case"pub_bar":return <Beer {...props}/>;case"fast_food":return <Sandwich {...props}/>;case"canteen":return <Utensils {...props}/>;case"library":return <Library {...props}/>;case"study_room":return <BookOpen {...props}/>;case"coworking":return <BriefcaseBusiness {...props}/>;case"public_toilet":return <Toilet {...props}/>;case"sport":return <Dumbbell {...props}/>;case"student_service":return <Wrench {...props}/>;default:return <MapPin {...props}/>;}}

function PlacesMap({ items, city, userLocation, selectedId, onSelect }: { items: Place[]; city: City; userLocation: ClientLocation | null; selectedId: string | null; onSelect: (id: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markerRefs = useRef(new Map<string, import("leaflet").Marker>());
  const selectedRef = useRef(selectedId);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => {
    let mounted = true;
    import("leaflet").then((L) => {
      if (!mounted || !element.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(element.current, { zoomControl: false, scrollWheelZoom: true, touchZoom: true, keyboard: true, maxBounds: city.mapBounds, wheelDebounceTime: 80, wheelPxPerZoomLevel: 120 }).setView([city.latitude, city.longitude], city.mapZoom);
        L.control.zoom({ position: "topright" }).addTo(mapRef.current);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      layerRef.current?.clearLayers(); markerRefs.current.clear();
      items.forEach((place) => {
        const active = selectedRef.current === place.id; const code=categoryCode(place); const icon=()=>L.divIcon({className:`place-map-marker ${active?"selected":""}`,html:`<span style="--marker-color:${placeCategoryColors[code]}">${categorySymbols[code]}</span>`,iconSize:[active?38:32,active?38:32],iconAnchor:[active?19:16,active?19:16],popupAnchor:[0,-18]}); const marker = L.marker([place.lat, place.lng],{icon:icon(),riseOnHover:true,zIndexOffset:active?500:0,keyboard:true});
        const popup = document.createElement("strong"); popup.textContent = place.name;
        marker.bindPopup(popup).on("click", () => onSelect(place.id)).addTo(layerRef.current!);
        markerRefs.current.set(place.id, marker);
        const path = marker.getElement();
        if (path) { path.setAttribute("tabindex", "0"); path.setAttribute("role", "button"); path.setAttribute("aria-label", `Vybrat místo ${place.name}`); path.addEventListener("keydown", (event) => { if (event instanceof KeyboardEvent && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(place.id); } }); }
      });
      if (userLocation) L.circleMarker([userLocation.lat, userLocation.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).bindTooltip("Vaše poloha").addTo(layerRef.current!);
      const points = [...items.map((place) => [place.lat, place.lng] as [number, number]), ...(userLocation ? [[userLocation.lat, userLocation.lng] as [number, number]] : [])];
      if (userLocation) mapRef.current.setView([userLocation.lat, userLocation.lng], Math.max(mapRef.current.getZoom(), 15), { animate: true });
      else if (points.length) mapRef.current.fitBounds(L.latLngBounds(points).pad(.18), { maxZoom: 14 });
      else mapRef.current.setView([city.latitude, city.longitude], city.mapZoom);
      const pendingMarker = selectedRef.current ? markerRefs.current.get(selectedRef.current) : undefined; if (pendingMarker) { mapRef.current.flyTo(pendingMarker.getLatLng(), Math.max(mapRef.current.getZoom(), 15), { duration: .45 }); pendingMarker.openPopup(); }
    });
    return () => { mounted = false; };
  }, [items, city.latitude, city.longitude, city.mapBounds, city.mapZoom, userLocation, onSelect]);
  useEffect(() => {
    let mounted=true;import("leaflet").then((L)=>{if(!mounted)return;markerRefs.current.forEach((marker, id) => { const place=items.find((item)=>item.id===id);if(!place)return;const active=id===selectedId;const code=categoryCode(place);marker.setIcon(L.divIcon({className:`place-map-marker ${active?"selected":""}`,html:`<span style="--marker-color:${placeCategoryColors[code]}">${categorySymbols[code]}</span>`,iconSize:[active?38:32,active?38:32],iconAnchor:[active?19:16,active?19:16],popupAnchor:[0,-18]}));marker.setZIndexOffset(active?500:0); });if (!selectedId) return;const marker = markerRefs.current.get(selectedId); const map = mapRef.current;if (!marker || !map) return;map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), { duration: .45 }); marker.openPopup();});return()=>{mounted=false};
  }, [selectedId,items]);
  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);
  return <div className="leaflet-host" ref={element} aria-label={`Interaktivní mapa míst ve městě ${city.name}`} />;
}

export function PlacesExplorer({ items, city }: { items: Place[]; city: City }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const preference = useStudentPreference();
  const campusQuery = search.get("campus") || "";
  const [query, setQuery] = useState(search.get("q") || search.get("campus") || "");
  const [category, setCategory] = useState(search.get("category") || allCategories);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapPreview, setMapPreview] = useState<string | null>(null);
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<ClientLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [sortMode, setSortMode] = useState<"default" | "distance">("default");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [openNowOnly,setOpenNowOnly]=useState(false);
  const [priceFilter,setPriceFilter]=useState("");
  const [studyOnly,setStudyOnly]=useState(false);
  const [wifiOnly,setWifiOnly]=useState(false);
  const [outletsOnly,setOutletsOnly]=useState(false);
  const [originFilter,setOriginFilter]=useState<"all"|"official"|"community">("all");
  const [suggestionOpen,setSuggestionOpen]=useState(search.get("navrh")==="1");
  const [correctionPlace,setCorrectionPlace]=useState<Place|null>(null);
  const [liveSummaries, setLiveSummaries] = useState<Record<string, PlaceLiveSummary>>({});
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const lastMarkerTap = useRef<{ id: string; at: number } | null>(null);
  const markerResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlUniversity = universities.some((item) => item.id === search.get("university")) ? search.get("university")! : "";
  const showAll = search.get("filters") === "all";
  const universityId = schoolFilter ?? (showAll ? "" : search.has("university") ? urlUniversity : preference.universityId ?? "");
  const urlFaculty = facultiesFor(universityId).some((item) => item.id === search.get("faculty")) ? search.get("faculty")! : "";
  const facultyId = facultyFilter ?? (showAll ? "" : search.has("faculty") ? urlFaculty : preference.facultyId ?? "");
  const uniqueItems = useMemo(() => deduplicatePlaces(items), [items]);
  const filtered = useMemo(() => uniqueItems.filter((place) => { const haystack = `${place.name} ${place.address} ${place.note} ${place.whyVisit || ""}`; const campusStem = campusQuery.length > 4 ? campusQuery.slice(0, -2) : campusQuery; return (category === allCategories || place.category === category) && (!universityId || !place.universityIds?.length || place.universityIds.includes(universityId)) && (!facultyId || !place.facultyIds?.length || place.facultyIds.includes(facultyId)) && (!availableOnly || liveSummaries[place.id]?.available) && (!openNowOnly||isPlaceOpenNow(place.hours)) && (!priceFilter||place.priceLevel===priceFilter) && (!studyOnly||place.studySuitable===true) && (!wifiOnly||place.wifiAvailable===true) && (!outletsOnly||place.outletsAvailable===true) && (originFilter==="all"||(place.origin||"official")===originFilter) && (includesFolded(haystack, query) || Boolean(campusQuery && campusStem && includesFolded(haystack, campusStem))); }).sort((a, b) => sortMode === "distance" && userLocation ? haversineDistanceKm(userLocation, { lat: a.lat, lng: a.lng }) - haversineDistanceKm(userLocation, { lat: b.lat, lng: b.lng }) : a.name.localeCompare(b.name, "cs-CZ")), [uniqueItems, query, campusQuery, category, universityId, facultyId, availableOnly,openNowOnly,priceFilter,studyOnly,wifiOnly,outletsOnly,originFilter, liveSummaries, sortMode, userLocation]);
  const categories = [allCategories,...placeCategoryCodes.map((code)=>placeCategoryLabels[code])];
  const activeFilterCount = [query.trim(), category !== allCategories, universityId, facultyId, availableOnly,openNowOnly,priceFilter,studyOnly,wifiOnly,outletsOnly,originFilter!=="all", sortMode !== "default"].filter(Boolean).length;

  useEffect(() => {
    const ids = uniqueItems.map((item) => item.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id)); if (!ids.length) return;
    fetch(`/api/places/live-status?ids=${ids.join(",")}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => { if (payload?.summaries) setLiveSummaries(payload.summaries); }).catch(() => undefined);
  }, [uniqueItems]);

  useEffect(() => {
    setQuery(search.get("q") || search.get("campus") || "");
    setCategory(search.get("category") || allCategories);
    setSchoolFilter(search.get("filters") === "all" ? "" : search.has("university") ? urlUniversity : null);
    setFacultyFilter(search.get("filters") === "all" ? "" : search.has("faculty") ? urlFaculty : null);
  }, [search, urlFaculty, urlUniversity]);
  useEffect(()=>{if(search.get("navrh")==="1")setSuggestionOpen(true)},[search]);
  useEffect(() => () => { if (markerResetTimer.current) clearTimeout(markerResetTimer.current); }, []);

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  function resetFilters() {
    setQuery(""); setCategory(allCategories); setSchoolFilter(""); setFacultyFilter(""); setAvailableOnly(false);setOpenNowOnly(false);setPriceFilter("");setStudyOnly(false);setWifiOnly(false);setOutletsOnly(false);setOriginFilter("all"); setSortMode("default");
    replaceQuery({ q: undefined, campus: undefined, category: undefined, university: undefined, faculty: undefined, filters: "all" });
  }
  function requestLocation() {
    if (!("geolocation" in navigator)) { setLocationStatus("error"); setLocationMessage("Tento prohlížeč polohu nepodporuje. Seznam míst zůstává plně dostupný."); return; }
    setLocationStatus("loading"); setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setUserLocation({ lat: coords.latitude, lng: coords.longitude }); setSortMode("distance"); setLocationStatus("ready"); setLocationMessage(coords.accuracy > 1000 ? `Poloha je na tomto zařízení jen přibližná (±${Math.round(coords.accuracy / 100) * 100} m). Nikam ji neukládáme.` : "Poloha se používá jen v tomto prohlížeči a nikam se neodesílá."); },
      (error) => { setLocationStatus("error"); setLocationMessage(error.code === error.PERMISSION_DENIED ? "Přístup k poloze je zamítnutý. Povolte jej v nastavení webu; seznam i mapa fungují dál." : error.code === error.TIMEOUT ? "Zjištění polohy vypršelo. Zkontrolujte zapnutou polohu a zkuste to znovu." : "Služba polohy teď není dostupná. Seznam i mapa fungují dál bez ní."); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }
  const selectFromMap = useCallback((id: string) => {
    const mobile = window.matchMedia("(max-width: 720px)").matches; const now = Date.now(); const secondTap = mobile && lastMarkerTap.current?.id === id && now - lastMarkerTap.current.at < 8_000;
    if (mobile && !secondTap) {
      setMapPreview(id); lastMarkerTap.current = { id, at: now };
      if (markerResetTimer.current) clearTimeout(markerResetTimer.current); markerResetTimer.current = setTimeout(() => { lastMarkerTap.current = null; setMapPreview(null); }, 8_000);
      return;
    }
    setMapPreview(null); setSelected(id); window.requestAnimationFrame(() => cardRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    lastMarkerTap.current = null; if (markerResetTimer.current) clearTimeout(markerResetTimer.current);
  }, []);

  return <>
    <MobileFilterToolbar open={filtersOpen} activeCount={activeFilterCount} onToggle={() => setFiltersOpen((value) => !value)} onReset={resetFilters} controlsId="places-filters" />
    <section id="places-filters" className={`filter-panel places-filters collapsible-filter-panel ${filtersOpen ? "is-open" : ""}`} aria-label="Filtry míst"><label className="search-field"><span>Hledat místo nebo adresu</span><div><Search size={17}/><input value={query} onChange={(event)=>{setQuery(event.target.value);replaceQuery({q:event.target.value.trim()||undefined,campus:undefined,filters:undefined})}} placeholder="Např. knihovna, Veveří…"/></div></label><label><span>Kategorie</span><div className="select-wrap"><select value={category} onChange={(event)=>{setCategory(event.target.value);replaceQuery({category:event.target.value===allCategories?undefined:event.target.value,filters:undefined})}}>{categories.map((item)=><option key={item}>{item}</option>)}</select><ChevronDown size={16}/></div></label><label><span>Univerzita</span><select aria-label="Univerzita" value={universityId} onChange={(event)=>{setSchoolFilter(event.target.value);setFacultyFilter("");replaceQuery({university:event.target.value||undefined,faculty:undefined,filters:undefined})}}><option value="">Všechny školy</option>{universities.map((item)=><option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Fakulta</span><select value={facultyId} onChange={(event)=>{setFacultyFilter(event.target.value);replaceQuery({faculty:event.target.value||undefined,filters:undefined})}} disabled={!universityId}><option value="">Všechny fakulty</option>{facultiesFor(universityId).map((item)=><option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label><label><span>Cena</span><select value={priceFilter} onChange={(event)=>setPriceFilter(event.target.value)}><option value="">Všechny ceny</option><option value="free">Zdarma</option><option value="low">Nízká</option><option value="medium">Střední</option><option value="high">Vyšší</option><option value="varies">Liší se</option></select></label><label><span>Původ záznamu</span><select value={originFilter} onChange={(event)=>setOriginFilter(event.target.value as typeof originFilter)}><option value="all">Všechny zdroje</option><option value="official">Ověřený veřejný zdroj</option><option value="community">Komunitní návrh</option></select></label><label><span>Řazení</span><select value={sortMode} onChange={(event)=>setSortMode(event.target.value as "default"|"distance")}><option value="default">Podle názvu</option><option value="distance" disabled={!userLocation}>Podle vzdálenosti</option></select></label><div className="place-quick-filters"><label><input type="checkbox" checked={openNowOnly} onChange={(event)=>setOpenNowOnly(event.target.checked)}/>Aktuálně otevřeno</label><label><input type="checkbox" checked={availableOnly} onChange={(event)=>setAvailableOnly(event.target.checked)}/>Aktuálně dostupné</label><label><input type="checkbox" checked={studyOnly} onChange={(event)=>setStudyOnly(event.target.checked)}/>Vhodné ke studiu</label><label><input type="checkbox" checked={wifiOnly} onChange={(event)=>setWifiOnly(event.target.checked)}/>Wi‑Fi</label><label><input type="checkbox" checked={outletsOnly} onChange={(event)=>setOutletsOnly(event.target.checked)}/>Zásuvky</label></div><div className="filter-actions"><button className="button button-secondary" type="button" onClick={resetFilters}><RotateCcw size={16}/>Resetovat filtry</button></div></section>
    <div className="location-toolbar"><button type="button" className="button button-secondary" onClick={requestLocation} disabled={locationStatus==="loading"}><LocateFixed size={17}/>{locationStatus==="loading"?"Zjišťuji polohu…":userLocation?"Aktualizovat moji polohu":"Použít moji polohu"}</button><button type="button" className="button button-primary" data-testid="suggest-place" onClick={()=>{setCorrectionPlace(null);setSuggestionOpen(true)}}><PlusCircle size={17}/>Navrhnout nové místo</button>{userLocation&&filtered[0]&&<span className="nearest-place">Nejblíž: <strong>{filtered[0].name}</strong></span>}{locationMessage&&<p className={locationStatus==="error"?"location-error":"location-note"} role="status">{locationMessage}</p>}</div>
    <section className="places-layout">
      <div className="places-list"><div className="result-count"><strong>{filtered.length}</strong> míst v seznamu</div>{filtered.length===0?<div className="empty-state"><MapPin size={26}/><h2>Žádné místo neodpovídá filtrům</h2><p>Upravte hledání, vymažte filtry, nebo navrhněte chybějící veřejné místo.</p><div><button className="button button-secondary" onClick={resetFilters}>Vymazat filtry</button><button className="button button-primary" onClick={()=>{setCorrectionPlace(null);setSuggestionOpen(true)}}><PlusCircle size={16}/>Navrhnout místo</button></div></div>:filtered.map((place)=>{const distance=userLocation?haversineDistanceKm(userLocation,{lat:place.lat,lng:place.lng}):null;const proximityBand=distance!==null&&distance<=1?"near" as const:"unknown" as const;return <article ref={(node)=>{if(node)cardRefs.current.set(place.id,node);else cardRefs.current.delete(place.id)}} id={place.id} key={place.id} className={`place-card ${selected===place.id?"selected":""}`}><button className="place-card-main" type="button" onClick={()=>setSelected(selected===place.id?null:place.id)} aria-expanded={selected===place.id}><span className={`place-icon category-${categoryCode(place)}`}><CategoryIcon place={place}/></span><span><span className="result-labels"><i className="tag">{place.category}</i>{place.origin==="community"&&<i className="tag community-origin">Komunitní návrh</i>}{liveSummaries[place.id]?.code!=="unknown"&&<i className={`tag live-${liveSummaries[place.id]?.code}`}>{liveSummaries[place.id]?.label}</i>}</span><strong>{place.name}</strong><small>{place.address}</small>{distance!==null&&<small className="place-distance">{distance<1?`${Math.round(distance*1000)} m`:`${distance.toFixed(1)} km`} od vás</small>}<span className="place-feature-tags">{place.studySuitable&&<i>Studium</i>}{place.wifiAvailable&&<i>Wi‑Fi</i>}{place.outletsAvailable&&<i>Zásuvky</i>}{place.accessibility==="accessible"&&<i>Bezbariérové</i>}</span></span><LocateFixed size={17}/></button>{selected===place.id&&<div className="place-details"><p>{place.whyVisit||place.note}</p><dl>{(place.accessConditions||place.studentDiscount)&&<div><dt>Podmínky přístupu</dt><dd>{place.accessConditions||place.studentDiscount}</dd></div>}<div><dt>Otevírací doba</dt><dd>{place.hours||"Ověřte na webu provozovatele"}{place.hours&&isPlaceOpenNow(place.hours)?" · nyní pravděpodobně otevřeno":""}</dd></div><div><dt>Ověřeno</dt><dd>{formatPragueTimestamp(place.openingHoursVerifiedAt||place.lastVerifiedAt)}{place.sourceSyncStatus&&place.sourceSyncStatus!=="verified"?" · změna čeká na kontrolu":""}</dd></div>{place.priceLevel&&<div><dt>Cenová úroveň</dt><dd>{place.priceLevel==="free"?"zdarma":place.priceLevel==="low"?"nízká":place.priceLevel==="medium"?"střední":place.priceLevel==="high"?"vyšší":"liší se"}</dd></div>}</dl><PlaceLiveStatus placeId={place.id} category={place.category} initialSummary={liveSummaries[place.id]} proximityBand={proximityBand} onChange={(summary)=>setLiveSummaries((current)=>({...current,[place.id]:summary}))}/><div className="place-detail-actions">{place.website&&<a href={place.website} target="_blank" rel="noopener noreferrer" className="button button-secondary"><ExternalLink size={16}/>Web</a>}<a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noopener noreferrer" className="button button-primary"><Navigation size={16}/>Navigovat</a><button type="button" className="text-link" onClick={()=>{setCorrectionPlace(place);setSuggestionOpen(true)}}>Navrhnout opravu údajů</button></div><PlaceExperiences placeId={place.id} placeName={place.name}/></div>}</article>})}</div>
      <div className="map-shell"><PlacesMap items={filtered} city={city} userLocation={userLocation} selectedId={mapPreview||selected} onSelect={selectFromMap}/><div className="map-caption"><span><MapPin size={16}/>{city.name} a okolí</span><small>Kolečko a touchpad mění přiblížení jen nad mapou · © OpenStreetMap</small></div></div>
    </section>
    <PlaceSuggestionDialog key={correctionPlace?.id||"new"} open={suggestionOpen} onClose={()=>{setSuggestionOpen(false);setCorrectionPlace(null);if(search.get("navrh")==="1")replaceQuery({navrh:undefined})}} city={city} correctionPlace={correctionPlace} onOpenExisting={(id)=>{setSelected(id);window.requestAnimationFrame(()=>cardRefs.current.get(id)?.scrollIntoView({block:"center",behavior:"smooth"}))}}/>
  </>;
}
