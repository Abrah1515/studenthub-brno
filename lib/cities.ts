export type CityStatus = "draft" | "review" | "published" | "archived";
export const cityModuleKeys = ["calendar", "places", "community", "buddy", "marketplace", "housing", "jobs", "chat", "watcher", "settings", "offers"] as const;
export type CityModule = (typeof cityModuleKeys)[number];
export type CityModules = Record<CityModule, boolean>;
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
  modules: CityModules;
  seo: { title: string; description: string };
  selectionLogo: { light: string; dark: string; symbol: string; width: number; height: number };
};

const enabledBrnoModules: CityModules = {
  calendar: true, places: true, community: true, buddy: true, marketplace: true,
  housing: true, jobs: true, chat: true, watcher: true, settings: true, offers: true,
};
const preparedOlomoucModules: CityModules = {
  calendar: true, places: true, community: true, buddy: true, marketplace: true,
  housing: true, jobs: true, chat: true, watcher: true, settings: true, offers: false,
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
  modules: enabledBrnoModules,
  seo: { title: "StudentHub Brno – prakticky pro studenty", description: "Ověřené termíny, místa, komunita a praktické služby pro studenty v Brně." },
  selectionLogo: { light: "/brand/cities/studenthub-brno-v1.png", dark: "/brand/cities/studenthub-brno-dark-v1.png", symbol: "/brand/cities/studenthub-brno-symbol-v1.png", width: 391, height: 396 },
};

export const olomoucCity: City = {
  id: "olomouc", slug: "olomouc", name: "Olomouc", region: "Olomoucký kraj", countryCode: "CZ",
  timezone: "Europe/Prague", latitude: 49.5938, longitude: 17.2509,
  mapBounds: [[49.535, 17.185], [49.655, 17.34]], mapZoom: 13,
  enabled: true, publicStatus: "published", sortOrder: 40,
  brandConfig: { editionName: "StudentHub Olomouc", editionShortName: "Olomouc" },
  modules: preparedOlomoucModules,
  seo: { title: "StudentHub Olomouc – prakticky pro studenty", description: "Ověřené termíny, místa, komunita a praktické služby pro studenty v Olomouci." },
  selectionLogo: { light: "/brand/cities/studenthub-olomouc-v1.png", dark: "/brand/cities/studenthub-olomouc-dark-v1.png", symbol: "/brand/cities/studenthub-olomouc-symbol-v1.png", width: 394, height: 397 },
};

export const prahaCity: City = {
  id: "praha", slug: "praha", name: "Praha", region: "Hlavní město Praha", countryCode: "CZ",
  timezone: "Europe/Prague", latitude: 50.0755, longitude: 14.4378,
  mapBounds: [[49.94, 14.22], [50.18, 14.71]], mapZoom: 12,
  enabled: true, publicStatus: "published", sortOrder: 20,
  brandConfig: { editionName: "StudentHub Praha", editionShortName: "Praha" },
  modules: preparedOlomoucModules,
  seo: { title: "StudentHub Praha – prakticky pro studenty", description: "Ověřené termíny, místa, komunita a praktické služby pro studenty v Praze." },
  selectionLogo: { light: "/brand/cities/studenthub-praha-v1.png", dark: "/brand/cities/studenthub-praha-dark-v1.png", symbol: "/brand/cities/studenthub-praha-symbol-v1.png", width: 392, height: 396 },
};

const plannedCities: City[] = [
  prahaCity,
  { ...olomoucCity, id: "ostrava", slug: "ostrava", name: "Ostrava", region: "Moravskoslezský kraj", latitude: 49.8209, longitude: 18.2625, mapBounds: [[49.72, 18.08], [49.91, 18.38]], enabled: false, publicStatus: "draft", sortOrder: 30, brandConfig: { editionName: "StudentHub Ostrava", editionShortName: "Ostrava" }, seo: { title: "StudentHub Ostrava – připravujeme", description: "Připravovaná městská edice StudentHubu pro studenty v Ostravě." }, selectionLogo: { light: "/brand/cities/studenthub-ostrava-v1.png", dark: "/brand/cities/studenthub-ostrava-dark-v1.png", symbol: "/brand/cities/studenthub-ostrava-symbol-v1.png", width: 393, height: 397 } },
  olomoucCity,
];

export const cityCatalog: readonly City[] = [brnoCity, ...plannedCities];

export const defaultCitySlug = process.env.DEFAULT_CITY_SLUG || process.env.NEXT_PUBLIC_DEFAULT_CITY_SLUG || "brno";
export const multiCityEnabled = process.env.MULTI_CITY_ENABLED === "true" || process.env.NEXT_PUBLIC_MULTI_CITY_ENABLED === "true";

export function staticCityBySlug(slug: string) { return cityCatalog.find((city) => city.slug === slug); }
export function isCityPublic(city: City) { return city.enabled && city.publicStatus === "published"; }
export function isCityModuleEnabled(city: City, module: CityModule) { return isCityPublic(city) && city.modules[module]; }
export function cityHref(city: Pick<City, "slug"> | string, path = "") { const slug = typeof city === "string" ? city : city.slug; const suffix = path && !path.startsWith("/") ? `/${path}` : path; return `/${slug}${suffix}`; }
export function citySlugFromPathname(pathname: string, fallback = defaultCitySlug) { const slug = pathname.split("/").filter(Boolean)[0]?.toLowerCase(); return staticCityBySlug(slug || "")?.slug || fallback; }
