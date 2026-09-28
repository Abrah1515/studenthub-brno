import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityDashboard } from "@/components/city-dashboard-page";
import { getPublishedCity } from "@/lib/city-data";

type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { city: slug } = await params; const city = await getPublishedCity(slug); if (!city) notFound(); return { title: { absolute: city.seo.title }, description: city.seo.description, alternates: { canonical: `/${city.slug}` }, openGraph: { title: `StudentHub ${city.name}`, description: city.seo.description, url: `/${city.slug}` } }; }
export default async function CityPage({ params }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); return <CityDashboard city={city} />; }
