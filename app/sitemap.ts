import type { MetadataRoute } from "next";
import { getPublishedCities, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { universities } from "@/lib/universities";
import { featureFlags } from "@/lib/feature-flags";
import { getPublicSiteUrl } from "@/lib/seo";
import type { City, CityModule } from "@/lib/cities";

const publicModulePaths: Array<{ module: CityModule; path: string; frequency: "daily" | "weekly" }> = [
  { module: "calendar", path: "/kalendar", frequency: "weekly" },
  { module: "places", path: "/mista", frequency: "weekly" },
  { module: "jobs", path: "/brigady", frequency: "daily" },
  { module: "marketplace", path: "/burza", frequency: "daily" },
  { module: "community", path: "/komunita", frequency: "daily" },
  { module: "buddy", path: "/partak", frequency: "daily" },
  { module: "housing", path: "/bydleni", frequency: "daily" },
];

function pathsForCity(city: City) {
  const paths = publicModulePaths.filter((entry) => city.modules[entry.module]);
  if (featureFlags.offersEnabled && city.modules.offers) paths.push({ module: "offers", path: "/nabidky", frequency: "weekly" });
  return paths;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const cities = await getPublishedCities();
  const local = cities.flatMap((city) => [
    { url: `${base}/${city.slug}/odpocinek`, changeFrequency: "monthly" as const, priority: .5 },
    { url: `${base}/${city.slug}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
    ...pathsForCity(city).map(({ path, frequency }) => ({ url: `${base}/${city.slug}${path}`, lastModified: new Date(), changeFrequency: frequency, priority: .8 })),
  ]);
  const linked = new Map(await Promise.all(cities.map(async (city) => [city.id, await getUniversityIdsForPublishedCity(city.id)] as const)));
  const schools = cities.flatMap((city) => universities.filter((university) => linked.get(city.id)?.includes(university.id)).map((university) => ({ url: `${base}/${city.slug}/skoly/${university.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: .7 })));
  const global = ["/", "/o-projektu", "/kontakt", "/soukromi", "/cookies", "/podminky"].map((path) => ({ url: `${base}${path === "/" ? "" : path}`, lastModified: new Date(), changeFrequency: path === "/" ? "weekly" as const : "monthly" as const, priority: path === "/" ? 1 : .5 }));
  return [...global, ...local, ...schools];
}
