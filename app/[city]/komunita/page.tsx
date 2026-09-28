import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityCommunityPage } from "@/components/city-social-pages";
import { getPublishedCityModule } from "@/lib/city-data";

type Props = { params: Promise<{ city: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> { const city = await getPublishedCityModule((await params).city, "community"); if (!city) notFound(); return { title: `Studentská komunita · ${city.name}`, description: `Otázky, rady a zkušenosti studentů ve městě ${city.name}.`, alternates: { canonical: `/${city.slug}/komunita` } }; }
export default async function Page({ params }: Props) { const city = await getPublishedCityModule((await params).city, "community"); if (!city) notFound(); return <CityCommunityPage city={city} />; }
