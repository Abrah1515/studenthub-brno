import { NextResponse } from "next/server";
import { deleteRecord, listRecords, updateRecord } from "@/lib/data-store";
import { cleanMarketplaceText, consumeMarketplaceLimit, getOwnedMarketplaceListings, getPublicMarketplaceListing, prohibitedMarketplaceReason, recordMarketplaceHistory, removeMarketplacePhotos } from "@/lib/marketplace-server";
import { marketplaceListingUpdateSchema } from "@/lib/schemas";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
const privateManagementFields = new Set(["seller_id", "seller_email", "seller_email_hash", "request_fingerprint", "duplicate_fingerprint", "moderation_note"]);
function managedItem(row: Record<string, unknown>) { return Object.fromEntries(Object.entries(row).filter(([key]) => !privateManagementFields.has(key))); }
async function ownedItem(id: string) { const account = await getCurrentAccount(); const row = (await listRecords("marketplace_listings")).find((item) => String(item.id) === id); return account?.complete && account.accountStatus === "active" && row?.seller_id === account.id ? row : null; }

export async function GET(_request: Request, context: Context) {
  const id = (await context.params).id;
  const account = await getCurrentAccount();
  if (account) {
    const row = await ownedItem(id); if (row) { const owned = (await getOwnedMarketplaceListings(account.id)).find((item) => item.id === id); return NextResponse.json({ item: { ...managedItem(row), photos: owned?.photos || [] } }, { headers: { "Cache-Control": "private, no-store" } }); }
  }
  const item = await getPublicMarketplaceListing(id); return item ? NextResponse.json({ item }, { headers: { "Cache-Control": "public, max-age=30" } }) : NextResponse.json({ message: "Inzerát nebyl nalezen." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const manageLimit = await consumeMarketplaceLimit(request, "manage", 30, 60 * 60);
  if (manageLimit.status === "error") { console.error("marketplace_rate_limit_failed", { action: "manage", code: manageLimit.code }); return NextResponse.json({ message: "Ochranu proti spamu se nepodařilo ověřit." }, { status: 503 }); }
  if (manageLimit.status === "limited") return NextResponse.json({ message: "Limit úprav byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const row = await ownedItem(id); if (!row) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  if (["deleted", "rejected", "hidden"].includes(String(row.status))) return NextResponse.json({ message: row.status === "hidden" ? "Inzerát skryl správce a nelze jej obnovit." : "Tento inzerát už nelze upravit." }, { status: 409 });
  const parsed = marketplaceListingUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const value = parsed.data; const previous = String(row.status); const changes: Record<string, unknown> = {};
  const allowedActions: Record<string, string[]> = { active: ["update", "reserve", "sold", "archive", "renew"], reserved: ["update", "sold", "archive", "reopen", "renew"], sold: ["update", "archive", "reopen", "renew"], archived: ["reopen"], expired: ["archive", "renew"] };
  if (!allowedActions[previous]?.includes(value.action)) return NextResponse.json({ message: "Tuto změnu nelze v aktuálním stavu provést." }, { status: 409 });
  if (value.action === "reserve") changes.status = "reserved";
  else if (value.action === "sold") changes.status = "sold";
  else if (value.action === "archive") changes.status = "archived";
  else if (value.action === "reopen") { changes.status = "active"; changes.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); changes.renewed_at = new Date().toISOString(); }
  else if (value.action === "renew") { changes.status = previous === "reserved" ? "reserved" : "active"; changes.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); changes.renewed_at = new Date().toISOString(); }
  else {
    const nextText = { title: value.title ? cleanMarketplaceText(value.title) : String(row.title), shortDescription: value.shortDescription ? cleanMarketplaceText(value.shortDescription) : String(row.short_description), description: value.description ? cleanMarketplaceText(value.description, true) : String(row.description) };
    const prohibited = prohibitedMarketplaceReason(nextText); if (prohibited) return NextResponse.json({ message: prohibited }, { status: 422 });
    if (value.title) changes.title = nextText.title; if (value.shortDescription) changes.short_description = nextText.shortDescription; if (value.description) changes.description = nextText.description;
    if (value.listingType) changes.listing_type = value.listingType;
    if (value.category) changes.category = value.category;
    const optionalTextFields: Record<string, string> = { universityId: "university_id", facultyId: "faculty_id", studyProgram: "study_program", subjectName: "subject_name", subjectCode: "subject_code", teacherName: "teacher_name" };
    for (const [input, column] of Object.entries(optionalTextFields)) {
      const raw = value[input as keyof typeof value];
      if (raw !== undefined) changes[column] = typeof raw === "string" ? cleanMarketplaceText(raw) || null : null;
    }
    if (value.recommendedYear !== undefined) changes.recommended_year = value.recommendedYear;
    if (value.priceMode) { if (value.priceMode === "negotiable" && row.listing_type !== "wanted") return NextResponse.json({ message: "Cenu dohodou lze použít pouze u inzerátu Hledám." }, { status: 422 }); if (value.priceMode === "fixed" && value.priceAmount == null) return NextResponse.json({ message: "Doplňte pevnou cenu v Kč." }, { status: 422 }); changes.price_mode = value.priceMode; changes.price_amount = value.priceMode === "free" ? 0 : value.priceMode === "negotiable" ? null : value.priceAmount; }
    if (value.priceAmount !== undefined && !value.priceMode) { if (row.price_mode !== "fixed" && value.priceAmount != null) return NextResponse.json({ message: "Cenu lze doplnit jen u pevné ceny." }, { status: 422 }); changes.price_amount = value.priceAmount; } if (value.priceScope) changes.price_scope = value.priceScope; if (value.handoffMethod) changes.handoff_method = value.handoffMethod; if (value.handoffLocation !== undefined) changes.handoff_location = cleanMarketplaceText(value.handoffLocation) || null;
    const nextHandoff = String(changes.handoff_method || row.handoff_method); const nextLocation = changes.handoff_location === undefined ? row.handoff_location : changes.handoff_location;
    if (["in_person", "agreement"].includes(nextHandoff) && !nextLocation) return NextResponse.json({ message: "Doplňte přibližné místo předání." }, { status: 422 });
  }
  const saved = await updateRecord("marketplace_listings", id, changes); const next = String(saved.status); const event = value.action === "reserve" ? "reserved" : value.action === "sold" ? "sold" : value.action === "archive" ? "archived" : value.action === "renew" ? "renewed" : value.action === "reopen" ? "reopened" : "updated";
  await recordMarketplaceHistory(id, event, previous, next, "seller", changes);
  return NextResponse.json({ item: managedItem(saved), message: value.action === "renew" ? "Inzerát byl prodloužen o 30 dní." : "Změna byla uložena." });
}

export async function DELETE(request: Request, context: Context) {
  const deleteLimit = await consumeMarketplaceLimit(request, "delete", 5, 60 * 60);
  if (deleteLimit.status === "error") { console.error("marketplace_rate_limit_failed", { action: "delete", code: deleteLimit.code }); return NextResponse.json({ message: "Ochranu proti spamu se nepodařilo ověřit." }, { status: 503 }); }
  if (deleteLimit.status === "limited") return NextResponse.json({ message: "Limit operací byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const row = await ownedItem(id); if (!row) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const photos = (await listRecords("marketplace_listing_photos")).filter((photo) => photo.listing_id === id); await removeMarketplacePhotos(photos.map((photo) => photo.storage_path)); for (const photo of photos) await deleteRecord("marketplace_listing_photos", String(photo.id));
  await updateRecord("marketplace_listings", id, { status: "deleted", deleted_at: new Date().toISOString(), seller_email: `deleted+${id}@invalid.local` }); await recordMarketplaceHistory(id, "deleted", row.status, "deleted", "seller");
  return new NextResponse(null, { status: 204 });
}
