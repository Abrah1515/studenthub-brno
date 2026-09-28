import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CitySettingsPage } from "@/components/city-social-pages";
import { getAcademicCatalog } from "@/lib/academic-catalog";
import { getPublishedCities, getPublishedCityModule } from "@/lib/city-data";

export const metadata: Metadata = { title: "Moje škola a profil", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ city: string }> }) { const city = await getPublishedCityModule((await params).city, "settings"); if (!city) notFound(); const [cities, catalog] = await Promise.all([getPublishedCities(), getAcademicCatalog()]); return <CitySettingsPage cities={cities} catalog={catalog} />; }
