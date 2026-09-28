import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { brnoCity, cityModuleKeys, staticCityBySlug, type City, type CityModule, type CityModules, isCityModuleEnabled, isCityPublic, multiCityEnabled } from "@/lib/cities";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { universities } from "@/lib/universities";

function fromRow(row: Record<string, unknown>): City {
  const bounds = Array.isArray(row.map_bounds) ? row.map_bounds : brnoCity.mapBounds;
  const fallback = staticCityBySlug(String(row.slug)) || brnoCity;
  const storedModules = row.module_config && typeof row.module_config === "object" ? row.module_config as Record<string, unknown> : {};
  const modules = Object.fromEntries(cityModuleKeys.map((key) => [key, typeof storedModules[key] === "boolean" ? storedModules[key] : fallback.modules[key]])) as CityModules;
  const brandConfig = (row.brand_config || {}) as Record<string, unknown>;
  return {
    id: String(row.id), slug: String(row.slug), name: String(row.name), region: String(row.region || ""),
    countryCode: String(row.country_code || "CZ"), timezone: String(row.timezone || "Europe/Prague"),
    latitude: Number(row.latitude), longitude: Number(row.longitude), mapBounds: bounds as City["mapBounds"],
    mapZoom: Number(row.map_zoom || 13), enabled: Boolean(row.enabled), publicStatus: String(row.public_status) as City["publicStatus"],
    sortOrder: Number(row.sort_order || 0), brandConfig, modules,
    seo: { title: String(brandConfig.seoTitle || fallback.seo.title), description: String(brandConfig.seoDescription || fallback.seo.description) },
    selectionLogo: fallback.selectionLogo,
  };
}

export async function getPublishedCities(): Promise<City[]> {
  noStore();
  if (!isSupabaseConfigured()) return [brnoCity];
  const { data, error } = await createServiceClient().from("cities").select("*").eq("enabled", true).eq("public_status", "published").order("sort_order");
  if (error) throw error;
  const cities = (data || []).map((row) => fromRow(row as Record<string, unknown>)).filter(isCityPublic);
  if (!cities.some((city) => city.slug === "brno")) cities.unshift(brnoCity);
  return multiCityEnabled ? cities : cities.filter((city) => city.slug === "brno");
}

export async function getPublishedCity(slug: string) { return (await getPublishedCities()).find((city) => city.slug === slug); }
export async function getPublishedCityModule(slug: string, module: CityModule) { const city = await getPublishedCity(slug); return city && isCityModuleEnabled(city, module) ? city : undefined; }
export async function getUniversityIdsForPublishedCity(cityId: string) { const city = (await getPublishedCities()).find((item) => item.id === cityId); if (!city) return []; if (!isSupabaseConfigured()) return cityId === "brno" ? universities.map((item) => item.id) : []; const { data, error } = await createServiceClient().from("university_cities").select("university_id").eq("city_id", cityId); if (error) throw error; return (data || []).map((item) => String(item.university_id)); }
