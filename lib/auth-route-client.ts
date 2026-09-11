import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieOptions } from "@/lib/auth-cookies";

export function safeNextPath(value: unknown, fallback = "/brno/nastaveni") {
  if (typeof value !== "string" || value.length > 300 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://studenthub.invalid");
    return parsed.origin === "https://studenthub.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export async function authRouteClient(response: NextResponse) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url||!anon) return null;
  const store=await cookies();
  return createServerClient(url,anon,{ cookies:{ getAll:()=>store.getAll(),setAll:(values)=>values.forEach(({name,value,options})=>response.cookies.set(name,value,authCookieOptions(options))) } });
}
