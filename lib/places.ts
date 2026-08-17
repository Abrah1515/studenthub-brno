import type { Place } from "@/lib/types";

export type ClientLocation = { lat: number; lng: number };
type PlaceIdentity = Pick<Place, "name" | "address" | "osmId"> & { sourceExternalId?: string };

function normalize(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ").replace(/[^a-z0-9]+/g, " ").trim();
}

export function placeDedupeKey(place: PlaceIdentity) {
  const stableId = place.sourceExternalId || place.osmId;
  return stableId ? `source:${normalize(stableId)}` : `content:${normalize(place.name)}|${normalize(place.address)}`;
}

export function deduplicatePlaces(items: Place[]) {
  const selected = new Map<string, Place>();
  for (const place of items) {
    const key = placeDedupeKey(place);
    const previous = selected.get(key);
    if (!previous || new Date(place.lastVerifiedAt).getTime() > new Date(previous.lastVerifiedAt).getTime()) selected.set(key, place);
  }
  return [...selected.values()];
}

export function haversineDistanceKm(from: ClientLocation, to: ClientLocation) {
  const radius = 6371;
  const radians = (value: number) => value * Math.PI / 180;
  const latitude = radians(to.lat - from.lat);
  const longitude = radians(to.lng - from.lng);
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(longitude / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

export function googleMapsDirectionsUrl(place: Pick<Place, "lat" | "lng">) {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
}
