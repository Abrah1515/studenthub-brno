import { NextResponse } from "next/server";
import { deleteRecord, insertRecord, listRecords } from "@/lib/data-store";
import { consumeMarketplaceLimit, removeMarketplacePhotos, sanitizeAndUploadMarketplacePhoto } from "@/lib/marketplace-server";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
async function owned(id: string) { const account = await getCurrentAccount(); if (!account?.complete || account.accountStatus !== "active") return null; const row = (await listRecords("marketplace_listings")).find((item) => String(item.id) === id && item.seller_id === account.id && item.status !== "deleted"); return row ? { account, row } : null; }

export async function POST(request: Request, context: Context) {
  const id = (await context.params).id; const owner = await owned(id); if (!owner) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const limit = await consumeMarketplaceLimit(request, "manage_photos", 12, 3600, owner.account.id); if (limit.status !== "allowed") return NextResponse.json({ message: "Fotografie nyní nelze upravit." }, { status: limit.status === "limited" ? 429 : 503 });
  const form = await request.formData().catch(() => null); const files = form?.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0) || [];
  const existing = (await listRecords("marketplace_listing_photos")).filter((photo) => photo.listing_id === id); if (!files.length || existing.length + files.length > 3) return NextResponse.json({ message: "Inzerát může mít nejvýše tři fotografie." }, { status: 422 });
  const uploaded: Record<string, unknown>[] = [];
  try { for (let index = 0; index < files.length; index++) { const photo = await sanitizeAndUploadMarketplacePhoto(files[index], id, existing.length + index); uploaded.push(photo); await insertRecord("marketplace_listing_photos", photo); } }
  catch (error) { await removeMarketplacePhotos(uploaded.map((photo) => photo.storage_path)); for (const photo of uploaded) await deleteRecord("marketplace_listing_photos", String(photo.id)).catch(() => null); return NextResponse.json({ message: error instanceof Error ? error.message : "Fotografie se nepodařilo uložit." }, { status: 422 }); }
  return NextResponse.json({ message: "Fotografie byly přidány." }, { status: 201 });
}

export async function DELETE(request: Request, context: Context) {
  const id = (await context.params).id; const owner = await owned(id); if (!owner) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const body = await request.json().catch(() => null) as { photoId?: string } | null; const photo = (await listRecords("marketplace_listing_photos")).find((row) => row.listing_id === id && String(row.id) === body?.photoId); if (!photo) return NextResponse.json({ message: "Fotografie nebyla nalezena." }, { status: 404 });
  await removeMarketplacePhotos([photo.storage_path]); await deleteRecord("marketplace_listing_photos", String(photo.id)); return new NextResponse(null, { status: 204 });
}
