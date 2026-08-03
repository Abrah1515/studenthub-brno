import type { MetadataRoute } from "next";
import { getPublishedCities, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { universities } from "@/lib/universities";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const cities = await getPublishedCities();
  const local = cities.flatMap((city) => ["", "/kalendar", "/mista", "/nabidky", "/brigady"].map((path) => ({ url: `${base}/${city.slug}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "daily" as const : "weekly" as const, priority: path === "" ? 1 : .8 })));
  const linked = new Map(await Promise.all(cities.map(async (city) => [city.id, await getUniversityIdsForPublishedCity(city.id)] as const)));
  const schools = cities.flatMap((city) => universities.filter((university) => linked.get(city.id)?.includes(university.id)).map((university) => ({ url: `${base}/${city.slug}/skoly/${university.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: .7 })));
  const global = ["/pomoc", "/navrhnout-obsah", "/o-projektu", "/kontakt", "/soukromi", "/cookies", "/podminky"].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: .5 }));
  return [...local, ...schools, ...global];
}
