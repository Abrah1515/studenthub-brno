import { NextResponse } from "next/server";
import { z } from "zod";
import { accountEmailSchema } from "@/lib/schemas";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";
import { authRouteClient } from "@/lib/auth-route-client";

const schema=z.object({email:accountEmailSchema});
export async function POST(request:Request){
  if(!allowRequest(`account-recover:${requestFingerprint(request)}`,5,60*60*1000)) return NextResponse.json({message:"Pokud účet existuje, instrukce budou doručeny později."});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Pokud účet existuje, poslali jsme instrukce k obnově."});
  const response=NextResponse.json({message:"Pokud účet existuje, poslali jsme instrukce k obnově."}); const client=await authRouteClient(response); if(!client) return response;
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,"");
  await client.auth.resetPasswordForEmail(parsed.data.email,{redirectTo:`${origin}/auth/callback?next=${encodeURIComponent("/ucet/obnova")}`}); return response;
}
