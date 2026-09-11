import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HousingDetail } from "@/components/housing-detail";
import { getPublishedCity } from "@/lib/city-data";
import { getOwnedHousingListings, getPublicHousingListing } from "@/lib/housing-server";
import { getCurrentAccount } from "@/lib/user-auth";
type Props={params:Promise<{city:string;id:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const{city,id}=await params;const current=await getPublishedCity(city);const item=current?.slug==="brno"?await getPublicHousingListing(id):null;if(!current||!item)return{title:"Inzerát bydlení",robots:{index:false,follow:false}};return{title:`${item.title} · Bydlení`,description:item.shortDescription,alternates:{canonical:`/brno/bydleni/${item.id}`},openGraph:{title:item.title,description:item.shortDescription,type:"article"}};}
export default async function HousingDetailPage({params}:Props){const{city,id}=await params;const current=await getPublishedCity(city);if(!current||current.slug!=="brno")notFound();const account=await getCurrentAccount();let item=await getPublicHousingListing(id,account?.id);if(!item&&account)item=(await getOwnedHousingListings(account.id)).find((value)=>value.id===id)||null;if(!item)notFound();return <HousingDetail item={item}/>;}
