import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityPlacesPage } from "@/components/city-section-pages";
import { getPublishedCity } from "@/lib/city-data";
type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCity((await params).city); if (!city) notFound(); return { title: `Užitečná místa · ${city.name}`, alternates: { canonical: `/${city.slug}/mista` } }; }
export default async function Page({ params }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); return <CityPlacesPage city={city} />; }
