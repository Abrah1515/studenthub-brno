import { NextResponse } from "next/server";
import { z } from "zod";
import { authRouteClient,safeNextPath } from "@/lib/auth-route-client";
import { allowAuthRequest } from "@/lib/auth-rate-limit";
import { googleAuthConfigured } from "@/lib/auth-providers";

const schema=z.object({next:z.string().optional()});

export async function POST(request:Request){
  if(!await googleAuthConfigured()) return NextResponse.json({message:"Tato přihlašovací metoda není dostupná."},{status:503});
  if(!await allowAuthRequest(request,"google",10,60*60)) return NextResponse.json({message:"Příliš mnoho pokusů. Zkuste to později."},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>({})));
  if(!parsed.success) return NextResponse.json({message:"Neplatná návratová adresa."},{status:422});
  const response=NextResponse.json({});
  const client=await authRouteClient(response);
  if(!client) return NextResponse.json({message:"Přihlášení není nakonfigurované."},{status:503});
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,"");
  const next=safeNextPath(parsed.data.next);
  const {data,error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${origin}/auth/callback?next=${encodeURIComponent(next)}`,skipBrowserRedirect:true}});
  if(error||!data.url) return NextResponse.json({message:"Google přihlášení se nepodařilo spustit."},{status:502});
  return NextResponse.json({url:data.url});
}
