import { NextResponse } from "next/server";
import { consumeHousingLimit, removeHousingPhotos, sanitizeAndUploadHousingPhoto } from "@/lib/housing-server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
async function owned(id: string) { const account = await getCurrentAccount(); if (!account?.complete || account.accountStatus !== "active") return null; const { data } = await createServiceClient().from("housing_listings").select("id,author_id,status,listing_type").eq("id", id).eq("author_id", account.id).neq("status", "deleted").maybeSingle(); return data ? { account, row: data } : null; }

export async function POST(request: Request, context: Context) {
  const id = (await context.params).id; const owner = await owned(id); if (!owner) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const limit = await consumeHousingLimit(request, "manage_photos", 16, 3600, owner.account.id); if (limit.status !== "allowed") return NextResponse.json({ message: "Fotografie nyní nelze upravit." }, { status: limit.status === "limited" ? 429 : 503 });
  const client = createServiceClient(); const { data: current } = await client.from("housing_photos").select("id").eq("listing_id", id); const form = await request.formData().catch(() => null); const files = form?.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0) || [];
  if (!files.length || (current?.length || 0) + files.length > 8) return NextResponse.json({ message: "Inzerát může mít nejvýše osm fotografií." }, { status: 422 });
  const uploaded: Record<string, unknown>[] = [];
  try { for (let index = 0; index < files.length; index++) uploaded.push(await sanitizeAndUploadHousingPhoto(files[index], id, (current?.length || 0) + index)); const saved = await client.from("housing_photos").insert(uploaded); if (saved.error) throw saved.error; }
  catch (error) { await removeHousingPhotos(uploaded.map((photo) => photo.storage_path)); return NextResponse.json({ message: error instanceof Error ? error.message : "Fotografie se nepodařilo uložit." }, { status: 422 }); }
  return NextResponse.json({ message: "Fotografie byly přidány." }, { status: 201 });
}

export async function DELETE(request: Request, context: Context) {
  const id = (await context.params).id; const owner = await owned(id); if (!owner) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const body = await request.json().catch(() => null) as { photoId?: string } | null; const client = createServiceClient(); const { data: photo } = await client.from("housing_photos").select("id,storage_path").eq("listing_id", id).eq("id", body?.photoId || "").maybeSingle(); if (!photo) return NextResponse.json({ message: "Fotografie nebyla nalezena." }, { status: 404 });
  const { count } = await client.from("housing_photos").select("id", { count: "exact", head: true }).eq("listing_id", id); if (owner.row.status === "active" && owner.row.listing_type === "offer" && (count || 0) <= 1) return NextResponse.json({ message: "Aktivní nabídka bydlení musí mít alespoň jednu fotografii." }, { status: 409 });
  await removeHousingPhotos([photo.storage_path]); await client.from("housing_photos").delete().eq("id", photo.id).eq("listing_id", id); return new NextResponse(null, { status: 204 });
}
