import { notFound } from "next/navigation";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
import { ColoringGallery } from "@/components/coloring-gallery";
import "../coloring.css";
export const metadata={title:"Antistresové omalovánky – StudentHub",description:"Osm originálních omalovánek pro klidnou studentskou pauzu."};
export default async function Page({params}:{params:Promise<{city:string}>}){const city=await getPublishedCity((await params).city);if(!city)notFound();const account=await getCurrentAccount();return <ColoringGallery city={city.slug} owner={account?.accountStatus==="active"?account.id:"guest"}/>;}
