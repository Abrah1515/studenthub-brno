import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { containsPersonalContact, looksLikeCommunitySpam } from "@/lib/community";
import { aggregatePlaceTraits, findPlaceDuplicates, type PlaceDuplicateInput, type PlaceTraitCode } from "@/lib/place-community";
import { legacyProfileIdentity, publicIdentityForRows } from "@/lib/profile-server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export const placeSubmissionImageBucket="place-submission-images";

export function cleanPlaceText(value:string,multiline=false){ const clean=value.replace(/<[^>]*>/g," ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,""); return multiline?clean.replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim():clean.replace(/\s+/g," ").trim(); }
export function invalidPlaceCommentReason(value:string){ const clean=cleanPlaceText(value,true); if(containsPersonalContact(clean)) return "Do veřejné zkušenosti nevkládejte e-mail ani telefon."; if(/(?:https?:\/\/|www\.)/iu.test(clean)) return "Do zkušenosti nevkládejte odkazy."; if(looksLikeCommunitySpam(clean)) return "Text vypadá jako automatický spam."; return null; }

function imageMime(bytes:Buffer){ if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return"image/jpeg"; if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return"image/png"; if(bytes.length>=12&&bytes.subarray(0,4).toString("ascii")==="RIFF"&&bytes.subarray(8,12).toString("ascii")==="WEBP")return"image/webp"; return null; }

export async function sanitizeAndUploadPlacePhoto(file:File,submissionId:string,sortOrder:number){
  if(file.size<1||file.size>6*1024*1024)throw new Error("Každá fotografie může mít nejvýše 6 MB."); const bytes=Buffer.from(await file.arrayBuffer()); const detected=imageMime(bytes);
  if(!detected||file.type!==detected)throw new Error("Fotografie musí být skutečný JPEG, PNG nebo WebP."); if(!isSupabaseConfigured())throw new Error("Fotografie vyžadují připojené produkční úložiště.");
  const {createCanvas,loadImage}=await import("@napi-rs/canvas"); const source=await loadImage(bytes).catch(()=>null); if(!source||source.width<1||source.height<1||source.width>12000||source.height>12000)throw new Error("Fotografii se nepodařilo bezpečně přečíst.");
  const ratio=Math.min(1,1800/Math.max(source.width,source.height)); const width=Math.max(1,Math.round(source.width*ratio)); const height=Math.max(1,Math.round(source.height*ratio)); if(width<320||height<240)throw new Error("Fotografie je příliš malá.");
  const canvas=createCanvas(width,height); canvas.getContext("2d").drawImage(source,0,0,width,height); const encoded=await canvas.encode("webp",82); const storagePath=`${submissionId}/${randomUUID()}.webp`;
  const upload=await createServiceClient().storage.from(placeSubmissionImageBucket).upload(storagePath,encoded,{contentType:"image/webp",cacheControl:"3600",upsert:false}); if(upload.error)throw new Error("Fotografii se nepodařilo bezpečně uložit.");
  return {id:randomUUID(),submission_id:submissionId,storage_path:storagePath,mime_type:"image/webp",width,height,byte_size:encoded.length,checksum_sha256:createHash("sha256").update(encoded).digest("hex"),sort_order:sortOrder};
}
export async function removePlacePhotos(paths:unknown[]){ if(!isSupabaseConfigured())return; const safe=paths.filter((path):path is string=>typeof path==="string"&&/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(path)); if(safe.length)await createServiceClient().storage.from(placeSubmissionImageBucket).remove(safe); }
export async function signedPlacePhotos(rows:Record<string,unknown>[],expires=3600):Promise<Array<Record<string,unknown>&{url:string}>>{ if(!rows.length)return[]; const paths=rows.map((row)=>String(row.storage_path)); const {data}=await createServiceClient().storage.from(placeSubmissionImageBucket).createSignedUrls(paths,expires); const urls=new Map((data||[]).map((item)=>[item.path,item.signedUrl])); return rows.map((row)=>({...row,url:urls.get(String(row.storage_path))||null})).filter((row):row is Record<string,unknown>&{url:string}=>typeof row.url==="string"&&Boolean(row.url)); }

export async function duplicatePlaces(input:{name:string;address:string;latitude:number;longitude:number;sourceUrl?:string},cityId="brno"){
  const client=createServiceClient(); const [{data:places},{data:aliases}]=await Promise.all([client.from("places").select("id,name,address,latitude,longitude,website_url").eq("city_id",cityId).in("status",["approved","draft"]),client.from("place_aliases").select("place_id,alias")]);
  const aliasMap=new Map<string,string[]>(); for(const row of aliases||[]){const list=aliasMap.get(String(row.place_id))||[];list.push(String(row.alias));aliasMap.set(String(row.place_id),list);} const existing:PlaceDuplicateInput[]=(places||[]).map((row)=>({id:String(row.id),name:String(row.name),address:String(row.address),lat:Number(row.latitude),lng:Number(row.longitude),website:row.website_url?String(row.website_url):undefined,aliases:aliasMap.get(String(row.id))}));
  const matches=findPlaceDuplicates({name:input.name,address:input.address,lat:input.latitude,lng:input.longitude,website:input.sourceUrl},existing); const byId=new Map((places||[]).map((row)=>[String(row.id),row])); return matches.map((match)=>({...match,place:byId.get(match.id)}));
}

export async function publicPlaceComments(placeId:string,viewerId?:string){
  const client=createServiceClient(); const {data:rows,error}=await client.from("place_comments").select("id,place_id,author_id,body,helpful_count,edited_at,created_at,updated_at").eq("place_id",placeId).eq("status","active").order("created_at",{ascending:false}).limit(200); if(error)throw error; const comments=(rows||[]) as Record<string,unknown>[]; const ids=comments.map((row)=>String(row.id));
  const [{data:traits},{data:helpful},identities]=await Promise.all([ids.length?client.from("place_comment_traits").select("comment_id,trait").in("comment_id",ids):Promise.resolve({data:[]}),viewerId&&ids.length?client.from("place_comment_helpful").select("comment_id").eq("profile_id",viewerId).in("comment_id",ids):Promise.resolve({data:[]}),publicIdentityForRows(comments.map((row)=>row.author_id),viewerId)]);
  const helpfulSet=new Set((helpful||[]).map((row)=>String(row.comment_id))); const traitsByComment=new Map<string,PlaceTraitCode[]>(); for(const trait of traits||[]){const list=traitsByComment.get(String(trait.comment_id))||[];list.push(String(trait.trait) as PlaceTraitCode);traitsByComment.set(String(trait.comment_id),list);} const aggregate=aggregatePlaceTraits((traits||[]).map((trait)=>({trait:String(trait.trait),authorId:String(comments.find((comment)=>comment.id===trait.comment_id)?.author_id||"")})));
  return {items:comments.map((row)=>({id:String(row.id),body:String(row.body),helpfulCount:Number(row.helpful_count||0),traits:traitsByComment.get(String(row.id))||[],createdAt:String(row.created_at),updatedAt:String(row.updated_at),editedAt:row.edited_at?String(row.edited_at):undefined,owned:Boolean(viewerId&&row.author_id===viewerId),viewerHelpful:helpfulSet.has(String(row.id)),author:identities.get(String(row.author_id))||legacyProfileIdentity})),aggregate};
}
