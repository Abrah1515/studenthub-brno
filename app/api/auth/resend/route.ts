import { NextResponse } from "next/server";
import { z } from "zod";
import { accountEmailSchema } from "@/lib/schemas";
import { authRouteClient,safeNextPath } from "@/lib/auth-route-client";
import { neutralResendMessage, publicAuthEmailError, reportAuthEmailFailure } from "@/lib/auth-email";
import { allowAuthRequest } from "@/lib/auth-rate-limit";

const schema=z.object({email:accountEmailSchema,next:z.string().optional()});

export async function POST(request:Request){
  if(!await allowAuthRequest(request,"resend-minute",1,60)||!await allowAuthRequest(request,"resend-hour",4,60*60)){
    return NextResponse.json({message:"Další potvrzovací e-mail lze vyžádat nejdříve za 60 sekund."},{status:429,headers:{"Retry-After":"60"}});
  }
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({message:"Zadejte platnou e-mailovou adresu."},{status:422});
  const response=NextResponse.json({message:neutralResendMessage,retryAfterSeconds:60},{status:202});
  const client=await authRouteClient(response);
  if(!client) return NextResponse.json({message:"Odesílání potvrzení není dostupné."},{status:503});
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,"");
  const next=safeNextPath(parsed.data.next);
  const {error}=await client.auth.resend({type:"signup",email:parsed.data.email,options:{emailRedirectTo:`${origin}/auth/callback?next=${encodeURIComponent(next)}`}});
  if(error){ reportAuthEmailFailure("resend",error); const failure=publicAuthEmailError(error); return NextResponse.json({message:failure.message},{status:failure.status}); }
  return response;
}
