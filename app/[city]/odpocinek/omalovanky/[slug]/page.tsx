import { notFound } from "next/navigation";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
import { coloringAssets } from "@/lib/coloring";
import { ColoringEditor } from "@/components/coloring-editor";
import "../../coloring.css";
export const metadata={title:"Vybarvování – StudentHub",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{city:string;slug:string}>}){const {city:citySlug,slug}=await params;const city=await getPublishedCity(citySlug),asset=coloringAssets.find(a=>a.id===slug);if(!city||!asset)notFound();const account=await getCurrentAccount();const owner=account?.accountStatus==="active"?account.id:"guest";return <ColoringEditor key={`${slug}:${owner}`} city={city.slug} asset={asset} owner={owner}/>;}
