import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/user-auth";
import { createServiceClient } from "@/lib/supabase-server";
import { profileUpdateSchema } from "@/lib/schemas";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";
import { getPublishedCity, getUniversityIdsForPublishedCity } from "@/lib/city-data";

export async function GET(){ const profile=await getCurrentAccount(); return NextResponse.json({profile},{headers:{"Cache-Control":"private, no-store"}}); }

export async function PATCH(request:Request){
  if(!allowRequest(`profile-update:${requestFingerprint(request)}`,20,60*60*1000)) return NextResponse.json({message:"Limit úprav profilu byl vyčerpán."},{status:429});
  const current=await getCurrentAccount(); if(!current) return NextResponse.json({message:"Pro úpravu profilu se přihlaste."},{status:401}); if(current.accountStatus!=="active") return NextResponse.json({message:"Pozastavený účet nelze upravovat."},{status:403});
  const parsed=profileUpdateSchema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zkontrolujte profil.",issues:parsed.error.flatten().fieldErrors},{status:422});
  const value=parsed.data; const city=await getPublishedCity(value.cityId); if(!city) return NextResponse.json({message:"Vybrané město není aktivní."},{status:422}); const universityIds=await getUniversityIdsForPublishedCity(city.id); if(value.universityId&&!universityIds.includes(value.universityId)) return NextResponse.json({message:"Vybraná škola není dostupná v tomto městě."},{status:422}); const client=createServiceClient(); const duplicate=await client.from("profiles").select("id").ilike("username",value.username).neq("id",current.id).maybeSingle(); if(duplicate.data) return NextResponse.json({message:"Toto uživatelské jméno už používá jiný profil.",issues:{username:["Zvolte jiné uživatelské jméno."]}},{status:409});
  const update={username:value.username,display_name:value.displayName,bio:value.bio||null,city_id:city.id,university_id:value.universityId||null,faculty_id:value.facultyId||null,study_program:value.studyProgram||null,study_year:value.studyYear||null,interests:[...new Set(value.interests.map((item)=>item.trim()).filter(Boolean))],profile_visibility:value.profileVisibility,show_faculty:value.showFaculty,show_study_program:value.showStudyProgram,show_study_year:value.showStudyYear,allow_chat_requests:value.allowChatRequests,community_rules_accepted_at:current.communityRulesAccepted?undefined:new Date().toISOString()};
  const {error}=await client.from("profiles").update(update).eq("id",current.id); if(error) return NextResponse.json({message:error.code==="23505"?"Toto uživatelské jméno už existuje.":"Profil se nepodařilo uložit."},{status:error.code==="23505"?409:422});
  await client.from("community_profiles").upsert({user_id:current.id,nickname:value.displayName,city_id:city.id,university_id:value.universityId||null,faculty_id:value.facultyId||null,status:"active"},{onConflict:"user_id"});
  return NextResponse.json({message:"Profil a nastavení byly uloženy."});
}
