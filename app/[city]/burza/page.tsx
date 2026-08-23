import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketplaceExplorer } from "@/components/marketplace-explorer";
import { getPublishedCity } from "@/lib/city-data";
import { getPublicMarketplaceListings, marketplaceEmailConfigured } from "@/lib/marketplace-server";

type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCity((await params).city); if (!city) notFound(); return { title: `Studentská burza · ${city.name}`, description: "Bezpečná studentská burza učebnic, skript, vlastních poznámek, kalkulaček a studijního vybavení.", alternates: { canonical: `/${city.slug}/burza` } }; }
export const dynamic = "force-dynamic";
export default async function MarketplacePage({ params }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); return <MarketplaceExplorer city={city} initialItems={await getPublicMarketplaceListings(city.id)} emailReady={marketplaceEmailConfigured() || process.env.DEMO_MODE === "true"} />; }
