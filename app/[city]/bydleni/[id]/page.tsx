import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HousingDetail } from "@/components/housing-detail";
import { getPublishedCityModule } from "@/lib/city-data";
import { getOwnedHousingListings, getPublicHousingListing } from "@/lib/housing-server";
import { getCurrentAccount } from "@/lib/user-auth";
type Props={params:Promise<{city:string;id:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const{city,id}=await params;const current=await getPublishedCityModule(city,"housing");const item=current?await getPublicHousingListing(id,undefined,current.id):null;if(!current||!item)return{title:"Inzerát bydlení",robots:{index:false,follow:false}};return{title:`${item.title} · Bydlení`,description:item.shortDescription,alternates:{canonical:`/${current.slug}/bydleni/${item.id}`},openGraph:{title:item.title,description:item.shortDescription,type:"article"}};}
export default async function HousingDetailPage({params}:Props){const{city,id}=await params;const current=await getPublishedCityModule(city,"housing");if(!current)notFound();const account=await getCurrentAccount();let item=await getPublicHousingListing(id,account?.id,current.id);if(!item&&account)item=(await getOwnedHousingListings(account.id)).find((value)=>value.id===id&&value.cityId===current.id)||null;if(!item)notFound();return <HousingDetail item={item}/>;}
