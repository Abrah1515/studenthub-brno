import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { sourceById } from "@/lib/sources/registry";
import { syncSource } from "@/lib/sources/sync";

type Context = { params: Promise<{ id: string }> };
export async function POST(_: Request, context: Context) {
  const user = await getAdminUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ message: "Ruční synchronizaci může spustit pouze hlavní administrátor." }, { status: 403 });
  const source = sourceById((await context.params).id); if (!source) return NextResponse.json({ message: "Zdroj nebyl nalezen." }, { status: 404 });
  try { return NextResponse.json(await syncSource(source.id, user.cityId || undefined)); } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Synchronizace selhala." }, { status: 422 }); }
}
