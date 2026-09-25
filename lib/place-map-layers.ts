import type { Place } from "@/lib/types";
import { haversineDistanceKm, type ClientLocation } from "@/lib/places";
import type { PlaceCategoryCode } from "@/lib/place-community";

export const utilityCategoryCodes = ["public_toilet", "drinking_fountain", "bench"] as const;
export type UtilityCategoryCode = (typeof utilityCategoryCodes)[number];
export type MapLayerState = { main: boolean; public_toilet: boolean; drinking_fountain: boolean; bench: boolean };
export type MapViewport = { south: number; west: number; north: number; east: number; zoom: number; center: ClientLocation };

export const defaultMapLayers: MapLayerState = { main: true, public_toilet: false, drinking_fountain: false, bench: false };
export const utilityMinimumIndividualZoom: Record<UtilityCategoryCode, number> = { public_toilet: 15, drinking_fountain: 15, bench: 17 };
export const mapLayerStorageKey = "studenthub-place-map-layers-v1";
export const utilityResponseLimit = 300;

export function isUtilityCategory(value: string): value is UtilityCategoryCode {
  return utilityCategoryCodes.includes(value as UtilityCategoryCode);
}

export function placeCategoryCode(place: Pick<Place, "category" | "categoryCode">): PlaceCategoryCode {
  if (place.categoryCode) return place.categoryCode;
  if (place.category === "Veřejné toalety") return "public_toilet";
  if (place.category === "Pítka") return "drinking_fountain";
  if (place.category === "Lavičky a odpočinek") return "bench";
  return "other";
}

export function utilityCategoryForLabel(label: string): UtilityCategoryCode | null {
  if (label === "Veřejné toalety") return "public_toilet";
  if (label === "Pítka") return "drinking_fountain";
  if (label === "Lavičky a odpočinek") return "bench";
  return null;
}

export function readMapLayers(storage: Pick<Storage, "getItem">): MapLayerState {
  try {
    const value = JSON.parse(storage.getItem(mapLayerStorageKey) || "null") as Partial<MapLayerState> | null;
    if (!value) return defaultMapLayers;
    return {
      main: value.main !== false,
      public_toilet: value.public_toilet === true,
      drinking_fountain: value.drinking_fountain === true,
      bench: value.bench === true,
    };
  } catch {
    return defaultMapLayers;
  }
}

export function activeUtilityCategories(layers: MapLayerState) {
  return utilityCategoryCodes.filter((category) => layers[category]);
}

export function layersForDirectCategory(category: string, current: MapLayerState) {
  const utility = utilityCategoryForLabel(category);
  if (!utility) return current;
  return { main: false, public_toilet: false, drinking_fountain: false, bench: false, [utility]: true } satisfies MapLayerState;
}

export function placeMatchesLayers(place: Place, layers: MapLayerState) {
  const category = placeCategoryCode(place);
  return isUtilityCategory(category) ? layers[category] : layers.main;
}

export function utilityVisibleIndividually(category: UtilityCategoryCode, zoom: number) {
  return zoom >= utilityMinimumIndividualZoom[category];
}

function projectedPoint(place: Pick<Place, "lat" | "lng">, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const sin = Math.sin(place.lat * Math.PI / 180);
  return {
    x: ((place.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export type UtilityMarkerGroup = { key: string; category: UtilityCategoryCode; items: Place[]; lat: number; lng: number; clustered: boolean };

export function clusterUtilityPlaces(items: Place[], zoom: number, cellSize = 72): UtilityMarkerGroup[] {
  const groups = new Map<string, { category: UtilityCategoryCode; items: Place[] }>();
  for (const place of items) {
    const category = placeCategoryCode(place);
    if (!isUtilityCategory(category)) continue;
    if (utilityVisibleIndividually(category, zoom)) {
      groups.set(`place:${place.id}`, { category, items: [place] });
      continue;
    }
    const point = projectedPoint(place, zoom);
    const key = `${category}:${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const group = groups.get(key) || { category, items: [] };
    group.items.push(place);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    category: group.category,
    items: group.items,
    lat: group.items.reduce((sum, item) => sum + item.lat, 0) / group.items.length,
    lng: group.items.reduce((sum, item) => sum + item.lng, 0) / group.items.length,
    clustered: group.items.length > 1 || !utilityVisibleIndividually(group.category, zoom),
  }));
}

export function nearestUtilityPlaces(items: Place[], origin: ClientLocation, category: UtilityCategoryCode, limit = 3) {
  return items
    .filter((item) => placeCategoryCode(item) === category)
    .map((item) => ({ place: item, distanceKm: haversineDistanceKm(origin, item) }))
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, limit);
}

export function utilityViewportRequestKey(viewport: MapViewport, categories: readonly UtilityCategoryCode[]) {
  const coordinate = (value: number) => value.toFixed(4);
  return [coordinate(viewport.south), coordinate(viewport.west), coordinate(viewport.north), coordinate(viewport.east), categories.slice().sort().join(",")].join("|");
}
