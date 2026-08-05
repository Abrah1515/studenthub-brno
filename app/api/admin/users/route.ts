import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

const role = z.enum(["admin", "city_editor", "faculty_editor"]);
const inviteSchema = z.object({ email: z.string().email(), role, cityId: z.string().max(80).nullable().optional(), facultyId: z.string().max(80).nullable().optional() });
const updateSchema = z.object({ id: z.string().uuid(), role, cityId: z.string().max(80).nullable().optional(), facultyId: z.string().max(80).nullable().optional(), action: z.enum(["update", "recovery"]).default("update"), email: z.string().email().optional() });

async function guard() { const user = await getAdminUser(); return user?.role === "super_admin" ? user : null; }
export async function GET() {
  if (!await guard()) return NextResponse.json({ message: "Pouze superadministrátor." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa účtů vyžaduje Supabase." }, { status: 503 });
  const client = createServiceClient(); const [{ data: authData, error }, { data: profiles }] = await Promise.all([client.auth.admin.listUsers({ page: 1, perPage: 200 }), client.from("profiles").select("id,display_name,role,city_id,faculty_id")]);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 }); const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return NextResponse.json({ users: authData.users.filter((user) => ["admin", "city_editor", "faculty_editor", "super_admin"].includes(String(user.app_metadata?.role))).map((user) => ({ id: user.id, email: user.email, invitedAt: user.invited_at, lastSignInAt: user.last_sign_in_at, ...profileById.get(user.id) })) });
}
export async function POST(request: Request) {
  if (!await guard()) return NextResponse.json({ message: "Pouze superadministrátor." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa účtů vyžaduje Supabase." }, { status: 503 });
  const parsed = inviteSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatné údaje pozvánky." }, { status: 422 });
  const client = createServiceClient(); const appMetadata = { role: parsed.data.role, city_id: parsed.data.cityId || null, faculty_id: parsed.data.facultyId || null };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data, error } = await client.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo: `${siteUrl}/auth/callback?next=/admin/obnova`, data: { invited_as: parsed.data.role } });
  if (error || !data.user) return NextResponse.json({ message: error?.message || "Pozvánku se nepodařilo vytvořit." }, { status: 400 });
  await client.auth.admin.updateUserById(data.user.id, { app_metadata: appMetadata });
  const { error: profileError } = await client.from("profiles").upsert({ id: data.user.id, display_name: parsed.data.email.split("@")[0], ...appMetadata }, { onConflict: "id" });
  if (profileError) return NextResponse.json({ message: profileError.message }, { status: 400 }); return NextResponse.json({ message: "Pozvánka byla odeslána." }, { status: 201 });
}
export async function PATCH(request: Request) {
  if (!await guard()) return NextResponse.json({ message: "Pouze superadministrátor." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa účtů vyžaduje Supabase." }, { status: 503 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatná změna účtu." }, { status: 422 }); const client = createServiceClient();
  if (parsed.data.action === "recovery") { if (!parsed.data.email) return NextResponse.json({ message: "Chybí e-mail." }, { status: 422 }); const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin; const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${siteUrl}/auth/callback?next=/admin/obnova` }); return error ? NextResponse.json({ message: error.message }, { status: 400 }) : NextResponse.json({ message: "E-mail pro obnovu přístupu byl odeslán." }); }
  const appMetadata = { role: parsed.data.role, city_id: parsed.data.cityId || null, faculty_id: parsed.data.facultyId || null }; const { error } = await client.auth.admin.updateUserById(parsed.data.id, { app_metadata: appMetadata }); if (error) return NextResponse.json({ message: error.message }, { status: 400 }); const { error: profileError } = await client.from("profiles").update(appMetadata).eq("id", parsed.data.id); return profileError ? NextResponse.json({ message: profileError.message }, { status: 400 }) : NextResponse.json({ message: "Role a rozsah byly aktualizovány." });
}
