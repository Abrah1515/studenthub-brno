import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { sourceById } from "@/lib/sources/registry";
import { syncSource } from "@/lib/sources/sync";

type Context = { params: Promise<{ id: string }> };
export async function POST(_: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const source = sourceById((await context.params).id); if (!source) return NextResponse.json({ message: "Zdroj nebyl nalezen." }, { status: 404 });
  if (user.role === "faculty_editor" && user.facultyId !== source.facultyId) return NextResponse.json({ message: "Zdroj není v rozsahu editora." }, { status: 403 });
  if (user.role !== "super_admin" && !user.cityId && user.role !== "faculty_editor") return NextResponse.json({ message: "Editor nemá přiřazené město." }, { status: 403 });
  try { return NextResponse.json(await syncSource(source.id, user.cityId || undefined)); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Synchronizace selhala." }, { status: 422 }); }
}
