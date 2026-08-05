import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const source = new URL(request.url); const code = source.searchParams.get("code"); const requested = source.searchParams.get("next") || "/partak"; const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/partak";
  const response = NextResponse.redirect(new URL(next, source.origin));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !url || !anon) return NextResponse.redirect(new URL("/ucet/prihlaseni?error=callback", source.origin));
  const cookieStore = await cookies();
  const client = createServerClient(url, anon, { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { error } = await client.auth.exchangeCodeForSession(code);
  return error ? NextResponse.redirect(new URL("/ucet/prihlaseni?error=callback", source.origin)) : response;
}
