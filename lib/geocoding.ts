import { staticCityBySlug, type City } from "@/lib/cities";

export function geocodingCity(slug: string | null | undefined): City | null {
  return staticCityBySlug(String(slug || "").trim().toLowerCase()) || null;
}

export function geocodingQuery(query: string, city: City) {
  return `${query}, ${city.name}, Česko`;
}

export function coordinatesWithinCity(latitude: number, longitude: number, city: City) {
  const [[south, west], [north, east]] = city.mapBounds;
  return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
}
