import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const response = NextResponse.json({ ok: true });
  if (!url || !anon) return response;
  const store = await cookies(); const client = createServerClient(url, anon, { cookies: { getAll: () => store.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  await client.auth.signOut(); return response;
}
