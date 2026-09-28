import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CityOffersPage } from "@/components/city-section-pages";
import { getPublishedCityModule } from "@/lib/city-data";
import { featureFlags } from "@/lib/feature-flags";
type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCityModule((await params).city,"offers"); if (!city) notFound(); return { title: `Nabídky a slevy · ${city.name}`, alternates: { canonical: `/${city.slug}/nabidky` }, robots: { index: false, follow: false } }; }
export default async function Page({ params }: Props) { const city = await getPublishedCityModule((await params).city,"offers"); if (!city) notFound(); if (!featureFlags.offersEnabled) redirect(`/${city.slug}`); return <CityOffersPage city={city} />; }
