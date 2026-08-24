import { NextResponse } from "next/server";
import { z } from "zod";
import { accountEmailSchema } from "@/lib/schemas";
import { authRouteClient } from "@/lib/auth-route-client";
import { publicAuthEmailError, reportAuthEmailFailure } from "@/lib/auth-email";
import { allowAuthRequest } from "@/lib/auth-rate-limit";

const schema=z.object({email:accountEmailSchema});
export async function POST(request:Request){
  if(!await allowAuthRequest(request,"recovery",5,60*60)) return NextResponse.json({message:"Limit požadavků byl dočasně vyčerpán. Počkejte prosím a zkuste to později."},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Pokud účet existuje, poslali jsme instrukce k obnově."});
  const response=NextResponse.json({message:"Pokud účet existuje, požadavek na obnovu jsme přijali. Zkontrolujte také Spam, Hromadné a Promo."}); const client=await authRouteClient(response); if(!client) return response;
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,"");
  const {error}=await client.auth.resetPasswordForEmail(parsed.data.email,{redirectTo:`${origin}/auth/callback?next=${encodeURIComponent("/ucet/obnova")}`});
  if(error){ reportAuthEmailFailure("recovery",error); const failure=publicAuthEmailError(error); return NextResponse.json({message:failure.message},{status:failure.status}); }
  return response;
}
