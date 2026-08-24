import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { createServiceClient } from "@/lib/supabase-server";
type Context={params:Promise<{username:string}>};
async function ids(context:Context){ const viewer=await getCurrentAccount(); if(!viewer?.complete) return null; const {data}=await createServiceClient().from("profiles").select("id").eq("username",decodeURIComponent((await context.params).username).toLowerCase()).maybeSingle(); return data&&data.id!==viewer.id?{viewer:viewer.id,target:String(data.id)}:null; }
export async function POST(_:Request,context:Context){ const value=await ids(context); if(!value) return NextResponse.json({message:"Profil nelze zablokovat."},{status:401}); await createServiceClient().from("profile_blocks").upsert({blocker_id:value.viewer,blocked_id:value.target}); return NextResponse.json({message:"Profil je zablokovaný. Jeho obsah se nebude zobrazovat."}); }
export async function DELETE(_:Request,context:Context){ const value=await ids(context); if(!value) return NextResponse.json({message:"Profil nelze odblokovat."},{status:401}); await createServiceClient().from("profile_blocks").delete().eq("blocker_id",value.viewer).eq("blocked_id",value.target); return new NextResponse(null,{status:204}); }
