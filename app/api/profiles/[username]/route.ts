import { NextResponse } from "next/server";
import { createServiceClient,isSupabaseConfigured } from "@/lib/supabase-server";
import { publicProfileFromRow } from "@/lib/profile-server";
import { getCurrentAccount } from "@/lib/user-auth";

type Context={params:Promise<{username:string}>};
export async function GET(_:Request,context:Context){ if(!isSupabaseConfigured()) return NextResponse.json({message:"Profil nebyl nalezen."},{status:404}); const username=decodeURIComponent((await context.params).username).toLowerCase(); const {data}=await createServiceClient().from("profiles").select("*").eq("username",username).eq("account_status","active").eq("profile_visibility","public").maybeSingle(); if(!data) return NextResponse.json({message:"Profil nebyl nalezen."},{status:404}); const viewer=await getCurrentAccount(); if(viewer){ const blocked=await createServiceClient().from("profile_blocks").select("blocked_id").eq("blocker_id",viewer.id).eq("blocked_id",data.id).maybeSingle(); if(blocked.data) return NextResponse.json({message:"Tento profil máte zablokovaný."},{status:404}); }
  const profile=await publicProfileFromRow(data); const client=createServiceClient(); const [{data:posts},{data:buddy},{data:listings},{data:events}]=await Promise.all([
    client.from("community_posts").select("id,body,category,created_at").eq("author_id",data.id).eq("status","active").order("created_at",{ascending:false}).limit(20),
    client.from("buddy_posts").select("id,activity_type,approximate_location,starts_at,description").eq("owner_id",data.id).eq("status","active").eq("moderation_status","approved").gte("expires_at",new Date().toISOString()).order("starts_at"),
    client.from("marketplace_listings").select("id,city_id,title,price_mode,price_amount,status,published_at").eq("seller_id",data.id).in("status",["active","reserved","sold"]).order("published_at",{ascending:false}).limit(20),
    client.from("community_events").select("id,title,starts_at,venue,status").eq("author_id",data.id).eq("status","published").gte("starts_at",new Date().toISOString()).order("starts_at").limit(20)
  ]); return NextResponse.json({profile,content:{posts:posts||[],buddy:buddy||[],listings:listings||[],events:events||[]}},{headers:{"Cache-Control":"private, no-store"}}); }
