import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { createServiceClient } from "@/lib/supabase-server";
import { profileUpdateSchema } from "@/lib/schemas";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";

export async function GET(){ const profile=await getCurrentAccount(); return NextResponse.json({profile,googleEnabled:process.env.GOOGLE_AUTH_ENABLED==="true"},{headers:{"Cache-Control":"private, no-store"}}); }

export async function PATCH(request:Request){
  if(!allowRequest(`profile-update:${requestFingerprint(request)}`,20,60*60*1000)) return NextResponse.json({message:"Limit úprav profilu byl vyčerpán."},{status:429});
  const current=await getCurrentAccount(); if(!current) return NextResponse.json({message:"Pro úpravu profilu se přihlaste."},{status:401}); if(current.accountStatus!=="active") return NextResponse.json({message:"Pozastavený účet nelze upravovat."},{status:403});
  const parsed=profileUpdateSchema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zkontrolujte profil.",issues:parsed.error.flatten().fieldErrors},{status:422});
  const value=parsed.data; const client=createServiceClient(); const duplicate=await client.from("profiles").select("id").ilike("username",value.username).neq("id",current.id).maybeSingle(); if(duplicate.data) return NextResponse.json({message:"Toto uživatelské jméno už používá jiný profil.",issues:{username:["Zvolte jiné uživatelské jméno."]}},{status:409});
  const update={username:value.username,display_name:value.displayName,bio:value.bio||null,city_id:value.cityId,university_id:value.universityId||null,faculty_id:value.facultyId||null,study_program:value.studyProgram||null,study_year:value.studyYear||null,interests:[...new Set(value.interests.map((item)=>item.trim()).filter(Boolean))],profile_visibility:value.profileVisibility,show_faculty:value.showFaculty,show_study_program:value.showStudyProgram,show_study_year:value.showStudyYear,community_rules_accepted_at:current.communityRulesAccepted?undefined:new Date().toISOString()};
  const {error}=await client.from("profiles").update(update).eq("id",current.id); if(error) return NextResponse.json({message:error.code==="23505"?"Toto uživatelské jméno už existuje.":"Profil se nepodařilo uložit."},{status:error.code==="23505"?409:422});
  await client.from("community_profiles").upsert({user_id:current.id,nickname:value.displayName,city_id:value.cityId,university_id:value.universityId||null,faculty_id:value.facultyId||null,status:"active"},{onConflict:"user_id"});
  return NextResponse.json({message:"Profil a nastavení byly uloženy."});
}
