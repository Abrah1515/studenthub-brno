import { notFound } from "next/navigation";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
import { coloringAssets } from "@/lib/coloring";
import { ColoringEditor } from "@/components/coloring-editor";
import "../coloring.css";
export const metadata={title:"Vybarvování – StudentHub",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{city:string;id:string}>}){const {city:slug,id}=await params;const city=await getPublishedCity(slug),asset=coloringAssets.find(a=>a.id===id);if(!city||!asset)notFound();const account=await getCurrentAccount();const owner=account?.accountStatus==="active"?account.id:"guest";return <ColoringEditor key={`${id}:${owner}`} city={city.slug} asset={asset} owner={owner}/>;}
