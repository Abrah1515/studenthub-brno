import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketplaceVerification } from "@/components/marketplace-verification";
import { getPublishedCity } from "@/lib/city-data";
export const metadata: Metadata = { title: "Ověření inzerátu", robots: { index: false, follow: false } };
export default async function MarketplaceVerificationPage({ params, searchParams }: { params: Promise<{ city: string }>; searchParams: Promise<{ id?: string }> }) { const city = await getPublishedCity((await params).city); if (!city) notFound(); return <MarketplaceVerification listingId={(await searchParams).id || ""} citySlug={city.slug} />; }
