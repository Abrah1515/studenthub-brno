import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { createServiceClient } from "@/lib/supabase-server";
import { removeProfileAvatar,saveProfileAvatar } from "@/lib/profile-server";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";

export const runtime="nodejs";
export async function POST(request:Request){
  if(!allowRequest(`profile-avatar:${requestFingerprint(request)}`,8,60*60*1000)) return NextResponse.json({message:"Limit změn fotografie byl vyčerpán."},{status:429});
  const profile=await getCurrentAccount(); if(!profile) return NextResponse.json({message:"Přihlaste se."},{status:401}); if(profile.accountStatus!=="active") return NextResponse.json({message:"Účet je pozastavený."},{status:403});
  const form=await request.formData().catch(()=>null); const file=form?.get("avatar"); if(!(file instanceof File)) return NextResponse.json({message:"Vyberte fotografii."},{status:422});
  try{ const path=await saveProfileAvatar(file,profile); await createServiceClient().from("profiles").update({avatar_path:path,avatar_url:null}).eq("id",profile.id); return NextResponse.json({message:"Profilová fotografie byla změněna."}); }
  catch(error){ return NextResponse.json({message:error instanceof Error?error.message:"Fotografii se nepodařilo uložit."},{status:422}); }
}
export async function DELETE(){ const profile=await getCurrentAccount(); if(!profile) return NextResponse.json({message:"Přihlaste se."},{status:401}); await removeProfileAvatar(profile); await createServiceClient().from("profiles").update({avatar_path:null,avatar_url:null}).eq("id",profile.id); return new NextResponse(null,{status:204}); }
