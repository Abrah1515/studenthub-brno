import { NextResponse } from "next/server";
import { z } from "zod";
import { authRouteClient,safeNextPath } from "@/lib/auth-route-client";
import { allowRequest,requestFingerprint } from "@/lib/rate-limit";

const schema=z.object({next:z.string().optional()});
export async function POST(request:Request){
  if(process.env.GOOGLE_AUTH_ENABLED!=="true") return NextResponse.json({message:"Google přihlášení zatím není v produkci nakonfigurované."},{status:503});
  if(!allowRequest(`account-google:${requestFingerprint(request)}`,10,60*60*1000)) return NextResponse.json({message:"Příliš mnoho pokusů."},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>({}))); if(!parsed.success) return NextResponse.json({message:"Neplatná návratová adresa."},{status:422});
  const response=NextResponse.json({}); const client=await authRouteClient(response); if(!client) return NextResponse.json({message:"Přihlášení není nakonfigurované."},{status:503});
  const origin=(process.env.NEXT_PUBLIC_SITE_URL||new URL(request.url).origin).replace(/\/$/,""); const next=safeNextPath(parsed.data.next);
  const {data,error}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:`${origin}/auth/callback?next=${encodeURIComponent(next)}`,skipBrowserRedirect:true}});
  if(error||!data.url) return NextResponse.json({message:"Google přihlášení se nepodařilo spustit."},{status:502});
  return NextResponse.json({url:data.url});
}
