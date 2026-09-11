import type { MetadataRoute } from "next";
import { getPublishedCities, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { universities } from "@/lib/universities";
import { featureFlags } from "@/lib/feature-flags";
import { getPublicSiteUrl } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicSiteUrl();
  const cities = await getPublishedCities();
  const paths = ["", "/kalendar", "/mista", "/brigady", "/burza", ...(featureFlags.offersEnabled ? ["/nabidky"] : [])];
  const local = cities.flatMap((city) => paths.map((path) => ({ url: `${base}/${city.slug}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "daily" as const : "weekly" as const, priority: path === "" ? 1 : .8 })));
  const linked = new Map(await Promise.all(cities.map(async (city) => [city.id, await getUniversityIdsForPublishedCity(city.id)] as const)));
  const schools = cities.flatMap((city) => universities.filter((university) => linked.get(city.id)?.includes(university.id)).map((university) => ({ url: `${base}/${city.slug}/skoly/${university.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: .7 })));
  const brnoCommunity = ["/komunita", "/partak", "/profily"].map((path) => ({ url: `${base}/brno${path}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: .8 }));
  const global = ["/", "/o-projektu", "/kontakt", "/soukromi", "/cookies", "/podminky"].map((path) => ({ url: `${base}${path === "/" ? "" : path}`, lastModified: new Date(), changeFrequency: path === "/" ? "weekly" as const : "monthly" as const, priority: path === "/" ? 1 : .5 }));
  return [...global, ...local, ...schools, ...brnoCommunity];
}
