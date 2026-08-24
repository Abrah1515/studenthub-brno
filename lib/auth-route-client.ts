import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export function safeNextPath(value: unknown, fallback = "/nastaveni") { return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && value.length <= 300 ? value : fallback; }

export async function authRouteClient(response: NextResponse) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url||!anon) return null;
  const store=await cookies();
  return createServerClient(url,anon,{ cookies:{ getAll:()=>store.getAll(),setAll:(values)=>values.forEach(({name,value,options})=>response.cookies.set(name,value,options)) } });
}
