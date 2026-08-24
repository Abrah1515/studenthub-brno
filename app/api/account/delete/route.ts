import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAccount,getCurrentUser } from "@/lib/user-auth";
import { createServiceClient } from "@/lib/supabase-server";
import { removeProfileAvatar } from "@/lib/profile-server";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";

const schema=z.object({confirmation:z.literal("ODSTRANIT"),password:z.string().max(128).optional()});
export async function DELETE(request:Request){
  if(!allowRequest(`account-delete:${requestFingerprint(request)}`,3,24*60*60*1000)) return NextResponse.json({message:"Limit pokusů byl vyčerpán."},{status:429});
  const [user,profile]=await Promise.all([getCurrentUser(),getCurrentAccount()]); if(!user||!profile) return NextResponse.json({message:"Přihlaste se znovu."},{status:401}); const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Potvrzení odstranění není správné."},{status:422});
  if(user.provider==="email"){
    if(!parsed.data.password) return NextResponse.json({message:"Pro odstranění účtu znovu zadejte heslo."},{status:401}); const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if(!url||!anon) return NextResponse.json({message:"Ověření identity není dostupné."},{status:503});
    const verifier=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}); const {error}=await verifier.auth.signInWithPassword({email:user.email,password:parsed.data.password}); if(error) return NextResponse.json({message:"Heslo není správné."},{status:401}); await verifier.auth.signOut();
  } else {
    const last=user.lastSignInAt?new Date(user.lastSignInAt).getTime():0; if(Date.now()-last>10*60*1000) return NextResponse.json({message:"Kvůli bezpečnosti se nejprve znovu přihlaste přes svého poskytovatele a odstranění zopakujte."},{status:401});
  }
  const client=createServiceClient(); await removeProfileAvatar(profile); await client.from("account_moderation_history").insert({profile_id:profile.id,actor_id:profile.id,action:"account_deleted",reason:"Odstranění potvrzené vlastníkem účtu"});
  await Promise.all([
    client.from("community_posts").update({author_id:null,author_nickname:"Původní anonymní příspěvek"}).eq("author_id",profile.id),
    client.from("community_comments").update({author_id:null,author_nickname:"Původní anonymní příspěvek"}).eq("author_id",profile.id),
    client.from("community_events").update({author_id:null,author_email:"deleted@invalid.local"}).eq("author_id",profile.id),
    client.from("buddy_posts").update({owner_id:null}).eq("owner_id",profile.id),
    client.from("marketplace_messages").update({buyer_id:null,buyer_email:"deleted@invalid.local"}).eq("buyer_id",profile.id)
  ]);
  const {data:listings}=await client.from("marketplace_listings").select("id").eq("seller_id",profile.id); await Promise.all((listings||[]).map((item)=>client.from("marketplace_listings").update({seller_id:null,public_alias:"Původní anonymní inzerát",seller_email:`deleted+${item.id}@invalid.local`,seller_email_hash:"0".repeat(64),verification_token_hash:null}).eq("id",item.id)));
  const {error}=await client.auth.admin.deleteUser(profile.id); if(error) return NextResponse.json({message:"Účet se nepodařilo odstranit. Kontaktujte podporu."},{status:502});
  return NextResponse.json({message:"Účet a osobní údaje byly odstraněny. Veřejný obsah zůstal anonymizovaný."});
}
