import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("regrese produkční administrace", () => {
  it("vynucuje sekci role před každou mutací obecného admin API", () => {
    const route = readFileSync("app/api/admin/content/[resource]/route.ts", "utf8");
    expect(route.match(/if \(!canUseResource\(resource, user\)\)/g)).toHaveLength(3);
    expect(route).toContain("enforceWriteScope");
  });

  it("omezuje chatové reporty a zásahy městským rozsahem", () => {
    const route = readFileSync("app/api/admin/chat/route.ts", "utf8");
    expect(route).toContain('.eq("city_id", admin.cityId');
    expect(route).toContain("conversation.city_id !== admin.cityId");
    expect(route).toContain('parsed.data.action === "suspend_profile"');
  });

  it("společné odhlášení ukončí globální Supabase relaci a smaže všechny cookie chunky", () => {
    const route = readFileSync("app/api/auth/logout/route.ts", "utf8");
    expect(route).toContain('signOut({scope:"global"})');
    expect(route).toContain("clearSupabaseSessionCookies");
    expect(route).not.toMatch(/sh_admin|adminCookie/);
  });

  it("nepovolenou admin sekci zastaví už serverová stránka", () => {
    const page = readFileSync("app/admin/page.tsx", "utf8");
    expect(page).toContain("adminSectionAllowed(requested, user.role)");
    expect(page).toContain("notFound()");
  });

  it("záhlaví pravdivě rozlišuje všechny administrátorské role", () => {
    const dashboard = readFileSync("components/admin-dashboard.tsx", "utf8");
    for (const label of ["hlavní superadministrátor", "administrátor města", "městský editor", "fakultní editor"]) expect(dashboard).toContain(label);
  });

  it("nová migrace chrání posledního superadmina a změnu role provádí jen service role", () => {
    const migration = readFileSync("supabase/migrations/202609090035_unified_supabase_auth.sql", "utf8");
    for (const marker of ["protect_last_active_super_admin", "last_active_superadmin", "profiles_admin_scope_required", "service_role_required", "set_profile_admin_role", "delete from auth.sessions"]) expect(migration).toContain(marker);
    expect(migration).toContain("revoke all on function public.set_profile_admin_role");
  });
});
