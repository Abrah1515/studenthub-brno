import { notFound,permanentRedirect } from "next/navigation";
import { getPublishedCity } from "@/lib/city-data";
import { coloringAssets } from "@/lib/coloring";
import "../coloring.css";
export const metadata={title:"Vybarvování – StudentHub",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{city:string;id:string}>}){const {city:slug,id}=await params;const city=await getPublishedCity(slug),asset=coloringAssets.find(a=>a.id===id);if(!city||!asset)notFound();permanentRedirect(`/${city.slug}/odpocinek/omalovanky/${asset.id}`);}
