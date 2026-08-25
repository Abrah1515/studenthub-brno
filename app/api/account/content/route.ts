import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { createServiceClient } from "@/lib/supabase-server";

export async function GET(){ const profile=await getCurrentAccount(); if(!profile) return NextResponse.json({message:"Přihlaste se."},{status:401}); const client=createServiceClient(); const [{data:posts},{data:comments},{data:buddy},{data:listings},{data:events},{data:placeSuggestions}]=await Promise.all([
  client.from("community_posts").select("id,body,status,created_at").eq("author_id",profile.id).order("created_at",{ascending:false}).limit(50),
  client.from("community_comments").select("id,post_id,body,status,created_at").eq("author_id",profile.id).order("created_at",{ascending:false}).limit(50),
  client.from("buddy_posts").select("id,activity_type,description,status,starts_at").eq("owner_id",profile.id).order("created_at",{ascending:false}).limit(50),
  client.from("marketplace_listings").select("id,city_id,title,status,published_at,created_at").eq("seller_id",profile.id).order("created_at",{ascending:false}).limit(50),
  client.from("community_events").select("id,title,status,starts_at").eq("author_id",profile.id).order("created_at",{ascending:false}).limit(50),
  client.from("place_submissions").select("id,name,status,submission_type,target_place_id,published_place_id,moderator_notes,created_at,updated_at").eq("author_id",profile.id).order("created_at",{ascending:false}).limit(100)
]); return NextResponse.json({posts:posts||[],comments:comments||[],buddy:buddy||[],listings:listings||[],events:events||[],placeSuggestions:placeSuggestions||[]},{headers:{"Cache-Control":"private, no-store"}}); }
