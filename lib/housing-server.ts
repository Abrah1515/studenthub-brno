import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { publicHousingListing } from "@/lib/housing-public";
import type { HousingListing } from "@/lib/housing-types";
import { legacyProfileIdentity, publicIdentityForRows } from "@/lib/profile-server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export const housingImageBucket="housing-images";
export function cleanHousingText(value:string,multiline=false){const clean=value.replace(/<[^>]*>/g," ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"");return multiline?clean.replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim():clean.replace(/\s+/g," ").trim();}
export function housingHash(value:string){return createHash("sha256").update(value).digest("hex");}
export function housingDuplicateFingerprint(input:{title:string;locality:string;description:string}){return housingHash([input.title,input.locality,input.description.slice(0,240)].map((value)=>cleanHousingText(value).normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase()).join("|"));}

export function housingModerationFlags(input:{title:string;shortDescription:string;description:string;depositAmount?:number;priceMonthly:number}){
  const raw=`${input.title}\n${input.shortDescription}\n${input.description}`; const normalized=raw.normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase(); const flags:string[]=[];
  if(/(?:https?:\/\/|www\.|t\.me\/|wa\.me\/)/i.test(raw)) flags.push("external_link");
  if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(raw)||/(?:\+?420\s*)?(?:\d[ .-]?){9}/.test(raw)) flags.push("public_contact");
  if(/(?:posli|zaplat|uhrad|preved).{0,30}(?:zaloh|kauci|rezervacni poplatek).{0,35}(?:predem|bez prohlidky|hned)/.test(normalized)) flags.push("advance_payment");
  if(/(?:jen|pouze|nechci).{0,18}(?:zeny|muze|cizince|cechy|slovaky|romy|krestany|muslimy)/.test(normalized)) flags.push("discrimination");
  if(/(?:drogy|zbrane|sex za najem|sexualni sluzb)/.test(normalized)) flags.push("prohibited_content");
  if(input.depositAmount!=null&&input.depositAmount>Math.max(3*input.priceMonthly,100000)) flags.push("unusual_deposit");
  return [...new Set(flags)];
}

export type HousingLimitDecision={status:"allowed"}|{status:"limited"}|{status:"error";code:string};
export async function consumeHousingLimit(request:Request,action:string,limit:number,windowSeconds:number,accountId?:string):Promise<HousingLimitDecision>{
  const identity=accountId?`account:${accountId}`:`network:${requestFingerprint(request)}`; const key=housingHash(`housing:${identity}`).slice(0,24);
  if(!isSupabaseConfigured()) return {status:allowRequest(`housing:${action}:${key}`,limit,windowSeconds*1000)?"allowed":"limited"};
  const {data,error}=await createServiceClient().rpc("consume_housing_rate_limit",{p_key_hash:key,p_action:action,p_limit:limit,p_window_seconds:windowSeconds});
  if(error)return{status:"error",code:error.code||"rpc_failed"}; return{status:data===true?"allowed":"limited"};
}

function actualMime(bytes:Buffer){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return"image/jpeg";if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return"image/png";if(bytes.length>=12&&bytes.subarray(0,4).toString("ascii")==="RIFF"&&bytes.subarray(8,12).toString("ascii")==="WEBP")return"image/webp";return null;}
export async function sanitizeAndUploadHousingPhoto(file:File,listingId:string,sortOrder:number){
  if(file.size<1||file.size>5*1024*1024)throw new Error("Každá fotografie může mít nejvýše 5 MB."); const bytes=Buffer.from(await file.arrayBuffer()); const detected=actualMime(bytes);
  if(!detected||detected!==file.type)throw new Error("Fotografie musí být skutečný JPEG, PNG nebo WebP."); const source=await loadImage(bytes).catch(()=>null);
  if(!source||source.width<320||source.height<240||source.width>12000||source.height>12000)throw new Error("Fotografie musí mít alespoň 320 × 240 px a platný obsah.");
  const ratio=Math.min(1,1920/Math.max(source.width,source.height)); const width=Math.round(source.width*ratio); const height=Math.round(source.height*ratio); const canvas=createCanvas(width,height); canvas.getContext("2d").drawImage(source,0,0,width,height); const encoded=await canvas.encode("webp",82);
  if(encoded.length>3*1024*1024)throw new Error("Optimalizovaná fotografie je příliš velká."); const path=`${listingId}/${randomUUID()}.webp`; const client=createServiceClient(); const upload=await client.storage.from(housingImageBucket).upload(path,encoded,{contentType:"image/webp",cacheControl:"3600",upsert:false}); if(upload.error)throw new Error("Fotografii se nepodařilo bezpečně uložit.");
  return{id:randomUUID(),listing_id:listingId,storage_path:path,sort_order:sortOrder,width,height,mime_type:"image/webp",size_bytes:encoded.length};
}
export async function removeHousingPhotos(paths:unknown[]){if(!isSupabaseConfigured())return;const safe=paths.filter((path):path is string=>typeof path==="string"&&/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(path));if(safe.length)await createServiceClient().storage.from(housingImageBucket).remove(safe);}
async function signedPhotos(rows:Record<string,unknown>[]):Promise<Array<Record<string,unknown>&{signedUrl?:string}>>{if(!rows.length)return[];const client=createServiceClient();const paths=rows.map((row)=>String(row.storage_path));const{data}=await client.storage.from(housingImageBucket).createSignedUrls(paths,3600);const urls=new Map((data||[]).map((item)=>[item.path,item.signedUrl]));return rows.map((row)=>{const signedUrl=urls.get(String(row.storage_path));return{...row,...(signedUrl?{signedUrl}: {})};});}

async function blockedProfileIds(viewerId?:string){if(!viewerId)return new Set<string>();const {data}=await createServiceClient().from("profile_blocks").select("blocker_id,blocked_id").or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);return new Set((data||[]).map((row)=>String(row.blocker_id)===viewerId?String(row.blocked_id):String(row.blocker_id)));}
export async function getPublicHousingListings(cityId="brno",viewerId?:string):Promise<HousingListing[]>{
  if(!isSupabaseConfigured())return[];const client=createServiceClient();await client.rpc("expire_housing_listings");const{data:rows,error}=await client.from("housing_listings").select("*").eq("city_id",cityId).eq("status","active").gt("expires_at",new Date().toISOString()).order("published_at",{ascending:false});if(error)throw error;
  const blocked=await blockedProfileIds(viewerId);const visible=(rows||[]).filter((row)=>!blocked.has(String(row.author_id)));const ids=visible.map((row)=>String(row.id));const photoResult=ids.length?await client.from("housing_photos").select("*").in("listing_id",ids):{data:[]};const photos=await signedPhotos((photoResult.data||[]) as Record<string,unknown>[]);const identities=await publicIdentityForRows(visible.map((row)=>row.author_id),viewerId);
  const result:HousingListing[]=[];for(const row of visible){const item=publicHousingListing(row,photos.filter((photo)=>photo.listing_id===row.id));if(item)result.push({...item,author:identities.get(String(row.author_id))||legacyProfileIdentity,owned:row.author_id===viewerId,chatAvailable:Boolean(viewerId&&row.author_id!==viewerId)});}return result;
}
export async function getPublicHousingListing(id:string,viewerId?:string){const rows=await getPublicHousingListings("brno",viewerId);return rows.find((row)=>row.id===id)||null;}
export async function getOwnedHousingListings(authorId:string):Promise<HousingListing[]>{if(!isSupabaseConfigured())return[];const client=createServiceClient();const{data:rows}=await client.from("housing_listings").select("*").eq("author_id",authorId).order("created_at",{ascending:false});const ids=(rows||[]).map((row)=>String(row.id));const{data:photoRows}=ids.length?await client.from("housing_photos").select("*").in("listing_id",ids):{data:[]};const photos=await signedPhotos((photoRows||[]) as Record<string,unknown>[]);const identities=await publicIdentityForRows([authorId],authorId);const result:HousingListing[]=[];for(const row of rows||[]){const item=publicHousingListing(row,photos.filter((photo)=>photo.listing_id===row.id),true);if(item)result.push({...item,author:identities.get(authorId)||legacyProfileIdentity,owned:true,chatAvailable:false});}return result;}
export async function recordHousingHistory(listingId:string,eventType:string,previousStatus:unknown,newStatus:unknown,actorId?:string|null,changes:Record<string,unknown>={}){const{error}=await createServiceClient().from("housing_history").insert({listing_id:listingId,actor_id:actorId||null,event_type:eventType,previous_status:previousStatus||null,new_status:newStatus||null,changes});if(error)throw error;}
export async function countHousingActivity(id:string,type:"view"|"contact"){const functionName=type==="view"?"increment_housing_view":"increment_housing_contact";await createServiceClient().rpc(functionName,{target_listing:id});}
