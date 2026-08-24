import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/user-auth";
import { createServiceClient } from "@/lib/supabase-server";
import { faculties } from "@/lib/universities";

const schema=z.object({cityId:z.string().regex(/^[a-z0-9-]{2,80}$/).default("brno"),universityId:z.string().max(50).nullable(),facultyId:z.string().max(80).nullable(),studyYear:z.number().int().min(1).max(6).nullable()}).superRefine((value,ctx)=>{if(value.facultyId&&!faculties.some((faculty)=>faculty.id===value.facultyId&&faculty.universityId===value.universityId))ctx.addIssue({code:"custom",path:["facultyId"],message:"Fakulta nepatří ke škole."});});
export async function PATCH(request:Request){const profile=await getCurrentAccount();if(!profile)return NextResponse.json({message:"Přihlaste se."},{status:401});if(profile.accountStatus!=="active")return NextResponse.json({message:"Účet je pozastavený."},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:"Nastavení školy není platné."},{status:422});const value=parsed.data;await createServiceClient().from("profiles").update({city_id:value.cityId,university_id:value.universityId,faculty_id:value.facultyId,study_year:value.studyYear}).eq("id",profile.id);return NextResponse.json({message:"Nastavení profilu bylo aktualizováno."});}
