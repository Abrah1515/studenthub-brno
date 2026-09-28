import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketplaceManager } from "@/components/marketplace-manager";
import { getPublishedCityModule } from "@/lib/city-data";
export const metadata: Metadata = { title: "Správa inzerátu", robots: { index: false, follow: false } };
export default async function MarketplaceManagerPage({ params, searchParams }: { params: Promise<{ city: string }>; searchParams: Promise<{ id?: string }> }) { const city = await getPublishedCityModule((await params).city,"marketplace"); if (!city) notFound(); return <MarketplaceManager listingId={(await searchParams).id || ""} citySlug={city.slug} />; }
