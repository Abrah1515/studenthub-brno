import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityBuddyPage } from "@/components/city-social-pages";
import { getPublishedCityModule } from "@/lib/city-data";

type Props = { params: Promise<{ city: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCityModule((await params).city, "buddy"); if (!city) notFound(); return { title: `Hledám parťáka · ${city.name}`, description: `Studentské příspěvky pro společné aktivity ve městě ${city.name}.`, alternates: { canonical: `/${city.slug}/partak` } }; }
export default async function Page({ params }: Props) { const city = await getPublishedCityModule((await params).city, "buddy"); if (!city) notFound(); return <CityBuddyPage city={city} />; }
