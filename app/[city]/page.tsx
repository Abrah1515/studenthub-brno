import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityDashboard } from "@/components/city-dashboard-page";
import { getPublishedCity } from "@/lib/city-data";

type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { city: slug } = await params; const city = await getPublishedCity(slug); if (!city) notFound(); return { title: `Přehled · ${city.name}`, description: `Ověřené termíny, místa, nabídky a brigády pro studenty ve městě ${city.name}.`, alternates: { canonical: `/${city.slug}` }, openGraph: { title: `StudentHub ${city.name}`, url: `/${city.slug}` } }; }
export default async function CityPage({ params }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); return <CityDashboard city={city} />; }
