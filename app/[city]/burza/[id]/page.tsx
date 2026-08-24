import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketplaceDetail } from "@/components/marketplace-detail";
import { getPublishedCity } from "@/lib/city-data";
import { getPublicMarketplaceListing, getPublicMarketplaceListings, marketplaceEmailConfigured } from "@/lib/marketplace-server";
import { getCurrentAccount } from "@/lib/user-auth";
type Props = { params: Promise<{ city: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const values = await params; const city = await getPublishedCity(values.city); const item = city ? await getPublicMarketplaceListing(values.id) : null; if (!city || !item) notFound(); return { title: `${item.title} · Studentská burza`, description: item.shortDescription, alternates: { canonical: `/${city.slug}/burza/${item.id}` } }; }
export default async function MarketplaceDetailPage({ params }: Props) { const values = await params; const city = await getPublishedCity(values.city); const viewer = await getCurrentAccount(); const item = city ? (await getPublicMarketplaceListings(city.id, viewer?.id)).find((entry) => entry.id === values.id) || null : null; if (!city || !item) notFound(); return <MarketplaceDetail item={item} citySlug={city.slug} emailReady={marketplaceEmailConfigured() || process.env.DEMO_MODE === "true"} />; }
