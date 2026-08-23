import type { MetadataRoute } from "next";
import { getPublishedCities, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { universities } from "@/lib/universities";
import { featureFlags } from "@/lib/feature-flags";
import { getPublicSiteUrl } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const cities = await getPublishedCities();
  const paths = ["", "/kalendar", "/mista", "/brigady", ...(featureFlags.offersEnabled ? ["/nabidky"] : [])];
  const local = cities.flatMap((city) => paths.map((path) => ({ url: `${base}/${city.slug}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "daily" as const : "weekly" as const, priority: path === "" ? 1 : .8 })));
  const linked = new Map(await Promise.all(cities.map(async (city) => [city.id, await getUniversityIdsForPublishedCity(city.id)] as const)));
  const schools = cities.flatMap((city) => universities.filter((university) => linked.get(city.id)?.includes(university.id)).map((university) => ({ url: `${base}/${city.slug}/skoly/${university.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: .7 })));
  const global = ["/komunita", "/pomoc", "/partak", "/o-projektu", "/kontakt", "/soukromi", "/cookies", "/podminky"].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path === "/komunita" ? "daily" as const : "monthly" as const, priority: path === "/komunita" ? .8 : .5 }));
  return [...local, ...schools, ...global];
}
