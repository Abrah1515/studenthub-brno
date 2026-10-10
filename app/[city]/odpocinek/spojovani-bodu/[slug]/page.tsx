import { notFound } from "next/navigation";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
import { dotsGames } from "@/lib/connect-dots";
import { DotsGame } from "@/components/dots-game";
import { isRestActivityEnabled } from "@/lib/rest-activities";
import "../../coloring.css";
import "../../dots.css";
export const metadata={title:"Spojování bodů – StudentHub",robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{city:string;slug:string}>}){if(!isRestActivityEnabled('dots'))notFound();const {city:citySlug,slug}=await params,city=await getPublishedCity(citySlug),game=dotsGames.find(g=>g.slug===slug);if(!city||!game)notFound();const account=await getCurrentAccount(),owner=account?.accountStatus==="active"?account.id:"guest";return <DotsGame key={`${slug}:${owner}`} city={city.slug} game={game} owner={owner}/>;}
