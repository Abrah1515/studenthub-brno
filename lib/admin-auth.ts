import "server-only";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/user-auth";

export const administrativeRoles = ["faculty_editor", "city_editor", "admin", "super_admin"] as const;
export type AdministrativeRole = (typeof administrativeRoles)[number];

export async function getAdminUser() {
  const user = await getCurrentUser();
  if (!user || !isSupabaseConfigured()) return null;
  const { data: profile, error } = await createServiceClient().from("profiles").select("role,city_id,faculty_id,account_status,is_blocked").eq("id", user.id).single();
  const role = String(profile?.role || "");
  if (error || !profile || profile.account_status !== "active" || profile.is_blocked || !administrativeRoles.includes(role as AdministrativeRole)) return null;
  if ((role === "admin" || role === "city_editor") && !profile.city_id) return null;
  if (role === "faculty_editor" && !profile.faculty_id) return null;
  return { id: user.id, email: user.email || "admin", mode: "supabase" as const, role: role as AdministrativeRole, cityId: profile.city_id || null, facultyId: profile.faculty_id || null };
}
