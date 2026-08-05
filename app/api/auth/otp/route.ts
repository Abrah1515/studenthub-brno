import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { z } from "zod";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().email() });
export async function POST(request: Request) {
  if (!allowRequest(`auth-otp:${requestFingerprint(request)}`, 5, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho pokusů. Zkuste to později." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zadejte platný e-mail." }, { status: 422 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ message: "Přihlášení bude dostupné po připojení Supabase." }, { status: 503 });
  const response = NextResponse.json({ message: "Ověřovací odkaz jsme poslali na zadaný e-mail." });
  const client = createServerClient(url, anon, { cookies: { getAll: () => [], setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { error } = await client.auth.signInWithOtp({ email: parsed.data.email, options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/partak` } });
  if (error) return NextResponse.json({ message: "Ověřovací odkaz se nepodařilo odeslat." }, { status: 400 });
  return response;
}
