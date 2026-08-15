import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { sourceById } from "@/lib/sources/registry";
import { updateRecord } from "@/lib/data-store";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

async function canManageSource(user: NonNullable<Awaited<ReturnType<typeof getAdminUser>>>, source: NonNullable<ReturnType<typeof sourceById>>) {
  if (user.role === "super_admin") return true;
  if (user.role === "faculty_editor") return Boolean(user.facultyId) && user.facultyId === source.facultyId;
  if (!user.cityId) return false;
  if (source.cityId) return source.cityId === user.cityId;
  if (!source.universityId) return false;
  if (!isSupabaseConfigured()) return user.mode === "local" && user.cityId === "brno";
  const { data } = await createServiceClient().from("university_cities").select("university_id").eq("university_id", source.universityId).eq("city_id", user.cityId).maybeSingle();
  return Boolean(data);
}

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const source = sourceById((await context.params).id); if (!source) return NextResponse.json({ message: "Zdroj nebyl nalezen." }, { status: 404 });
  if (!await canManageSource(user, source)) return NextResponse.json({ message: "Zdroj není v rozsahu editora." }, { status: 403 });
  const body = await request.json() as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") return NextResponse.json({ message: "Neplatná hodnota." }, { status: 422 });
  try { return NextResponse.json(await updateRecord("content_sources", source.id, { enabled: body.enabled, sync_status: body.enabled ? "idle" : "manual_review" })); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Změnu se nepodařilo uložit." }, { status: 422 }); }
}
