import { notFound } from "next/navigation";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
import { DotsGallery } from "@/components/dots-gallery";
import { isRestActivityEnabled } from "@/lib/rest-activities";
import "../coloring.css";
import "../dots.css";
export const metadata={title:"Spojování bodů – StudentHub",description:"Chvíle klidu s originálními studentskými obrázky."};
export default async function Page({params}:{params:Promise<{city:string}>}){if(!isRestActivityEnabled('dots'))notFound();const {city:slug}=await params,city=await getPublishedCity(slug);if(!city)notFound();const account=await getCurrentAccount();return <DotsGallery city={city.slug} owner={account?.accountStatus==="active"?account.id:"guest"}/>;}
