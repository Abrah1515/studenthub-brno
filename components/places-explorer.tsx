"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Armchair, Beer, BookOpen, BriefcaseBusiness, ChevronDown, Coffee, Droplets,
  Dumbbell, ExternalLink, HeartHandshake, Layers3, Library, LocateFixed, MapPin,
  Navigation, PlusCircle, RotateCcw, Search, Sandwich, Toilet, Trees, Utensils,
  Wrench, X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileFilterDialog, MobileFilterToolbar } from "@/components/mobile-filter-toolbar";
import { PlaceExperiences } from "@/components/place-experiences";
import { PlaceLiveStatus } from "@/components/place-live-status";
import { PlaceSuggestionDialog } from "@/components/place-suggestion-dialog";
import type { City } from "@/lib/cities";
import { useStudentPreference } from "@/lib/client-preferences";
import { formatPragueTimestamp } from "@/lib/format";
import {
  activeUtilityCategories, clusterUtilityPlaces, defaultMapLayers, isUtilityCategory,
  layersForDirectCategory, mapLayerStorageKey, nearestUtilityPlaces, placeCategoryCode,
  readMapLayers, utilityCategoryForLabel, utilityMinimumIndividualZoom,
  utilityViewportRequestKey, type MapLayerState, type MapViewport, type UtilityCategoryCode,
} from "@/lib/place-map-layers";
import type { PlaceLiveSummary } from "@/lib/place-live-status";
import {
  isPlaceOpenNow, placeCategoryCodes, placeCategoryColors, placeCategoryLabels,
  type PlaceCategoryCode,
} from "@/lib/place-community";
import { deduplicatePlaces, googleMapsDirectionsUrl, haversineDistanceKm, type ClientLocation } from "@/lib/places";
import { includesFolded } from "@/lib/search";
import type { Place } from "@/lib/types";
import { facultiesFor, universities } from "@/lib/universities";

const allCategories = "Všechny";
const categorySymbols: Record<PlaceCategoryCode, string> = {
  restaurant: "R", cafe: "K", pub_bar: "B", fast_food: "F", canteen: "M", library: "L",
  study_room: "S", coworking: "C", public_toilet: "WC", drinking_fountain: "H₂O", sport: "P",
  student_service: "i", counselling: "+", park: "🌳", bench: "—", other: "•",
};
const utilityLabels: Record<UtilityCategoryCode, string> = {
  public_toilet: "Veřejné toalety", drinking_fountain: "Pítka", bench: "Lavičky",
};

function categoryCode(place: Place): PlaceCategoryCode {
  return place.categoryCode || placeCategoryCodes.find((code) => placeCategoryLabels[code] === place.category) || "other";
}

function CategoryIcon({ place, size = 19 }: { place: Place; size?: number }) {
  if (place.coverImageUrl) return <Image className="place-cover-thumb" src={place.coverImageUrl} alt="" width={42} height={42} unoptimized />;
  const props = { size, "aria-hidden": true };
  switch (categoryCode(place)) {
    case "restaurant": case "canteen": return <Utensils {...props} />;
    case "cafe": return <Coffee {...props} />;
    case "pub_bar": return <Beer {...props} />;
    case "fast_food": return <Sandwich {...props} />;
    case "library": return <Library {...props} />;
    case "study_room": return <BookOpen {...props} />;
    case "coworking": return <BriefcaseBusiness {...props} />;
    case "public_toilet": return <Toilet {...props} />;
    case "drinking_fountain": return <Droplets {...props} />;
    case "sport": return <Dumbbell {...props} />;
    case "student_service": return <Wrench {...props} />;
    case "counselling": return <HeartHandshake {...props} />;
    case "park": return <Trees {...props} />;
    case "bench": return <Armchair {...props} />;
    default: return <MapPin {...props} />;
  }
}

function MapLayerControls({ layers, onChange, compact = false }: {
  layers: MapLayerState; onChange: (layers: MapLayerState) => void; compact?: boolean;
}) {
  const options: Array<[keyof MapLayerState, string]> = [
    ["main", "Hlavní místa"], ["public_toilet", "Veřejné toalety"],
    ["drinking_fountain", "Pítka"], ["bench", "Lavičky"],
  ];
  return <fieldset className={`map-layer-controls ${compact ? "compact" : ""}`}>
    <legend><Layers3 size={16} />Vrstvy mapy</legend>
    {options.map(([key, label]) => <label key={key}>
      <input type="checkbox" checked={layers[key]} onChange={(event) => onChange({ ...layers, [key]: event.target.checked })} />
      <span>{label}</span>
    </label>)}
  </fieldset>;
}

type PlacesMapProps = {
  mainItems: Place[]; utilityItems: Place[]; city: City; layers: MapLayerState;
  userLocation: ClientLocation | null; selectedId: string | null;
  onSelect: (id: string) => void; onViewport: (viewport: MapViewport) => void;
};

function PlacesMap({ mainItems, utilityItems, city, layers, userLocation, selectedId, onSelect, onViewport }: PlacesMapProps) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const mainLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const utilityLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const locationLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markerRefs = useRef(new Map<string, import("leaflet").Marker>());
  const [zoom, setZoom] = useState(city.mapZoom);
  const selectedRef = useRef(selectedId);
  const selectRef = useRef(onSelect);
  const viewportRef = useRef(onViewport);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { viewportRef.current = onViewport; }, [onViewport]);

  const emitViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const center = map.getCenter();
    const next = { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast(), zoom: map.getZoom(), center: { lat: center.lat, lng: center.lng } };
    setZoom(next.zoom);
    viewportRef.current(next);
  }, []);

  useEffect(() => {
    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !element.current || mapRef.current) return;
      const map = L.map(element.current, {
        zoomControl: false, scrollWheelZoom: true, touchZoom: true, keyboard: true,
        maxBounds: city.mapBounds, wheelDebounceTime: 80, wheelPxPerZoomLevel: 120,
      }).setView([city.latitude, city.longitude], city.mapZoom);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      mainLayerRef.current = L.layerGroup().addTo(map);
      utilityLayerRef.current = L.layerGroup().addTo(map);
      locationLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.on("moveend zoomend", emitViewport);
      window.requestAnimationFrame(emitViewport);
    });
    return () => { active = false; };
  }, [city.latitude, city.longitude, city.mapBounds, city.mapZoom, emitViewport]);

  useEffect(() => {
    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !mapRef.current || !mainLayerRef.current || !utilityLayerRef.current) return;
      mainLayerRef.current.clearLayers();
      utilityLayerRef.current.clearLayers();
      markerRefs.current.clear();
      const addPlaceMarker = (place: Place, utility: boolean) => {
        const selected = selectedRef.current === place.id;
        const code = categoryCode(place);
        const markerSize = utility ? (selected ? 31 : 24) : (selected ? 38 : 32);
        const marker = L.marker([place.lat, place.lng], {
          icon: L.divIcon({
            className: `place-map-marker ${utility ? "utility" : "main"} ${selected ? "selected" : ""}`,
            html: `<span style="--marker-color:${placeCategoryColors[code]}">${categorySymbols[code]}</span>`,
            iconSize: [markerSize, markerSize], iconAnchor: [markerSize / 2, markerSize / 2], popupAnchor: [0, -markerSize / 2],
          }),
          riseOnHover: true, zIndexOffset: selected ? 500 : utility ? 10 : 100, keyboard: true,
        });
        const popup = document.createElement("strong"); popup.textContent = place.name;
        marker.bindPopup(popup).on("click", () => selectRef.current(place.id)).addTo(utility ? utilityLayerRef.current! : mainLayerRef.current!);
        markerRefs.current.set(place.id, marker);
        const node = marker.getElement();
        if (node) {
          node.setAttribute("role", "button"); node.setAttribute("aria-label", `Vybrat místo ${place.name}`);
          node.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRef.current(place.id); }
          });
        }
      };
      if (layers.main) mainItems.forEach((place) => addPlaceMarker(place, false));
      for (const group of clusterUtilityPlaces(utilityItems, zoom)) {
        if (!layers[group.category]) continue;
        if (!group.clustered && group.items.length === 1) { addPlaceMarker(group.items[0], true); continue; }
        const count = group.items.length;
        const label = count > 1 ? String(count) : categorySymbols[group.category];
        const marker = L.marker([group.lat, group.lng], {
          icon: L.divIcon({ className: "place-map-cluster", html: `<span>${label}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
          keyboard: true, zIndexOffset: 5,
        }).addTo(utilityLayerRef.current!);
        marker.on("click", () => mapRef.current?.flyTo([group.lat, group.lng], Math.min(Math.max(zoom + 2, utilityMinimumIndividualZoom[group.category]), 19), { duration: .35 }));
        marker.getElement()?.setAttribute("aria-label", count > 1 ? `Přiblížit shluk ${count} bodů` : `Přiblížit ${utilityLabels[group.category].toLowerCase()}`);
      }
    });
    return () => { active = false; };
  }, [layers, mainItems, utilityItems, zoom]);

  useEffect(() => {
    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !locationLayerRef.current || !mapRef.current) return;
      locationLayerRef.current.clearLayers();
      if (!userLocation) return;
      L.circleMarker([userLocation.lat, userLocation.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 })
        .bindTooltip("Vaše poloha").addTo(locationLayerRef.current);
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], Math.max(mapRef.current.getZoom(), 15), { duration: .35 });
    });
    return () => { active = false; };
  }, [userLocation]);

  useEffect(() => {
    if (!selectedId) return;
    const marker = markerRefs.current.get(selectedId);
    const map = mapRef.current;
    if (!marker || !map) return;
    const place = [...mainItems, ...utilityItems].find((item) => item.id === selectedId);
    const code = place ? placeCategoryCode(place) : null;
    const targetZoom = code && isUtilityCategory(code) ? utilityMinimumIndividualZoom[code] : 15;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), targetZoom), { duration: .35 });
    marker.openPopup();
  }, [mainItems, selectedId, utilityItems]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);
  return <div className="leaflet-host" ref={element} aria-label={`Interaktivní mapa míst ve městě ${city.name}`} />;
}

export function PlacesExplorer({ items, city }: { items: Place[]; city: City }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const preference = useStudentPreference();
  const campusQuery = search.get("campus") || "";
  const [query, setQuery] = useState(search.get("q") || campusQuery);
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
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [priceFilter, setPriceFilter] = useState("");
  const [studyOnly, setStudyOnly] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [outletsOnly, setOutletsOnly] = useState(false);
  const [originFilter, setOriginFilter] = useState<"all" | "official" | "community">("all");
  const [publicOnly, setPublicOnly] = useState(false);
  const [studentOnly, setStudentOnly] = useState(false);
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(search.get("navrh") === "1");
  const editingSuggestionId = search.get("submission");
  const [correctionPlace, setCorrectionPlace] = useState<Place | null>(null);
  const [liveSummaries, setLiveSummaries] = useState<Record<string, PlaceLiveSummary>>({});
  const [layers, setLayers] = useState<MapLayerState>(defaultMapLayers);
  const [layersHydrated, setLayersHydrated] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const [utilityItems, setUtilityItems] = useState<Place[]>([]);
  const [utilityLoading, setUtilityLoading] = useState(false);
  const [utilityError, setUtilityError] = useState("");
  const [utilityTruncated, setUtilityTruncated] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [nearbyCategory, setNearbyCategory] = useState<UtilityCategoryCode | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const lastMarkerTap = useRef<{ id: string; at: number } | null>(null);
  const markerResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousLayers = useRef<MapLayerState | null>(null);
  const directUtility = useRef<UtilityCategoryCode | null>(null);
  const utilityCache = useRef(new Map<string, { items: Place[]; truncated: boolean }>());
  const urlUniversity = universities.some((item) => item.id === search.get("university")) ? search.get("university")! : "";
  const showAll = search.get("filters") === "all";
  const universityId = schoolFilter ?? (showAll ? "" : search.has("university") ? urlUniversity : preference.universityId ?? "");
  const urlFaculty = facultiesFor(universityId).some((item) => item.id === search.get("faculty")) ? search.get("faculty")! : "";
  const facultyId = facultyFilter ?? (showAll ? "" : search.has("faculty") ? urlFaculty : preference.facultyId ?? "");
  const mainItems = useMemo(() => deduplicatePlaces(items).filter((place) => !isUtilityCategory(placeCategoryCode(place))), [items]);
  const allLoadedItems = useMemo(() => deduplicatePlaces([...mainItems, ...utilityItems]), [mainItems, utilityItems]);
  const categories = useMemo(() => [allCategories, ...placeCategoryCodes.map((code) => placeCategoryLabels[code])], []);

  useEffect(() => { setLayers(readMapLayers(window.sessionStorage)); setLayersHydrated(true); }, []);
  const changeLayers = useCallback((next: MapLayerState) => {
    directUtility.current = null; previousLayers.current = null; setLayers(next);
    window.sessionStorage.setItem(mapLayerStorageKey, JSON.stringify(next));
  }, []);

  useEffect(() => {
    if (!layersHydrated) return;
    const utility = utilityCategoryForLabel(category);
    if (utility && directUtility.current !== utility) {
      if (!directUtility.current) previousLayers.current = layers;
      directUtility.current = utility;
      setLayers(layersForDirectCategory(category, layers));
    } else if (!utility && directUtility.current) {
      directUtility.current = null;
      const restored = previousLayers.current || defaultMapLayers;
      previousLayers.current = null;
      setLayers(restored);
    }
  }, [category, layers, layersHydrated]);

  const activeUtilities = useMemo(() => activeUtilityCategories(layers), [layers]);
  useEffect(() => {
    if (!viewport || activeUtilities.length === 0) { setUtilityItems([]); setUtilityLoading(false); setUtilityError(""); return; }
    const requestKey = utilityViewportRequestKey(viewport, activeUtilities);
    const cached = utilityCache.current.get(requestKey);
    if (cached) { setUtilityItems(cached.items); setUtilityTruncated(cached.truncated); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setUtilityLoading(true); setUtilityError("");
      const params = new URLSearchParams({
        city: city.id, south: String(viewport.south), west: String(viewport.west),
        north: String(viewport.north), east: String(viewport.east), categories: activeUtilities.join(","),
      });
      try {
        const response = await fetch(`/api/places/map?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("utility-fetch");
        const payload = await response.json() as { items?: Place[]; truncated?: boolean };
        const result = { items: deduplicatePlaces(payload.items || []), truncated: payload.truncated === true };
        utilityCache.current.set(requestKey, result);
        setUtilityItems(result.items); setUtilityTruncated(result.truncated);
      } catch {
        if (!controller.signal.aborted) setUtilityError("Vybavení v tomto výřezu se nepodařilo načíst.");
      } finally { if (!controller.signal.aborted) setUtilityLoading(false); }
    }, 380);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [activeUtilities, city.id, viewport]);

  const filtered = useMemo(() => allLoadedItems.filter((place) => {
    const code = categoryCode(place);
    const haystack = `${place.name} ${place.address} ${place.note} ${place.whyVisit || ""}`;
    const campusStem = campusQuery.length > 4 ? campusQuery.slice(0, -2) : campusQuery;
    return (category !== allCategories ? place.category === category : isUtilityCategory(code) ? layers[code] : layers.main)
      && (!universityId || !place.universityIds?.length || place.universityIds.includes(universityId))
      && (!facultyId || !place.facultyIds?.length || place.facultyIds.includes(facultyId))
      && (!availableOnly || liveSummaries[place.id]?.available) && (!openNowOnly || isPlaceOpenNow(place.hours))
      && (!priceFilter || place.priceLevel === priceFilter) && (!studyOnly || place.studySuitable === true)
      && (!wifiOnly || place.wifiAvailable === true) && (!outletsOnly || place.outletsAvailable === true)
      && (!publicOnly || place.publicAccess === true) && (!studentOnly || place.studentOnly === true)
      && (!accessibleOnly || place.accessibility === "accessible")
      && (originFilter === "all" || (place.origin || "official") === originFilter)
      && (includesFolded(haystack, query) || Boolean(campusQuery && campusStem && includesFolded(haystack, campusStem)));
  }).sort((a, b) => sortMode === "distance" && userLocation
    ? haversineDistanceKm(userLocation, a) - haversineDistanceKm(userLocation, b)
    : a.name.localeCompare(b.name, "cs-CZ")), [allLoadedItems, availableOnly, campusQuery, category, facultyId, layers, liveSummaries, openNowOnly, originFilter, outletsOnly, priceFilter, publicOnly, query, sortMode, studentOnly, studyOnly, universityId, userLocation, wifiOnly, accessibleOnly]);

  const activeFilterCount = [query.trim(), category !== allCategories, universityId, facultyId, availableOnly, openNowOnly, priceFilter, studyOnly, wifiOnly, outletsOnly, publicOnly, studentOnly, accessibleOnly, originFilter !== "all", sortMode !== "default", ...activeUtilities].filter(Boolean).length;

  useEffect(() => {
    const ids = mainItems.map((item) => item.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (!ids.length) return;
    fetch(`/api/places/live-status?ids=${ids.join(",")}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (payload?.summaries) setLiveSummaries(payload.summaries); }).catch(() => undefined);
  }, [mainItems]);

  useEffect(() => {
    setQuery(search.get("q") || search.get("campus") || ""); setCategory(search.get("category") || allCategories);
    setSchoolFilter(search.get("filters") === "all" ? "" : search.has("university") ? urlUniversity : null);
    setFacultyFilter(search.get("filters") === "all" ? "" : search.has("faculty") ? urlFaculty : null);
  }, [search, urlFaculty, urlUniversity]);
  useEffect(() => { if (search.get("navrh") === "1") setSuggestionOpen(true); }, [search]);
  useEffect(() => () => { if (markerResetTimer.current) clearTimeout(markerResetTimer.current); }, []);

  function replaceQuery(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  function resetFilters() {
    setQuery(""); setCategory(allCategories); setSchoolFilter(""); setFacultyFilter(""); setAvailableOnly(false);
    setOpenNowOnly(false); setPriceFilter(""); setStudyOnly(false); setWifiOnly(false); setOutletsOnly(false);
    setPublicOnly(false); setStudentOnly(false); setAccessibleOnly(false); setOriginFilter("all"); setSortMode("default");
    directUtility.current = null; previousLayers.current = null; changeLayers(defaultMapLayers);
    replaceQuery({ q: undefined, campus: undefined, category: undefined, university: undefined, faculty: undefined, filters: "all" });
  }
  function requestLocation() {
    if (!("geolocation" in navigator)) { setLocationStatus("error"); setLocationMessage("Tento prohlížeč polohu nepodporuje. Seznam míst zůstává plně dostupný."); return; }
    setLocationStatus("loading"); setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setUserLocation({ lat: coords.latitude, lng: coords.longitude }); setSortMode("distance"); setLocationStatus("ready"); setLocationMessage(coords.accuracy > 1000 ? `Poloha je jen přibližná (±${Math.round(coords.accuracy / 100) * 100} m). Nikam ji neukládáme.` : "Poloha se používá jen v tomto prohlížeči a nikam se neodesílá."); },
      (error) => { setLocationStatus("error"); setLocationMessage(error.code === error.PERMISSION_DENIED ? "Přístup k poloze je zamítnutý. Jako výchozí bod použijeme střed mapy." : error.code === error.TIMEOUT ? "Zjištění polohy vypršelo. Jako výchozí bod použijeme střed mapy." : "Služba polohy teď není dostupná. Mapa funguje dál bez ní."); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }
  const selectFromMap = useCallback((id: string) => {
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const now = Date.now(); const secondTap = mobile && lastMarkerTap.current?.id === id && now - lastMarkerTap.current.at < 8_000;
    if (mobile && !secondTap) {
      setMapPreview(id); lastMarkerTap.current = { id, at: now };
      if (markerResetTimer.current) clearTimeout(markerResetTimer.current);
      markerResetTimer.current = setTimeout(() => { lastMarkerTap.current = null; setMapPreview(null); }, 8_000); return;
    }
    setMapPreview(null); setSelected(id); window.requestAnimationFrame(() => cardRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    lastMarkerTap.current = null; if (markerResetTimer.current) clearTimeout(markerResetTimer.current);
  }, []);

  function chooseNearby(next: UtilityCategoryCode) {
    setNearbyCategory(next); setNearbyOpen(true);
    if (!layers[next]) changeLayers({ ...layers, [next]: true });
  }
  const nearbyOrigin = userLocation || viewport?.center || { lat: city.latitude, lng: city.longitude };
  const nearbyResults = nearbyCategory ? nearestUtilityPlaces(utilityItems, nearbyOrigin, nearbyCategory) : [];

  const layerControls = <MapLayerControls layers={layers} onChange={changeLayers} />;
  const filterControls = <>
    <label className="search-field"><span>Hledat místo nebo adresu</span><div><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); replaceQuery({ q: event.target.value.trim() || undefined, campus: undefined, filters: undefined }); }} placeholder="Např. knihovna, Veveří…" /></div></label>
    <label><span>Kategorie</span><div className="select-wrap"><select value={category} onChange={(event) => { setCategory(event.target.value); replaceQuery({ category: event.target.value === allCategories ? undefined : event.target.value, filters: undefined }); }}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div></label>
    <label><span>Univerzita</span><select aria-label="Univerzita" value={universityId} onChange={(event) => { setSchoolFilter(event.target.value); setFacultyFilter(""); replaceQuery({ university: event.target.value || undefined, faculty: undefined, filters: undefined }); }}><option value="">Všechny školy</option>{universities.map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label>
    <label><span>Fakulta</span><select value={facultyId} onChange={(event) => { setFacultyFilter(event.target.value); replaceQuery({ faculty: event.target.value || undefined, filters: undefined }); }} disabled={!universityId}><option value="">Všechny fakulty</option>{facultiesFor(universityId).map((item) => <option key={item.id} value={item.id}>{item.shortName}</option>)}</select></label>
    <label><span>Cena</span><select value={priceFilter} onChange={(event) => setPriceFilter(event.target.value)}><option value="">Všechny ceny</option><option value="free">Zdarma</option><option value="low">Nízká</option><option value="medium">Střední</option><option value="high">Vyšší</option><option value="varies">Liší se</option></select></label>
    <label><span>Původ záznamu</span><select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as typeof originFilter)}><option value="all">Všechny zdroje</option><option value="official">Ověřený veřejný zdroj</option><option value="community">Licencovaný komunitní zdroj / návrh</option></select></label>
    <label><span>Řazení</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as "default" | "distance")}><option value="default">Podle názvu</option><option value="distance" disabled={!userLocation}>Podle vzdálenosti</option></select></label>
    <div className="place-quick-filters"><label><input type="checkbox" checked={openNowOnly} onChange={(event) => setOpenNowOnly(event.target.checked)} />Aktuálně otevřeno</label><label><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />Aktuálně dostupné</label><label><input type="checkbox" checked={publicOnly} onChange={(event) => setPublicOnly(event.target.checked)} />Veřejně přístupné</label><label><input type="checkbox" checked={studentOnly} onChange={(event) => setStudentOnly(event.target.checked)} />Pouze pro studenty</label><label><input type="checkbox" checked={accessibleOnly} onChange={(event) => setAccessibleOnly(event.target.checked)} />Bezbariérové</label><label><input type="checkbox" checked={studyOnly} onChange={(event) => setStudyOnly(event.target.checked)} />Vhodné ke studiu</label><label><input type="checkbox" checked={wifiOnly} onChange={(event) => setWifiOnly(event.target.checked)} />Wi‑Fi</label><label><input type="checkbox" checked={outletsOnly} onChange={(event) => setOutletsOnly(event.target.checked)} />Zásuvky</label></div>
    <div className="mobile-map-layers">{layerControls}</div>
    <div className="filter-actions"><button className="button button-secondary" type="button" onClick={resetFilters}><RotateCcw size={16} />Resetovat filtry</button></div>
  </>;

  return <>
    <MobileFilterToolbar open={filtersOpen} activeCount={activeFilterCount} onToggle={() => setFiltersOpen(true)} controlsId="places-mobile-filters" />
    <section className="filter-panel places-filters responsive-filter-desktop" aria-label="Filtry míst">{filterControls}</section>
    <MobileFilterDialog open={filtersOpen} activeCount={activeFilterCount} onClose={() => setFiltersOpen(false)} onReset={resetFilters} controlsId="places-mobile-filters" bodyClassName="places-filters" applyLabel={`Zobrazit ${filtered.length} míst`}>{filterControls}</MobileFilterDialog>
    <div className="location-toolbar">
      <button type="button" className="button button-secondary" onClick={requestLocation} disabled={locationStatus === "loading"}><LocateFixed size={17} />{locationStatus === "loading" ? "Zjišťuji polohu…" : userLocation ? "Aktualizovat moji polohu" : "Použít moji polohu"}</button>
      <button type="button" className="button button-secondary" aria-expanded={nearbyOpen} onClick={() => setNearbyOpen((value) => !value)}><Layers3 size={17} />Vybavení v okolí</button>
      <Link className="button button-secondary" href={`/${city.slug}/nastaveni#profil`}><MapPin size={17} />Mé návrhy</Link>
      <button type="button" className="button button-primary" data-testid="suggest-place" onClick={() => { setCorrectionPlace(null); setSuggestionOpen(true); }}><PlusCircle size={17} />Navrhnout nové místo</button>
      {userLocation && filtered[0] && <span className="nearest-place">Nejblíž: <strong>{filtered[0].name}</strong></span>}
      {locationMessage && <p className={locationStatus === "error" ? "location-error" : "location-note"} role="status">{locationMessage}</p>}
    </div>
    {nearbyOpen && <section className="nearby-utilities" aria-label="Vybavení v okolí">
      <header><div><strong>Vybavení v okolí</strong><small>{userLocation ? "Vzdálenost počítáme od vaší polohy." : "Bez GPS počítáme vzdálenost od středu mapy."}</small></div><button type="button" aria-label="Zavřít vybavení v okolí" onClick={() => setNearbyOpen(false)}><X size={18} /></button></header>
      <div className="nearby-utility-actions"><button type="button" onClick={() => chooseNearby("public_toilet")}><Toilet size={17} />Nejbližší WC</button><button type="button" onClick={() => chooseNearby("drinking_fountain")}><Droplets size={17} />Nejbližší pítko</button><button type="button" onClick={() => chooseNearby("bench")}><Armchair size={17} />Nejbližší lavičky</button></div>
      {nearbyCategory && <div className="nearby-utility-results">{utilityLoading ? <p>Načítám nejbližší vybavení…</p> : nearbyResults.length ? nearbyResults.map(({ place, distanceKm }) => <div key={place.id}><button type="button" onClick={() => selectFromMap(place.id)}><strong>{place.name}</strong><span>{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}</span></button><a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noopener noreferrer" aria-label={`Navigovat k ${place.name}`}><Navigation size={16} /></a></div>) : <p>V aktuálním výřezu zatím žádný bod není. Posuňte nebo přibližte mapu.</p>}</div>}
    </section>}
    <section className="places-layout">
      <div className="places-list"><div className="result-count"><strong>{filtered.length}</strong> míst v seznamu</div>{filtered.length === 0 ? <div className="empty-state"><MapPin size={26} /><h2>Žádné místo neodpovídá filtrům</h2><p>Upravte hledání, vymažte filtry, nebo navrhněte chybějící veřejné místo.</p><div><button className="button button-secondary" onClick={resetFilters}>Vymazat filtry</button><button className="button button-primary" onClick={() => { setCorrectionPlace(null); setSuggestionOpen(true); }}><PlusCircle size={16} />Navrhnout místo</button></div></div> : filtered.map((place) => {
        const distance = userLocation ? haversineDistanceKm(userLocation, place) : null;
        const proximityBand = distance !== null && distance <= 1 ? "near" as const : "unknown" as const;
        return <article ref={(node) => { if (node) cardRefs.current.set(place.id, node); else cardRefs.current.delete(place.id); }} id={place.id} key={place.id} className={`place-card ${selected === place.id ? "selected" : ""}`}><button className="place-card-main" type="button" onClick={() => setSelected(selected === place.id ? null : place.id)} aria-expanded={selected === place.id}><span className={`place-icon category-${categoryCode(place)}`}><CategoryIcon place={place} /></span><span><span className="result-labels"><i className="tag">{place.category}</i>{place.origin === "community" && <i className="tag community-origin">Komunitní návrh</i>}{liveSummaries[place.id]?.code !== "unknown" && <i className={`tag live-${liveSummaries[place.id]?.code}`}>{liveSummaries[place.id]?.label}</i>}</span><strong>{place.name}</strong><small>{place.address}</small>{distance !== null && <small className="place-distance">{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} od vás</small>}<span className="place-feature-tags">{place.studySuitable && <i>Studium</i>}{place.wifiAvailable && <i>Wi‑Fi</i>}{place.outletsAvailable && <i>Zásuvky</i>}{place.accessibility === "accessible" && <i>Bezbariérové</i>}</span></span><LocateFixed size={17} /></button>{selected === place.id && <div className="place-details"><p>{place.whyVisit || place.note}</p><dl>{(place.accessConditions || place.studentDiscount) && <div><dt>Podmínky přístupu</dt><dd>{place.accessConditions || place.studentDiscount}</dd></div>}<div><dt>Otevírací doba</dt><dd>{place.hours || "Ověřte na webu provozovatele"}{place.hours && isPlaceOpenNow(place.hours) ? " · nyní pravděpodobně otevřeno" : ""}</dd></div><div><dt>Ověřeno</dt><dd>{formatPragueTimestamp(place.openingHoursVerifiedAt || place.lastVerifiedAt)}{place.sourceSyncStatus && place.sourceSyncStatus !== "verified" ? " · změna čeká na kontrolu" : ""}</dd></div>{place.priceLevel && <div><dt>Cenová úroveň</dt><dd>{place.priceLevel === "free" ? "zdarma" : place.priceLevel === "low" ? "nízká" : place.priceLevel === "medium" ? "střední" : place.priceLevel === "high" ? "vyšší" : "liší se"}</dd></div>}</dl>{!isUtilityCategory(placeCategoryCode(place)) && <PlaceLiveStatus placeId={place.id} category={place.category} initialSummary={liveSummaries[place.id]} proximityBand={proximityBand} onChange={(summary) => setLiveSummaries((current) => ({ ...current, [place.id]: summary }))} />}<div className="place-detail-actions">{place.website && <a href={place.website} target="_blank" rel="noopener noreferrer" className="button button-secondary"><ExternalLink size={16} />Web</a>}<a href={googleMapsDirectionsUrl(place)} target="_blank" rel="noopener noreferrer" className="button button-primary"><Navigation size={16} />Navigovat</a><button type="button" className="text-link" onClick={() => { setCorrectionPlace(place); setSuggestionOpen(true); }}>Navrhnout opravu údajů</button></div><PlaceExperiences placeId={place.id} placeName={place.name} /></div>}</article>;
      })}</div>
      <div className="map-shell">
        <div className="desktop-map-layers"><MapLayerControls layers={layers} onChange={changeLayers} compact /></div>
        <PlacesMap mainItems={filtered.filter((place) => !isUtilityCategory(placeCategoryCode(place)))} utilityItems={filtered.filter((place) => isUtilityCategory(placeCategoryCode(place)))} city={city} layers={layers} userLocation={userLocation} selectedId={mapPreview || selected} onSelect={selectFromMap} onViewport={setViewport} />
        {(utilityLoading || utilityError || utilityTruncated || (layers.bench && (viewport?.zoom || 0) < utilityMinimumIndividualZoom.bench)) && <div className="map-utility-status" role="status">{utilityLoading ? "Načítám vybavení ve výřezu…" : utilityError || (utilityTruncated ? "Ve výřezu je mnoho bodů. Pro detail mapu přibližte." : "Lavičky se jednotlivě zobrazí po větším přiblížení.")}</div>}
        <div className="map-caption"><span><MapPin size={16} />{city.name} a okolí</span><small>Kolečko a touchpad mění přiblížení jen nad mapou · © OpenStreetMap</small></div>
      </div>
    </section>
    <PlaceSuggestionDialog key={editingSuggestionId || correctionPlace?.id || "new"} open={suggestionOpen} submissionId={editingSuggestionId} onClose={() => { setSuggestionOpen(false); setCorrectionPlace(null); if (search.get("navrh") === "1") replaceQuery({ navrh: undefined, submission: undefined }); }} city={city} correctionPlace={correctionPlace} onOpenExisting={(id) => { setSelected(id); window.requestAnimationFrame(() => cardRefs.current.get(id)?.scrollIntoView({ block: "center", behavior: "smooth" })); }} />
  </>;
}
