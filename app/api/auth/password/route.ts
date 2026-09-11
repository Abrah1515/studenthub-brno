import { NextResponse } from "next/server";
import { z } from "zod";
import { accountEmailSchema } from "@/lib/schemas";
import { authRouteClient,safeNextPath } from "@/lib/auth-route-client";
import { allowAuthRequest } from "@/lib/auth-rate-limit";
import { administrativeRoles } from "@/lib/admin-auth";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { copyResponseCookies } from "@/lib/auth-cookies";

const schema=z.object({email:accountEmailSchema,password:z.string().min(1).max(128),next:z.string().optional(),audience:z.enum(["user","admin"]).default("user")});
export async function POST(request:Request){
  if(!await allowAuthRequest(request,"login",10,60*60)) return NextResponse.json({message:"Příliš mnoho pokusů. Zkuste to později."},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zadejte platný e-mail a heslo."},{status:422});
  const fallback=parsed.data.audience==="admin"?"/admin":"/brno/nastaveni";
  const next=safeNextPath(parsed.data.next,fallback);
  const response=NextResponse.json({ok:true,next},{headers:{"Cache-Control":"private, no-store"}}); const client=await authRouteClient(response); if(!client||!isSupabaseConfigured()) return NextResponse.json({message:"Přihlášení bude dostupné po připojení Supabase."},{status:503});
  const {data,error}=await client.auth.signInWithPassword({email:parsed.data.email,password:parsed.data.password});
  if(error||!data.user?.email_confirmed_at) { if(data.session) await client.auth.signOut(); return NextResponse.json({message:"E-mail, heslo nebo potvrzení e-mailu není v pořádku."},{status:401}); }
  const service=createServiceClient();
  let {data:profile}=await service.from("profiles").select("role,city_id,faculty_id,account_status,is_blocked").eq("id",data.user.id).maybeSingle();
  if(!profile){
    const created=await service.from("profiles").upsert({id:data.user.id,display_name:"Student",role:"user"},{onConflict:"id"}).select("role,city_id,faculty_id,account_status,is_blocked").single();
    profile=created.data;
  }
  const active=profile?.account_status==="active"&&!profile?.is_blocked;
  const adminAllowed=profile&&administrativeRoles.includes(String(profile.role) as (typeof administrativeRoles)[number]);
  if(!active||(parsed.data.audience==="admin"&&!adminAllowed)){
    await client.auth.signOut({scope:"local"});
    return copyResponseCookies(response,NextResponse.json({message:parsed.data.audience==="admin"?"Přihlášení se nezdařilo nebo účet nemá redakční roli.":"Přihlášení se nezdařilo."},{status:401}));
  }
  const refreshed=await client.auth.refreshSession();
  if(refreshed.error||!refreshed.data.session) { await client.auth.signOut({scope:"local"}); return copyResponseCookies(response,NextResponse.json({message:"Relaci se nepodařilo bezpečně obnovit. Přihlaste se znovu."},{status:503})); }
  return response;
}
