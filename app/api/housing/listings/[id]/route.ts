import { NextResponse } from "next/server";
import { housingListingUpdateSchema } from "@/lib/housing-schemas";
import {
  cleanHousingText,
  consumeHousingLimit,
  evaluateHousingPublication,
  getOwnedHousingListings,
  getPublicHousingListing,
  housingDuplicateFingerprint,
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
    active: ["update", "hide", "archive", "renew", "occupied", "found"],
    hidden: ["archive", "reopen", "renew"],
    occupied: ["archive", "reopen", "renew"],
    found: ["archive", "reopen", "renew"],
    archived: ["reopen"],
    expired: ["archive", "renew"],
    pending_review: ["update", "archive"],
    rejected: ["update", "archive"],
  };
  if (!allowed[previous]?.includes(action)) return NextResponse.json({ message: "Tuto změnu nelze v aktuálním stavu provést." }, { status: 409 });

  const changes: Record<string, unknown> = { version: Number(owner.row.version) + 1 };
  const now = new Date().toISOString();
  if (action === "hide") Object.assign(changes, { status: "hidden", hidden_at: now });
  else if (action === "archive") Object.assign(changes, { status: "archived", hidden_at: now });
  else if (action === "occupied") Object.assign(changes, { status: "occupied", closed_at: now });
  else if (action === "found") Object.assign(changes, { status: "found", closed_at: now });
  else if (action === "reopen" || action === "renew") {
    if (owner.row.moderation_note) return NextResponse.json({ message: "Inzerát skrytý administrátorem nelze obnovit bez nové kontroly." }, { status: 409 });
    const decision = evaluateHousingPublication({
      title: String(owner.row.title), locality: String(owner.row.locality), shortDescription: String(owner.row.short_description),
      description: String(owner.row.description), transitAccess: String(owner.row.transit_access || ""),
      priceMonthly: Number(owner.row.price_monthly), depositAmount: owner.row.deposit_amount == null ? undefined : Number(owner.row.deposit_amount),
    });
    if (decision.outcome === "reject") return NextResponse.json({ message: decision.message }, { status: 422 });
    Object.assign(changes, {
      status: decision.outcome === "publish" ? "active" : "pending_review",
      publication_mode: decision.outcome === "publish" ? "automatic" : null,
      moderation_reason: decision.outcome === "publish" ? "safe_rules_passed" : decision.flags[0],
      moderation_flags: decision.flags,
      auto_evaluated_at: now,
      published_at: decision.outcome === "publish" ? (owner.row.published_at || now) : null,
      hidden_at: null, closed_at: null, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), renewed_at: now,
    });
  }
  else {
    if (owner.row.moderation_note) return NextResponse.json({ message: "Inzerát byl omezen administrátorem. Další zveřejnění vyžaduje moderátorskou kontrolu." }, { status: 409 });
    const fieldMap: Record<string, string> = {
      listingType: "listing_type",
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
    if (candidate.listing_type === "offer") Object.assign(changes, { wanted_person_count: null, lifestyle_preferences: [] });
    else Object.assign(changes, { available_spots: null, current_occupants: null, furnished: null, features: [] });
    if (!candidate.utilities_included && candidate.utilities_amount == null) return NextResponse.json({ message: "Doplňte výši energií nebo označte, že jsou zahrnuté." }, { status: 422 });
    if (candidate.listing_type === "offer" && candidate.available_spots == null) return NextResponse.json({ message: "Doplňte počet volných míst." }, { status: 422 });
    if (candidate.listing_type === "wanted" && candidate.wanted_person_count == null) return NextResponse.json({ message: "Doplňte počet osob." }, { status: 422 });
    const decision = evaluateHousingPublication({
      title: parsed.data.title ?? String(owner.row.title), locality: parsed.data.locality ?? String(owner.row.locality),
      shortDescription: parsed.data.shortDescription ?? String(owner.row.short_description),
      description: parsed.data.description ?? String(owner.row.description),
      transitAccess: parsed.data.transitAccess ?? String(owner.row.transit_access || ""),
      priceMonthly: Number(candidate.price_monthly),
      depositAmount: candidate.deposit_amount == null ? undefined : Number(candidate.deposit_amount),
    });
    if (decision.outcome === "reject") return NextResponse.json({ message: decision.message, reason: decision.flags[0] }, { status: 422 });
    if (decision.outcome === "publish" && candidate.listing_type === "offer") {
      const { count } = await createServiceClient().from("housing_photos").select("id", { count: "exact", head: true }).eq("listing_id", id);
      if (!count) return NextResponse.json({ message: "Nabídka musí mít alespoň jednu bezpečně zpracovanou fotografii." }, { status: 422 });
    }
    const duplicateFingerprint = housingDuplicateFingerprint({ title: String(candidate.title), locality: String(candidate.locality), description: String(candidate.description) });
    const { data: duplicate } = await createServiceClient().from("housing_listings").select("id").eq("author_id", owner.account.id)
      .eq("duplicate_fingerprint", duplicateFingerprint).neq("id", id).in("status", ["active", "pending_review", "hidden"]).limit(1).maybeSingle();
    if (duplicate) return NextResponse.json({ message: "Stejný aktivní inzerát už existuje." }, { status: 409 });
    Object.assign(changes, {
      duplicate_fingerprint: duplicateFingerprint,
      moderation_flags: decision.flags,
      moderation_reason: decision.outcome === "publish" ? "safe_rules_passed" : decision.flags[0],
      publication_mode: decision.outcome === "publish" ? "automatic" : null,
      auto_evaluated_at: now,
      status: decision.outcome === "publish" ? "active" : "pending_review",
      published_at: decision.outcome === "publish" ? (owner.row.published_at || now) : null,
    });
  }

  const { data, error } = await createServiceClient().from("housing_listings").update(changes).eq("id", id).eq("version", parsed.data.version).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ message: error?.code === "23505" ? "Stejný aktivní inzerát už existuje." : "Souběžnou změnu se nepodařilo uložit. Obnovte stránku." }, { status: 409 });
  const historyTypes: Record<string, string> = { update: "updated", hide: "hidden", archive: "archived", reopen: "restored", renew: "renewed" };
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
