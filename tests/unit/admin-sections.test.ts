import { describe, expect, it } from "vitest";
import { adminSectionAllowed, adminSectionsForRole, isAdminSection } from "@/lib/admin-sections";

describe("rozsah sekcí administrace", () => {
  it("neumožní neznámý hluboký odkaz", () => { expect(isAdminSection("tajna-sekce")).toBe(false); expect(isAdminSection("community_events")).toBe(true); });
  it("fakultní editor nevidí soukromé městské inboxy, účty ani analytiku", () => { const sections = adminSectionsForRole("faculty_editor"); expect(sections).toContain("academic_events"); expect(sections).toContain("source_review_queue"); expect(sections).not.toContain("community_events"); expect(sections).not.toContain("community_forum"); expect(sections).not.toContain("service_requests"); expect(sections).not.toContain("contact_messages"); expect(sections).not.toContain("analytics"); expect(adminSectionAllowed("admin_users", "faculty_editor")).toBe(false); });
  it("městský správce vidí samostatný hluboký odkaz komunity", () => { expect(isAdminSection("community_forum")).toBe(true); expect(adminSectionsForRole("admin")).toContain("community_forum"); });
  it("správu účtů dovolí pouze hlavnímu superadminovi", () => { expect(adminSectionAllowed("admin_users", "super_admin")).toBe(true); expect(adminSectionAllowed("admin_users", "admin")).toBe(false); expect(adminSectionAllowed("admin_users", "city_editor")).toBe(false); });
});
