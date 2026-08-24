import { NextResponse } from "next/server";
import { z } from "zod";
import { accountEmailSchema } from "@/lib/schemas";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";
import { authRouteClient,safeNextPath } from "@/lib/auth-route-client";

const schema=z.object({email:accountEmailSchema,password:z.string().min(1).max(128),next:z.string().optional()});
export async function POST(request:Request){
  if(!allowRequest(`account-login:${requestFingerprint(request)}`,10,60*60*1000)) return NextResponse.json({message:"Příliš mnoho pokusů. Zkuste to později."},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zadejte platný e-mail a heslo."},{status:422});
  const response=NextResponse.json({ok:true,next:safeNextPath(parsed.data.next)}); const client=await authRouteClient(response); if(!client) return NextResponse.json({message:"Přihlášení bude dostupné po připojení Supabase."},{status:503});
  const {data,error}=await client.auth.signInWithPassword({email:parsed.data.email,password:parsed.data.password});
  if(error||!data.user?.email_confirmed_at) { if(data.session) await client.auth.signOut(); return NextResponse.json({message:"E-mail, heslo nebo potvrzení e-mailu není v pořádku."},{status:401}); }
  return response;
}
