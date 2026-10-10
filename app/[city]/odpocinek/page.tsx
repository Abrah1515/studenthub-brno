import { notFound } from "next/navigation";
import { getPublishedCity } from "@/lib/city-data";
import { getCurrentAccount } from "@/lib/user-auth";
import { RestActivities } from "@/components/rest-activities";
import "./coloring.css";
export const metadata={title:"Odpočinek – Antistresové omalovánky",description:"Originální omalovánky pro krátkou studentskou pauzu. Vybarvujte prstem, stylusem nebo myší."};
export default async function Page({params}:{params:Promise<{city:string}>}){const city=await getPublishedCity((await params).city);if(!city)notFound();const account=await getCurrentAccount();return <RestActivities city={city.slug} owner={account?.accountStatus==="active"?account.id:"guest"}/>;}
