import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CityOffersPage } from "@/components/city-section-pages";
import { getPublishedCity } from "@/lib/city-data";
import { featureFlags } from "@/lib/feature-flags";
type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCity((await params).city); if (!city) notFound(); return { title: `Nabídky a slevy · ${city.name}`, alternates: { canonical: `/${city.slug}/nabidky` } }; }
export default async function Page({ params }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); if (!featureFlags.offersEnabled) redirect(`/${city.slug}`); return <CityOffersPage city={city} />; }
