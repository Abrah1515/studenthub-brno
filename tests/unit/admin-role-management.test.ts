import { describe, expect, it } from "vitest";
import { adminRoleUpdateSchema, roleScope } from "@/lib/admin-role-management";

describe("správa administrátorských rolí", () => {
  it("vyžaduje město pro městské role a zakáže podvrženou fakultu", () => {
    expect(adminRoleUpdateSchema.safeParse({ id: crypto.randomUUID(), action: "update", role: "admin", cityId: null, facultyId: null, reason: "test" }).success).toBe(false);
    expect(adminRoleUpdateSchema.safeParse({ id: crypto.randomUUID(), action: "update", role: "city_editor", cityId: "brno", facultyId: "muni-fi", reason: "test" }).success).toBe(false);
  });
  it("vyžaduje právě fakultu pro fakultního editora", () => {
    expect(adminRoleUpdateSchema.safeParse({ id: crypto.randomUUID(), action: "update", role: "faculty_editor", cityId: null, facultyId: "muni-fi", reason: "ověřený editor" }).success).toBe(true);
    expect(adminRoleUpdateSchema.safeParse({ id: crypto.randomUUID(), action: "update", role: "faculty_editor", cityId: "brno", facultyId: "muni-fi", reason: "test" }).success).toBe(false);
  });
  it("běžnému účtu i superadminovi odstraní omezený redakční rozsah", () => {
    expect(roleScope("user", "brno", "muni-fi")).toEqual({ role: "user", city_id: null, faculty_id: null });
    expect(roleScope("super_admin", "brno", "muni-fi")).toEqual({ role: "super_admin", city_id: null, faculty_id: null });
    expect(adminRoleUpdateSchema.safeParse({ id: crypto.randomUUID(), action: "update", role: "super_admin", cityId: null, facultyId: null, reason: "Druhý správce" }).success).toBe(true);
  });
});
