import { NextResponse } from "next/server";
import { housingListingUpdateSchema } from "@/lib/housing-schemas";
import {
  cleanHousingText,
  consumeHousingLimit,
  getOwnedHousingListings,
  getPublicHousingListing,
  housingModerationFlags,
  recordHousingHistory,
  removeHousingPhotos,
} from "@/lib/housing-server";
import { createServiceClient } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const id = (await context.params).id;
  const account = await getCurrentAccount();
  const client = createServiceClient();
  if (account) {
    const own = (await getOwnedHousingListings(account.id)).find((item) => item.id === id);
    if (own) return NextResponse.json({ item: own }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const item = await getPublicHousingListing(id, account?.id);
  if (!item) return NextResponse.json({ message: "Inzerát nebyl nalezen." }, { status: 404 });
  await client.rpc("increment_housing_view", { target_listing: id });
  return NextResponse.json({ item }, { headers: { "Cache-Control": "public, max-age=30" } });
}

async function owned(id: string) {
  const account = await getCurrentAccount();
  if (!account?.complete || account.accountStatus !== "active") return { account: null, row: null };
  const { data } = await createServiceClient().from("housing_listings").select("*").eq("id", id).eq("author_id", account.id).maybeSingle();
  return { account, row: data };
}

function limitedResponse(status: "limited" | "error", message: string) {
  return NextResponse.json(
    { message: status === "limited" ? message : "Ochranu proti spamu se nepodařilo ověřit." },
    { status: status === "limited" ? 429 : 503 },
  );
}

export async function PATCH(request: Request, context: Context) {
  const id = (await context.params).id;
  const owner = await owned(id);
  if (!owner.account || !owner.row) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const parsed = housingListingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });

  const manageLimit = await consumeHousingLimit(request, "manage", 30, 3600, owner.account.id);
  if (manageLimit.status !== "allowed") return limitedResponse(manageLimit.status, "Limit úprav byl vyčerpán.");
  if (parsed.data.action === "renew") {
    const renewLimit = await consumeHousingLimit(request, "renew", 6, 86400, owner.account.id);
    if (renewLimit.status !== "allowed") return limitedResponse(renewLimit.status, "Denní limit prodloužení byl vyčerpán.");
  }
  if (parsed.data.version !== Number(owner.row.version)) return NextResponse.json({ message: "Inzerát byl mezitím změněn. Obnovte stránku." }, { status: 409 });

  const action = parsed.data.action;
  const previous = String(owner.row.status);
  const allowed: Record<string, string[]> = {
    active: ["update", "hide", "renew", "occupied", "found"],
    hidden: ["reopen", "renew"],
    occupied: ["reopen", "renew"],
    found: ["reopen", "renew"],
    expired: ["renew"],
  };
  if (!allowed[previous]?.includes(action)) return NextResponse.json({ message: "Tuto změnu nelze v aktuálním stavu provést." }, { status: 409 });

  const changes: Record<string, unknown> = { version: Number(owner.row.version) + 1 };
  const now = new Date().toISOString();
  if (action === "hide") Object.assign(changes, { status: "hidden", hidden_at: now });
  else if (action === "occupied") Object.assign(changes, { status: "occupied", closed_at: now });
  else if (action === "found") Object.assign(changes, { status: "found", closed_at: now });
  else if (action === "reopen" || action === "renew") Object.assign(changes, {
    status: "active",
    published_at: owner.row.published_at || now,
    hidden_at: null,
    closed_at: null,
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    renewed_at: now,
  });
  else {
    const fieldMap: Record<string, string> = {
      availableFrom: "available_from", stayLength: "stay_length", shortDescription: "short_description",
      priceMonthly: "price_monthly", utilitiesIncluded: "utilities_included", utilitiesAmount: "utilities_amount",
      depositAmount: "deposit_amount", availableSpots: "available_spots", currentOccupants: "current_occupants",
      transitAccess: "transit_access", wantedPersonCount: "wanted_person_count", lifestylePreferences: "lifestyle_preferences",
    };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (["action", "version"].includes(key) || value === undefined) continue;
      changes[fieldMap[key] || key] = typeof value === "string" ? cleanHousingText(value, key === "description") : value;
    }
    const candidate = { ...owner.row, ...changes };
    const flags = housingModerationFlags({
      title: String(candidate.title),
      shortDescription: String(candidate.short_description),
      description: String(candidate.description),
      priceMonthly: Number(candidate.price_monthly),
      depositAmount: candidate.deposit_amount == null ? undefined : Number(candidate.deposit_amount),
    });
    Object.assign(changes, {
      moderation_flags: flags,
      ...(flags.length ? { status: "pending_review", published_at: null } : {}),
    });
  }

  const { data, error } = await createServiceClient().from("housing_listings").update(changes).eq("id", id).eq("version", parsed.data.version).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ message: "Souběžnou změnu se nepodařilo uložit. Obnovte stránku." }, { status: 409 });
  const historyTypes: Record<string, string> = { reopen: "restored", renew: "renewed" };
  const historyType = historyTypes[action] || action;
  await recordHousingHistory(id, historyType, previous, String(data.status), owner.account.id, changes);
  return NextResponse.json({ item: data, message: action === "renew" ? "Platnost byla prodloužena o 30 dní." : data.status === "pending_review" ? "Změna je uložená a čeká na bezpečnostní kontrolu." : "Změna byla uložena." });
}

export async function DELETE(request: Request, context: Context) {
  const id = (await context.params).id;
  const owner = await owned(id);
  if (!owner.account || !owner.row) return NextResponse.json({ message: "Inzerát nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const limit = await consumeHousingLimit(request, "delete", 5, 3600, owner.account.id);
  if (limit.status !== "allowed") return NextResponse.json({ message: "Operaci nyní nelze provést." }, { status: limit.status === "limited" ? 429 : 503 });
  const client = createServiceClient();
  const { data: photos } = await client.from("housing_photos").select("storage_path").eq("listing_id", id);
  await removeHousingPhotos((photos || []).map((photo) => photo.storage_path));
  await client.from("housing_photos").delete().eq("listing_id", id);
  await client.from("housing_listings").update({ status: "deleted", deleted_at: new Date().toISOString(), version: Number(owner.row.version) + 1 }).eq("id", id);
  await recordHousingHistory(id, "deleted", owner.row.status, "deleted", owner.account.id);
  return new NextResponse(null, { status: 204 });
}
