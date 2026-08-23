import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { deleteRecord, insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { removeMarketplacePhotos } from "@/lib/marketplace-server";

const inputSchema = z.object({
  listingId: z.string().uuid(),
  action: z.enum(["hide", "restore", "delete", "resolve_report", "dismiss_report", "block_abuse"]),
  reason: z.string().trim().min(2).max(1000),
  reportId: z.string().uuid().optional(),
});

export async function PATCH(request: Request) {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (user.role === "faculty_editor") return NextResponse.json({ message: "Fakultní editor nemá přístup k soukromé moderaci burzy." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Neplatný moderátorský zásah." }, { status: 422 });
  const row = (await listRecords("marketplace_listings")).find((item) => String(item.id) === parsed.data.listingId);
  if (!row) return NextResponse.json({ message: "Inzerát nebyl nalezen." }, { status: 404 });
  if (user.role !== "super_admin" && (!user.cityId || row.city_id !== user.cityId)) return NextResponse.json({ message: "Inzerát není v rozsahu tohoto správce." }, { status: 403 });
  const now = new Date().toISOString();
  const actorId = user.id === "local-admin" ? null : user.id;
  let changes: Record<string, unknown> = {};
  if (parsed.data.action === "hide" || parsed.data.action === "block_abuse") changes = { status: "hidden", hidden_at: now, moderation_note: parsed.data.reason };
  if (parsed.data.action === "restore") changes = { status: "active", hidden_at: null, moderation_note: null, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() };
  if (parsed.data.action === "delete") changes = { status: "deleted", deleted_at: now, hidden_at: now, seller_email: `deleted+${row.id}@invalid.local`, moderation_note: parsed.data.reason };
  if (Object.keys(changes).length) await updateRecord("marketplace_listings", parsed.data.listingId, changes);
  if (parsed.data.action === "delete") {
    const photos = (await listRecords("marketplace_listing_photos")).filter((photo) => photo.listing_id === row.id);
    await removeMarketplacePhotos(photos.map((photo) => photo.storage_path));
    for (const photo of photos) await deleteRecord("marketplace_listing_photos", String(photo.id));
  }
  if (parsed.data.action === "block_abuse") {
    if (typeof row.seller_email_hash !== "string") return NextResponse.json({ message: "Inzerát nemá bezpečný identifikátor kontaktu." }, { status: 409 });
    const existing = (await listRecords("marketplace_abuse_blocks")).find((block) => block.identifier_hash === row.seller_email_hash);
    if (existing) await updateRecord("marketplace_abuse_blocks", String(existing.id), { active: true, reason: parsed.data.reason, created_by: actorId });
    else await insertRecord("marketplace_abuse_blocks", { identifier_hash: row.seller_email_hash, reason: parsed.data.reason, active: true, created_by: actorId });
  }
  if (["resolve_report", "dismiss_report"].includes(parsed.data.action)) {
    if (!parsed.data.reportId) return NextResponse.json({ message: "Chybí ID hlášení." }, { status: 422 });
    const report = (await listRecords("marketplace_reports")).find((item) => item.id === parsed.data.reportId && item.listing_id === row.id);
    if (!report) return NextResponse.json({ message: "Hlášení nebylo nalezeno." }, { status: 404 });
    await updateRecord("marketplace_reports", parsed.data.reportId, { status: parsed.data.action === "resolve_report" ? "resolved" : "dismissed", reviewed_by: actorId, reviewed_at: now, resolution: parsed.data.reason });
  }
  await insertRecord("marketplace_moderation_actions", { listing_id: row.id, actor_id: actorId, action: parsed.data.action, reason: parsed.data.reason, snapshot: { previous_status: row.status, new_status: changes.status || row.status, report_id: parsed.data.reportId || null } });
  return NextResponse.json({ ok: true });
}
