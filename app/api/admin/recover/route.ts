import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(254) });
const genericMessage = "Pokud účet existuje, poslali jsme na jeho adresu pokyny pro obnovu přístupu.";

export async function POST(request: Request) {
  if (!allowRequest(`admin-recovery:${requestFingerprint(request)}`, 3, 60 * 60 * 1000)) return NextResponse.json({ message: genericMessage }, { status: 202 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zadejte platný e-mail." }, { status: 422 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    try { await createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } }).auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${siteUrl}/auth/callback?next=/admin/obnova` }); } catch { /* Stejná odpověď chrání existenci účtu i při výpadku poskytovatele. */ }
  }
  return NextResponse.json({ message: genericMessage }, { status: 202 });
}
