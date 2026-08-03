export type CityStatus = "draft" | "review" | "published" | "archived";
export type MapBounds = [[number, number], [number, number]];
export type City = {
  id: string;
  slug: string;
  name: string;
  region: string;
  countryCode: string;
  timezone: string;
  latitude: number;
  longitude: number;
  mapBounds: MapBounds;
  mapZoom: number;
  enabled: boolean;
  publicStatus: CityStatus;
  sortOrder: number;
  brandConfig: Record<string, unknown>;
};

export const brnoCity: City = {
  id: "brno",
  slug: "brno",
  name: "Brno",
  region: "Jihomoravský kraj",
  countryCode: "CZ",
  timezone: "Europe/Prague",
  latitude: 49.1951,
  longitude: 16.6068,
  mapBounds: [[49.115, 16.45], [49.31, 16.75]],
  mapZoom: 13,
  enabled: true,
  publicStatus: "published",
  sortOrder: 10,
  brandConfig: { editionName: "StudentHub Brno", editionShortName: "Brno" },
};

export const defaultCitySlug = process.env.DEFAULT_CITY_SLUG || process.env.NEXT_PUBLIC_DEFAULT_CITY_SLUG || "brno";
export const multiCityEnabled = process.env.MULTI_CITY_ENABLED === "true" || process.env.NEXT_PUBLIC_MULTI_CITY_ENABLED === "true";

export function staticCityBySlug(slug: string) { return slug === brnoCity.slug ? brnoCity : undefined; }
export function isCityPublic(city: City) { return city.enabled && city.publicStatus === "published"; }
