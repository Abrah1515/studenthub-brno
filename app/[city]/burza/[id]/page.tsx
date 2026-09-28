import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketplaceDetail } from "@/components/marketplace-detail";
import { getPublishedCityModule } from "@/lib/city-data";
import { getPublicMarketplaceListings, marketplaceEmailConfigured } from "@/lib/marketplace-server";
import { getCurrentAccount } from "@/lib/user-auth";
type Props = { params: Promise<{ city: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const values = await params; const city = await getPublishedCityModule(values.city,"marketplace"); const item = city ? (await getPublicMarketplaceListings(city.id)).find((entry)=>entry.id===values.id)||null : null; if (!city || !item) notFound(); return { title: `${item.title} · Studentská burza`, description: item.shortDescription, alternates: { canonical: `/${city.slug}/burza/${item.id}` } }; }
export default async function MarketplaceDetailPage({ params }: Props) { const values = await params; const city = await getPublishedCityModule(values.city,"marketplace"); const viewer = await getCurrentAccount(); const item = city ? (await getPublicMarketplaceListings(city.id, viewer?.id)).find((entry) => entry.id === values.id) || null : null; if (!city || !item) notFound(); return <MarketplaceDetail item={item} citySlug={city.slug} emailReady={marketplaceEmailConfigured() || process.env.DEMO_MODE === "true"} />; }
