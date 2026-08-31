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

  it("odhlášení ukončí Supabase relaci a smaže i starý lokální cookie", () => {
    const route = readFileSync("app/api/admin/logout/route.ts", "utf8");
    expect(route).toContain("createServerClient");
    expect(route).toContain('supabase.auth.signOut({ scope: "local" })');
    expect(route).toContain("adminCookie.name");
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

  it("migrace chrání jediného superadmina, citlivá městská data a městský chat", () => {
    const migration = readFileSync("supabase/migrations/202608310033_admin_role_scope_hardening.sql", "utf8");
    for (const marker of ["profiles_single_super_admin_idx", "cannot_demote_only_superadmin", "profiles_admin_scope_required", "can_manage_sensitive_city", "chat_conversations alter column city_id set not null", "scoped moderators read chat action audit"]) expect(migration).toContain(marker);
  });
});
