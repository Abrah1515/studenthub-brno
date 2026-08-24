import { NextResponse } from "next/server";
import { z } from "zod";
import { accountEmailSchema,accountPasswordSchema } from "@/lib/schemas";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";
import { authRouteClient,safeNextPath } from "@/lib/auth-route-client";

const schema=z.object({email:accountEmailSchema,password:accountPasswordSchema,next:z.string().optional()});
export async function POST(request:Request){
  if(!allowRequest(`account-signup:${requestFingerprint(request)}`,5,60*60*1000)) return NextResponse.json({message:"Příliš mnoho pokusů. Zkuste to později."},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zkontrolujte e-mail a heslo.",issues:parsed.error.flatten().fieldErrors},{status:422});
  const response=NextResponse.json({message:"Účet byl vytvořen. Potvrďte e-mail odkazem, který jsme právě poslali.",requiresEmailConfirmation:true},{status:201}); const client=await authRouteClient(response); if(!client) return NextResponse.json({message:"Registrace bude dostupná po připojení Supabase."},{status:503});
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,""); const next=safeNextPath(parsed.data.next);
  const {data,error}=await client.auth.signUp({email:parsed.data.email,password:parsed.data.password,options:{emailRedirectTo:`${origin}/auth/callback?next=${encodeURIComponent(next)}`}});
  if(error) return NextResponse.json({message:error.message.includes("already")?"Pokud účet existuje, použijte přihlášení nebo obnovu hesla.":"Účet se nepodařilo vytvořit."},{status:400});
  if(data.session) { const signedIn=NextResponse.json({message:"Účet je vytvořený a přihlášený.",requiresEmailConfirmation:false,next},{status:201}); for(const cookie of response.cookies.getAll()) signedIn.cookies.set(cookie); return signedIn; }
  return response;
}
