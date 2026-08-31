import { z } from "zod";

export const assignableAdminRoleSchema = z.enum(["user", "admin", "city_editor", "faculty_editor"]);
export type AssignableAdminRole = z.infer<typeof assignableAdminRoleSchema>;

const scopeFields = {
  role: assignableAdminRoleSchema,
  cityId: z.string().trim().min(1).max(80).nullable().optional(),
  facultyId: z.string().trim().min(1).max(80).nullable().optional(),
};

export const adminInviteSchema = z.object({
  email: z.string().trim().email(),
  ...scopeFields,
}).refine((value) => value.role !== "user", { message: "Běžný účet se vytváří veřejnou registrací.", path: ["role"] }).superRefine(validateRoleScope);

export const adminRoleUpdateSchema = z.object({
  id: z.string().uuid(),
  action: z.literal("update"),
  reason: z.string().trim().min(3).max(500),
  ...scopeFields,
}).superRefine(validateRoleScope);

export const adminRecoverySchema = z.object({
  id: z.string().uuid(),
  action: z.literal("recovery"),
  email: z.string().trim().email(),
});

export const adminUserPatchSchema = z.discriminatedUnion("action", [adminRoleUpdateSchema, adminRecoverySchema]);

function validateRoleScope(value: { role: AssignableAdminRole; cityId?: string | null; facultyId?: string | null }, context: z.RefinementCtx) {
  const cityId = value.cityId || null;
  const facultyId = value.facultyId || null;
  if (["admin", "city_editor"].includes(value.role)) {
    if (!cityId) context.addIssue({ code: "custom", message: "Městská role vyžaduje město.", path: ["cityId"] });
    if (facultyId) context.addIssue({ code: "custom", message: "Městská role nesmí mít fakultní rozsah.", path: ["facultyId"] });
  } else if (value.role === "faculty_editor") {
    if (!facultyId) context.addIssue({ code: "custom", message: "Fakultní role vyžaduje fakultu.", path: ["facultyId"] });
    if (cityId) context.addIssue({ code: "custom", message: "Fakultní role používá pouze fakultní rozsah.", path: ["cityId"] });
  } else if (cityId || facultyId) context.addIssue({ code: "custom", message: "Běžný účet nesmí mít administrátorský rozsah.", path: ["role"] });
}

export function roleScope(role: AssignableAdminRole, cityId?: string | null, facultyId?: string | null) {
  return {
    role,
    city_id: role === "admin" || role === "city_editor" ? cityId || null : null,
    faculty_id: role === "faculty_editor" ? facultyId || null : null,
  };
}
