import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketplaceListingForm } from "@/components/marketplace-listing-form";
import { PageHeading } from "@/components/page-heading";
import { getPublishedCity } from "@/lib/city-data";
import { marketplaceEmailConfigured } from "@/lib/marketplace-server";

type Props = { params: Promise<{ city: string }> };
export const metadata: Metadata = { title: "Vložit inzerát do Studentské burzy", robots: { index: false, follow: false } };
export default async function NewMarketplaceListingPage({ params }: Props) { const city = await getPublishedCity((await params).city); if (!city) notFound(); return <div className="page-stack marketplace-create-page"><PageHeading eyebrow="Studentská burza" title="Vložit inzerát" description="Inzerát se zveřejní až po ověření e-mailu. Kontaktní adresa nebude součástí veřejné stránky ani API." /><MarketplaceListingForm city={city} emailReady={marketplaceEmailConfigured() || process.env.DEMO_MODE === "true"} /></div>; }
