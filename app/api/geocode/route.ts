import { NextResponse } from "next/server";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";

export const runtime="nodejs";
let lastProviderRequest=0;
const endpoint=process.env.GEOCODING_ENDPOINT||"https://nominatim.openstreetmap.org/search";

export async function GET(request:Request){
  if(!allowRequest(`geocode:${requestFingerprint(request)}`,20,60*60*1000))return NextResponse.json({message:"Limit vyhledávání adres byl vyčerpán."},{status:429});const source=new URL(request.url);const query=(source.searchParams.get("q")||"").replace(/[\u0000-\u001f]/g," ").replace(/\s+/g," ").trim();if(query.length<3||query.length>180)return NextResponse.json({message:"Zadejte adresu o délce 3 až 180 znaků."},{status:422});
  const now=Date.now();if(now-lastProviderRequest<1100)return NextResponse.json({message:"Vyhledávání je omezené na jeden dotaz za sekundu. Zkuste to za chvíli."},{status:429,headers:{"Retry-After":"2"}});lastProviderRequest=now;
  const url=new URL(endpoint);url.searchParams.set("q",`${query}, Brno, Česko`);url.searchParams.set("format","jsonv2");url.searchParams.set("limit","5");url.searchParams.set("countrycodes","cz");url.searchParams.set("addressdetails","1");
  const contact=process.env.STUDENTHUB_CONTACT_EMAIL||"studenthubbrno@gmail.com";const response=await fetch(url,{headers:{"User-Agent":`StudentHub-Brno/1.0 (${contact})`,Accept:"application/json"},next:{revalidate:30*24*60*60}}).catch(()=>null);if(!response?.ok)return NextResponse.json({message:"Vyhledávání adres je teď nedostupné. Bod můžete vybrat ručně v mapě."},{status:502});const payload=await response.json().catch(()=>[]) as Array<Record<string,unknown>>;
  const items=payload.map((item)=>({id:String(item.place_id||item.osm_id),label:String(item.display_name||""),latitude:Number(item.lat),longitude:Number(item.lon),type:String(item.type||"")})).filter((item)=>item.label&&Number.isFinite(item.latitude)&&Number.isFinite(item.longitude)&&item.latitude>=48.9&&item.latitude<=49.4&&item.longitude>=16.3&&item.longitude<=16.9);
  return NextResponse.json({items,attribution:"© OpenStreetMap contributors",usagePolicy:"https://operations.osmfoundation.org/policies/nominatim/"},{headers:{"Cache-Control":"private, max-age=300"}});
}
