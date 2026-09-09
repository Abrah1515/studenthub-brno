import { NextResponse } from "next/server";
import { z } from "zod";
import { accountPasswordSchema } from "@/lib/schemas";
import { authRouteClient } from "@/lib/auth-route-client";
import { getCurrentUser } from "@/lib/user-auth";
import { allowAuthRequest } from "@/lib/auth-rate-limit";
import { createServiceClient } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/auth-cookies";
import { passwordRecoveryIntentCookie, verifyPasswordRecoveryIntent } from "@/lib/password-recovery-intent";

const schema=z.object({password:accountPasswordSchema});
export async function POST(request:Request){
  if(!await allowAuthRequest(request,"password-update",5,60*60)) return NextResponse.json({message:"Příliš mnoho pokusů."},{status:429});
  const user=await getCurrentUser();
  const recoveryIntent=(await cookies()).get(passwordRecoveryIntentCookie)?.value;
  if(!user||!verifyPasswordRecoveryIntent(user.id,recoveryIntent)) return NextResponse.json({message:"Odkaz pro obnovu není platný, už byl použit nebo vypršel."},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zvolte bezpečnější heslo.",issues:parsed.error.flatten().fieldErrors},{status:422});
  const response=NextResponse.json({message:"Heslo bylo bezpečně změněno.",next:"/nastaveni"},{headers:{"Cache-Control":"private, no-store"}}); const client=await authRouteClient(response); if(!client) return NextResponse.json({message:"Obnova hesla není dostupná."},{status:503});
  const {data,error}=await client.auth.updateUser({password:parsed.data.password});
  if(error||!data.user) return NextResponse.json({message:"Heslo se nepodařilo změnit nebo odkaz už byl použit."},{status:400});
  await client.auth.signOut({scope:"others"});
  const {data:profile}=await createServiceClient().from("profiles").select("role").eq("id",data.user.id).maybeSingle();
  const administrative=["faculty_editor","city_editor","admin","super_admin"].includes(String(profile?.role));
  const body=NextResponse.json({message:"Heslo bylo bezpečně změněno. Ostatní relace byly odhlášeny.",next:administrative?"/admin":"/nastaveni"},{headers:{"Cache-Control":"private, no-store"}});
  for(const cookie of response.cookies.getAll()) body.cookies.set(cookie);
  body.cookies.set(passwordRecoveryIntentCookie,"",authCookieOptions({expires:new Date(0),maxAge:0}));
  return body;
}
