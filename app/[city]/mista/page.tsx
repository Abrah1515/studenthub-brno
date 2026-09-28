import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityPlacesPage } from "@/components/city-section-pages";
import { getPublishedCityModule } from "@/lib/city-data";
type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCityModule((await params).city, "places"); if (!city) notFound(); return { title: `Užitečná místa · ${city.name}`, alternates: { canonical: `/${city.slug}/mista` } }; }
export default async function Page({ params }: Props) { const city = await getPublishedCityModule((await params).city, "places"); if (!city) notFound(); return <CityPlacesPage city={city} />; }
