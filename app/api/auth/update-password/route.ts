import { NextResponse } from "next/server";
import { z } from "zod";
import { accountPasswordSchema } from "@/lib/schemas";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";
import { authRouteClient } from "@/lib/auth-route-client";
import { getCurrentUser } from "@/lib/user-auth";

const schema=z.object({password:accountPasswordSchema});
export async function POST(request:Request){
  if(!allowRequest(`account-password-update:${requestFingerprint(request)}`,5,60*60*1000)) return NextResponse.json({message:"Příliš mnoho pokusů."},{status:429});
  if(!await getCurrentUser()) return NextResponse.json({message:"Odkaz pro obnovu není platný nebo vypršel."},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zvolte bezpečnější heslo.",issues:parsed.error.flatten().fieldErrors},{status:422});
  const response=NextResponse.json({message:"Heslo bylo bezpečně změněno."}); const client=await authRouteClient(response); if(!client) return NextResponse.json({message:"Obnova hesla není dostupná."},{status:503});
  const {error}=await client.auth.updateUser({password:parsed.data.password}); return error?NextResponse.json({message:"Heslo se nepodařilo změnit."},{status:400}):response;
}
