import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { sourceById } from "@/lib/sources/registry";
import { updateRecord } from "@/lib/data-store";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const source = sourceById((await context.params).id); if (!source) return NextResponse.json({ message: "Zdroj nebyl nalezen." }, { status: 404 });
  if (!["admin", "city_editor", "super_admin"].includes(user.role) && user.facultyId !== source.facultyId) return NextResponse.json({ message: "Zdroj není v rozsahu editora." }, { status: 403 });
  const body = await request.json() as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") return NextResponse.json({ message: "Neplatná hodnota." }, { status: 422 });
  try { return NextResponse.json(await updateRecord("content_sources", source.id, { enabled: body.enabled, sync_status: body.enabled ? "idle" : "manual_review" })); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Změnu se nepodařilo uložit." }, { status: 422 }); }
}
