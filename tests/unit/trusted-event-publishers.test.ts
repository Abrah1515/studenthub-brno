import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchesAdminProfileSearch } from "@/lib/trusted-event-publisher";

const migration = readFileSync("supabase/migrations/202608240030_trusted_event_publishers.sql", "utf8");

describe("důvěryhodní vydavatelé komunitních akcí", () => {
  it("odděluje oprávnění od role a auditovatelně omezuje správu na server", () => {
    expect(migration).toContain("permission = 'trusted_event_publisher'");
    expect(migration).toContain("p.role='user'");
    expect(migration).toContain("actor is not an active superadmin");
    expect(migration).toContain("target_profile_id=actor_profile_id");
    expect(migration).toContain("profile_permission_audit");
    expect(migration).toContain("revoke all on function public.manage_trusted_event_publisher(uuid,text,text,uuid) from public,anon,authenticated");
  });

  it("v databázi rozhoduje o zveřejnění podle aktuálního oprávnění", () => {
    expect(migration).toContain("new.status := case when public.is_trusted_event_publisher(new.author_id) then 'published' else 'pending' end");
    expect(migration).toContain("where status in ('pending','published','hidden')");
    expect(migration).toContain("event authors update own events");
    expect(migration).toContain("community event scope and provenance are immutable");
    expect(migration).toContain("revoke update on public.community_events from authenticated");
    expect(migration).not.toContain("grant update (author_id");
  });

  it("server ignoruje podvrženého autora i publikační stav", () => {
    const createRoute = readFileSync("app/api/community-events/route.ts", "utf8");
    const editRoute = readFileSync("app/api/community-events/[id]/route.ts", "utf8");
    const permissionRoute = readFileSync("app/api/admin/profile-permissions/route.ts", "utf8");
    expect(createRoute).toContain('author_id: account.id');
    expect(createRoute).toContain('account.trustedEventPublisher ? "published" : "pending"');
    expect(editRoute).toContain("row.author_id === account.id");
    expect(editRoute).toContain('!managed.account.trustedEventPublisher');
    expect(permissionRoute).toContain('admin?.role !== "super_admin"');
    expect(permissionRoute).toContain('profileId === admin.id');
  });

  it("superadmin vyhledá profil podle username, jména i neveřejného e-mailu", () => {
    const profile = { username: "spolek_fi", display_name: "Klub FI", email: "organizator@example.cz" };
    expect(matchesAdminProfileSearch(profile, "SPOLEK")).toBe(true);
    expect(matchesAdminProfileSearch(profile, "klub fi")).toBe(true);
    expect(matchesAdminProfileSearch(profile, "organizator@")).toBe(true);
    expect(matchesAdminProfileSearch(profile, "fekt")).toBe(false);
  });
});

describe("odstranění veřejné sekce Pro spolky", () => {
  it("neponechává veřejný formulář ani jeho API", () => {
    expect(existsSync("components/content-submission-form.tsx")).toBe(false);
    expect(existsSync("app/api/submissions/route.ts")).toBe(false);
    expect(readFileSync("app/navrhnout-obsah/page.tsx", "utf8")).toContain('permanentRedirect("/kontakt")');
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain('pathname === "/navrhnout-obsah"');
    expect(proxy).toContain("NextResponse.redirect(contactUrl, 308)");
  });

  it("odstraňuje odkazy z navigace a školního rozcestníku, ale ponechává neveřejný archiv", () => {
    expect(readFileSync("components/site-shell.tsx", "utf8")).not.toMatch(/Pro spolky|navrhnout-obsah/);
    expect(readFileSync("components/school-hub.tsx", "utf8")).not.toMatch(/spolek|Navrhnout obsah|navrhnout-obsah/i);
    const admin = readFileSync("components/admin-dashboard.tsx", "utf8");
    expect(admin).toContain("Archiv starších návrhů");
    expect(admin).toContain("data.submissions");
    expect(migration).not.toMatch(/delete\s+from\s+public\.submissions/i);
  });
});
