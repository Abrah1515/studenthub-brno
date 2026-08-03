import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const COOKIE_NAME = "sh_admin";

function cookieSecret() {
  if (process.env.ADMIN_COOKIE_SECRET) return process.env.ADMIN_COOKIE_SECRET;
  return "";
}

export function makeDemoAdminToken() {
  return createHmac("sha256", cookieSecret()).update("studenthub-admin").digest("hex");
}

function validDemoToken(value?: string) {
  const secret = cookieSecret();
  if (!secret || !value) return false;
  const expected = makeDemoAdminToken();
  try { return timingSafeEqual(Buffer.from(value), Buffer.from(expected)); } catch { return false; }
}

export async function getAdminUser() {
  const cookieStore = await cookies();
  const localMode = process.env.DEMO_MODE === "true" && process.env.ALLOW_LOCAL_FILE_STORE === "true";
  if (localMode && validDemoToken(cookieStore.get(COOKIE_NAME)?.value)) return { id: "local-admin", email: "lokalni-admin", mode: "local" as const, role: "admin", cityId: "brno", facultyId: null as string | null };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const supabase = createServerClient(url, anon, { cookies: { getAll: () => cookieStore.getAll(), setAll: () => undefined } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const role = user.app_metadata?.role;
  if (!["super_admin", "admin", "city_editor", "faculty_editor"].includes(String(role))) return null;
  return { id: user.id, email: user.email || "admin", mode: "supabase" as const, role: String(role) as "super_admin" | "admin" | "city_editor" | "faculty_editor", cityId: typeof user.app_metadata?.city_id === "string" ? user.app_metadata.city_id : null, facultyId: typeof user.app_metadata?.faculty_id === "string" ? user.app_metadata.faculty_id : null };
}

export const adminCookie = { name: COOKIE_NAME, options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 } };
