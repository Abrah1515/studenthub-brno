import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HousingExplorer } from "@/components/housing-explorer";
import { getPublishedCity } from "@/lib/city-data";
import { getPublicHousingListings } from "@/lib/housing-server";
import { getCurrentAccount } from "@/lib/user-auth";
type Props={params:Promise<{city:string}>};
export const dynamic="force-dynamic";
export async function generateMetadata({params}:Props):Promise<Metadata>{const city=await getPublishedCity((await params).city);if(!city||city.slug!=="brno")notFound();return{title:"Studentské bydlení v Brně",description:"Aktuální nabídky pokojů, bytů, kolejí a poptávky studentského bydlení v Brně. Kontakt bezpečně přes soukromý chat StudentHubu.",alternates:{canonical:"/brno/bydleni"}};}
export default async function HousingPage({params}:Props){const city=await getPublishedCity((await params).city);if(!city||city.slug!=="brno")notFound();const account=await getCurrentAccount();return <Suspense fallback={<div className="housing-grid"><div className="housing-skeleton"/><div className="housing-skeleton"/></div>}><HousingExplorer initialItems={await getPublicHousingListings("brno",account?.id)}/></Suspense>;}
