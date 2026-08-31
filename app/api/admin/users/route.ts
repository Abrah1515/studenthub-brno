import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { adminInviteSchema, adminUserPatchSchema, roleScope, type AssignableAdminRole } from "@/lib/admin-role-management";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

type ServiceClient = ReturnType<typeof createServiceClient>;
async function guard() { const user = await getAdminUser(); return user?.role === "super_admin" ? user : null; }

async function validateScopeReferences(client: ServiceClient, role: AssignableAdminRole, cityId?: string | null, facultyId?: string | null) {
  if (role === "admin" || role === "city_editor") {
    const { data } = await client.from("cities").select("id").eq("id", cityId || "").maybeSingle();
    if (!data) return "Přiřazené město neexistuje.";
  }
  if (role === "faculty_editor") {
    const { data } = await client.from("faculties").select("id").eq("id", facultyId || "").maybeSingle();
    if (!data) return "Přiřazená fakulta neexistuje.";
  }
  return null;
}

export async function GET() {
  if (!await guard()) return NextResponse.json({ message: "Pouze superadministrátor." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa účtů vyžaduje Supabase." }, { status: 503 });
  const client = createServiceClient();
  const [{ data: authData, error }, { data: profiles }, { data: audit }] = await Promise.all([
    client.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    client.from("profiles").select("id,display_name,role,city_id,faculty_id,account_status").order("created_at", { ascending: false }).limit(1000),
    client.from("admin_role_audit").select("id,actor_id,target_id,previous_role,new_role,previous_city_id,new_city_id,previous_faculty_id,new_faculty_id,reason,created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) return NextResponse.json({ message: "Účty se nepodařilo načíst." }, { status: 400 });
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return NextResponse.json({
    users: authData.users.map((authUser) => {
      const profile = profileById.get(authUser.id);
      const metadata = authUser.app_metadata || {};
      return { id: authUser.id, email: authUser.email, emailConfirmedAt: authUser.email_confirmed_at, invitedAt: authUser.invited_at, lastSignInAt: authUser.last_sign_in_at, ...profile, metadataRole: metadata.role || "user", metadataCityId: metadata.city_id || null, metadataFacultyId: metadata.faculty_id || null, synchronized: Boolean(profile && profile.role === (metadata.role || "user") && (profile.city_id || null) === (metadata.city_id || null) && (profile.faculty_id || null) === (metadata.faculty_id || null)) };
    }),
    audit: audit || [],
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ message: "Pouze superadministrátor." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa účtů vyžaduje Supabase." }, { status: 503 });
  const parsed = adminInviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Neplatné údaje pozvánky." }, { status: 422 });
  const client = createServiceClient();
  const referenceError = await validateScopeReferences(client, parsed.data.role, parsed.data.cityId, parsed.data.facultyId);
  if (referenceError) return NextResponse.json({ message: referenceError }, { status: 422 });
  const scope = roleScope(parsed.data.role, parsed.data.cityId, parsed.data.facultyId);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data, error } = await client.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo: `${siteUrl}/auth/callback?next=/admin/obnova`, data: { invited_as: parsed.data.role } });
  if (error || !data.user) return NextResponse.json({ message: `Pozvánku se nepodařilo odeslat: ${error?.message || "SMTP služba požadavek odmítla."}` }, { status: 400 });
  const cleanup = async () => { await client.auth.admin.deleteUser(data.user.id); };
  const authUpdate = await client.auth.admin.updateUserById(data.user.id, { app_metadata: { ...data.user.app_metadata, ...scope } });
  if (authUpdate.error) { await cleanup(); return NextResponse.json({ message: "Pozvánka nebyla aktivována, protože se nepodařilo uložit serverovou roli." }, { status: 422 }); }
  const { error: profileError } = await client.from("profiles").upsert({ id: data.user.id, display_name: parsed.data.email.split("@")[0], ...scope }, { onConflict: "id" });
  if (profileError) { await cleanup(); return NextResponse.json({ message: "Pozvánka byla bezpečně zrušena, protože se nepodařilo synchronizovat profil." }, { status: 422 }); }
  const { error: auditError } = await client.from("admin_role_audit").insert({ actor_id: actor.id, target_id: data.user.id, previous_role: "user", new_role: scope.role, previous_city_id: null, new_city_id: scope.city_id, previous_faculty_id: null, new_faculty_id: scope.faculty_id, reason: "Pozvánka administrátora" });
  if (auditError) { await cleanup(); return NextResponse.json({ message: "Pozvánka byla bezpečně zrušena, protože se nepodařilo vytvořit auditní záznam." }, { status: 422 }); }
  return NextResponse.json({ message: "SMTP služba přijala požadavek na administrátorskou pozvánku." }, { status: 201 });
}

export async function PATCH(request: Request) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ message: "Pouze superadministrátor." }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa účtů vyžaduje Supabase." }, { status: 503 });
  const parsed = adminUserPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Neplatná změna účtu." }, { status: 422 });
  const client = createServiceClient();
  const { data: targetAuth, error: targetAuthError } = await client.auth.admin.getUserById(parsed.data.id);
  if (targetAuthError || !targetAuth.user) return NextResponse.json({ message: "Účet nebyl nalezen." }, { status: 404 });
  if (parsed.data.action === "recovery") {
    if (targetAuth.user.email?.toLowerCase() !== parsed.data.email.toLowerCase()) return NextResponse.json({ message: "E-mail neodpovídá vybranému účtu." }, { status: 422 });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { error } = await client.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${siteUrl}/auth/callback?next=/admin/obnova` });
    return error ? NextResponse.json({ message: `Obnovu se nepodařilo odeslat: ${error.message}` }, { status: 400 }) : NextResponse.json({ message: "SMTP služba přijala požadavek na obnovu přístupu." });
  }
  const referenceError = await validateScopeReferences(client, parsed.data.role, parsed.data.cityId, parsed.data.facultyId);
  if (referenceError) return NextResponse.json({ message: referenceError }, { status: 422 });
  const { data: profile, error: profileError } = await client.from("profiles").select("id,role,city_id,faculty_id").eq("id", parsed.data.id).single();
  if (profileError || !profile) return NextResponse.json({ message: "Profil účtu nebyl nalezen." }, { status: 404 });
  if (profile.role === "super_admin" || targetAuth.user.app_metadata?.role === "super_admin") return NextResponse.json({ message: "Jediného superadministrátora nelze touto operací změnit ani degradovat." }, { status: 409 });
  const next = roleScope(parsed.data.role, parsed.data.cityId, parsed.data.facultyId);
  const previous = { role: String(profile.role || "user"), city_id: profile.city_id || null, faculty_id: profile.faculty_id || null };
  const profileUpdate = await client.from("profiles").update(next).eq("id", parsed.data.id).select("id").single();
  if (profileUpdate.error) return NextResponse.json({ message: "Profilovou roli se nepodařilo bezpečně změnit." }, { status: 422 });
  const previousMetadata = targetAuth.user.app_metadata || {};
  const authUpdate = await client.auth.admin.updateUserById(parsed.data.id, { app_metadata: { ...previousMetadata, ...next } });
  if (authUpdate.error) {
    await client.from("profiles").update(previous).eq("id", parsed.data.id);
    return NextResponse.json({ message: "Změna byla vrácena, protože Auth metadata nešlo synchronizovat." }, { status: 422 });
  }
  const auditInsert = await client.from("admin_role_audit").insert({ actor_id: actor.id, target_id: parsed.data.id, previous_role: previous.role, new_role: next.role, previous_city_id: previous.city_id, new_city_id: next.city_id, previous_faculty_id: previous.faculty_id, new_faculty_id: next.faculty_id, reason: parsed.data.reason });
  if (auditInsert.error) {
    await Promise.all([client.from("profiles").update(previous).eq("id", parsed.data.id), client.auth.admin.updateUserById(parsed.data.id, { app_metadata: { ...previousMetadata, ...previous } })]);
    return NextResponse.json({ message: "Změna byla vrácena, protože se nepodařilo zapsat audit." }, { status: 422 });
  }
  return NextResponse.json({ message: "Role, rozsah a Auth metadata byly synchronně aktualizovány." });
}
