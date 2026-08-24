import { NextResponse } from "next/server";
import { z } from "zod";
import { accountEmailSchema,accountPasswordSchema } from "@/lib/schemas";
import { authRouteClient,safeNextPath } from "@/lib/auth-route-client";
import { isAccountExistenceError, pendingConfirmationMessage, publicAuthEmailError, reportAuthEmailFailure } from "@/lib/auth-email";
import { allowAuthRequest } from "@/lib/auth-rate-limit";

const schema=z.object({email:accountEmailSchema,password:accountPasswordSchema,next:z.string().optional()});
export async function POST(request:Request){
  if(!await allowAuthRequest(request,"signup",5,60*60)) return NextResponse.json({message:"Příliš mnoho pokusů. Zkuste to později."},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success) return NextResponse.json({message:"Zkontrolujte e-mail a heslo.",issues:parsed.error.flatten().fieldErrors},{status:422});
  const response=NextResponse.json({message:pendingConfirmationMessage,requiresEmailConfirmation:true,deliveryRequested:true},{status:201}); const client=await authRouteClient(response); if(!client) return NextResponse.json({message:"Registrace bude dostupná po připojení Supabase."},{status:503});
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,""); const next=safeNextPath(parsed.data.next);
  const {data,error}=await client.auth.signUp({email:parsed.data.email,password:parsed.data.password,options:{emailRedirectTo:`${origin}/auth/callback?next=${encodeURIComponent(next)}`}});
  if(error){
    if(isAccountExistenceError(error)) return NextResponse.json({message:pendingConfirmationMessage,requiresEmailConfirmation:true,deliveryRequested:false},{status:202});
    reportAuthEmailFailure("signup",error);
    const failure=publicAuthEmailError(error);
    return NextResponse.json({message:failure.message},{status:failure.status});
  }
  if(data.session) { const signedIn=NextResponse.json({message:"Účet je vytvořený a přihlášený.",requiresEmailConfirmation:false,next},{status:201}); for(const cookie of response.cookies.getAll()) signedIn.cookies.set(cookie); return signedIn; }
  return response;
}
