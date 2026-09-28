import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityWatcherPage } from "@/components/city-social-pages";
import { getPublishedCityModule } from "@/lib/city-data";

export const metadata: Metadata = { title: "Hlídač termínů a akcí", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ city: string }> }) { const city = await getPublishedCityModule((await params).city, "watcher"); if (!city) notFound(); return <CityWatcherPage />; }
