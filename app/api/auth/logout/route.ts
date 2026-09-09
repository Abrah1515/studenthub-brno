import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieOptions, clearSupabaseSessionCookies } from "@/lib/auth-cookies";
import { passwordRecoveryIntentCookie } from "@/lib/password-recovery-intent";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const response = NextResponse.json({ ok: true });
  const store = await cookies(); const values=store.getAll();
  response.cookies.set(passwordRecoveryIntentCookie,"",authCookieOptions({expires:new Date(0),maxAge:0}));
  if (!url || !anon) { clearSupabaseSessionCookies(response,values); return response; }
  const client = createServerClient(url, anon, { cookies: { getAll: () => values, setAll: (updates) => updates.forEach(({ name, value, options }) => response.cookies.set(name, value, authCookieOptions(options))) } });
  const {error}=await client.auth.signOut({scope:"global"});
  if(error) console.error("auth_logout_failed",{code:error.code||"unknown",status:error.status||0});
  clearSupabaseSessionCookies(response,values);
  return response;
}
