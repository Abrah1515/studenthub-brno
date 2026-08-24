import { NextResponse } from "next/server";
import { createServiceClient,isSupabaseConfigured } from "@/lib/supabase-server";
import { publicProfileFromRow } from "@/lib/profile-server";

export async function GET(request:Request){
  if(!isSupabaseConfigured()) return NextResponse.json({items:[]}); const q=new URL(request.url).searchParams.get("q")?.trim().slice(0,80)||""; let query=createServiceClient().from("profiles").select("*").eq("account_status","active").eq("profile_visibility","public").not("username","is",null).order("created_at",{ascending:false}).limit(40); if(q) query=query.or(`username.ilike.%${q.replace(/[%_,()]/g,"")}%,display_name.ilike.%${q.replace(/[%_,()]/g,"")}%`);
  const {data}=await query; return NextResponse.json({items:(await Promise.all((data||[]).map(publicProfileFromRow))).filter(Boolean)},{headers:{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"}});
}
