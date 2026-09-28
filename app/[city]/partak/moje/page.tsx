import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityBuddyPage } from "@/components/city-social-pages";
import { getPublishedCityModule } from "@/lib/city-data";

export const metadata: Metadata = { title: "Moje příspěvky · Hledám parťáka", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ city: string }> }) { const city = await getPublishedCityModule((await params).city, "buddy"); if (!city) notFound(); return <CityBuddyPage city={city} mine />; }
