import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { adminUserPatchSchema, roleScope, type AssignableAdminRole } from "@/lib/admin-role-management";
import { allowAuthRequest } from "@/lib/auth-rate-limit";
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
    client.from("profiles").select("id,username,display_name,role,city_id,faculty_id,account_status,is_blocked,created_at").order("created_at", { ascending: false }).limit(1000),
    client.from("admin_role_audit").select("id,actor_id,target_id,previous_role,new_role,previous_city_id,new_city_id,previous_faculty_id,new_faculty_id,reason,created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  if (error) return NextResponse.json({ message: "Účty se nepodařilo načíst." }, { status: 400 });
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return NextResponse.json({
    users: authData.users.map((authUser) => {
      const profile = profileById.get(authUser.id);
      const metadata = authUser.app_metadata || {};
      return {
        id: authUser.id,
        email: authUser.email,
        emailConfirmedAt: authUser.email_confirmed_at,
        lastSignInAt: authUser.last_sign_in_at,
        ...profile,
        metadataRole: metadata.role || "user",
        metadataDerivedCopyInSync: Boolean(profile && profile.role === (metadata.role || "user") && (profile.city_id || null) === (metadata.city_id || null) && (profile.faculty_id || null) === (metadata.faculty_id || null)),
      };
    }),
    audit: audit || [],
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  return NextResponse.json({ message: "Správce se nejprve registruje jako běžný uživatel. Roli lze přidělit pouze existujícímu potvrzenému profilu." }, { status: 405, headers: { Allow: "GET, PATCH" } });
}

export async function PATCH(request: Request) {
  const actor = await guard();
  if (!actor) return NextResponse.json({ message: "Pouze superadministrátor." }, { status: 403 });
  if (!await allowAuthRequest(request, "admin-role-change", 30, 60 * 60)) return NextResponse.json({ message: "Limit změn rolí byl dočasně vyčerpán." }, { status: 429 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Správa účtů vyžaduje Supabase." }, { status: 503 });
  const parsed = adminUserPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "Neplatná změna účtu." }, { status: 422 });
  const client = createServiceClient();
  const { data: targetAuth, error: targetAuthError } = await client.auth.admin.getUserById(parsed.data.id);
  if (targetAuthError || !targetAuth.user) return NextResponse.json({ message: "Účet nebyl nalezen." }, { status: 404 });
  if (!targetAuth.user.email_confirmed_at) return NextResponse.json({ message: "Roli lze přidělit pouze účtu s potvrzeným e-mailem." }, { status: 409 });
  const referenceError = await validateScopeReferences(client, parsed.data.role, parsed.data.cityId, parsed.data.facultyId);
  if (referenceError) return NextResponse.json({ message: referenceError }, { status: 422 });
  const next = roleScope(parsed.data.role, parsed.data.cityId, parsed.data.facultyId);
  const { data: changed, error } = await client.rpc("set_profile_admin_role", {
    p_actor_id: actor.id,
    p_target_id: parsed.data.id,
    p_role: next.role,
    p_city_id: next.city_id,
    p_faculty_id: next.faculty_id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const known = error.message.includes("last_active_superadmin") ? "Poslednímu aktivnímu superadministrátorovi nelze roli odebrat." : error.message.includes("confirmed_account_required") ? "Roli lze přidělit pouze potvrzenému účtu." : error.message.includes("invalid_role_scope") ? "Rozsah role není platný." : "Roli se nepodařilo bezpečně změnit.";
    return NextResponse.json({ message: known }, { status: error.message.includes("last_active_superadmin") ? 409 : 422 });
  }
  const applied = changed && typeof changed === "object" ? changed as { role?: string; city_id?: string | null; faculty_id?: string | null } : next;
  const metadata = targetAuth.user.app_metadata || {};
  const derived = await client.auth.admin.updateUserById(parsed.data.id, { app_metadata: { ...metadata, role: applied.role || next.role, city_id: applied.city_id || null, faculty_id: applied.faculty_id || null } });
  if (derived.error) console.error("auth_role_metadata_copy_failed", { code: derived.error.code || "unknown", status: derived.error.status || 0 });
  return NextResponse.json({ message: "Databázová role byla změněna a aktivní relace účtu byly ukončeny.", metadataCopyUpdated: !derived.error });
}
