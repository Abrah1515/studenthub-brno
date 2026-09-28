import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityJobsPage } from "@/components/city-section-pages";
import { getPublishedCityModule } from "@/lib/city-data";
type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCityModule((await params).city, "jobs"); if (!city) notFound(); return { title: `Brigády · ${city.name}`, alternates: { canonical: `/${city.slug}/brigady` } }; }
export default async function Page({ params }: Props) { const city = await getPublishedCityModule((await params).city, "jobs"); if (!city) notFound(); return <CityJobsPage city={city} />; }
