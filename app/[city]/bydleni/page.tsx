import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HousingExplorer } from "@/components/housing-explorer";
import { getPublishedCityModule } from "@/lib/city-data";
import { getPublicHousingListings } from "@/lib/housing-server";
import { getCurrentAccount } from "@/lib/user-auth";
type Props={params:Promise<{city:string}>};
export const dynamic="force-dynamic";
export async function generateMetadata({params}:Props):Promise<Metadata>{const city=await getPublishedCityModule((await params).city,"housing");if(!city)notFound();return{title:`Studentské bydlení v ${city.name}`,description:`Aktuální nabídky a poptávky studentského bydlení v ${city.name}. Kontakt bezpečně přes soukromý chat StudentHubu.`,alternates:{canonical:`/${city.slug}/bydleni`}};}
export default async function HousingPage({params}:Props){const city=await getPublishedCityModule((await params).city,"housing");if(!city)notFound();const account=await getCurrentAccount();return <Suspense fallback={<div className="housing-grid"><div className="housing-skeleton"/><div className="housing-skeleton"/></div>}><HousingExplorer initialItems={await getPublicHousingListings(city.id,account?.id)}/></Suspense>;}
