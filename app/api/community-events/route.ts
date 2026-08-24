import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { communityEventFingerprint, newManagementToken, publicCommunityEvent, removeCommunityImage, sanitizeAndUploadCommunityImage, sanitizePlainText } from "@/lib/community-events";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord, listRecords } from "@/lib/data-store";
import { legacyProfileIdentity, publicIdentityForRows } from "@/lib/profile-server";
import { getCommunityEvents } from "@/lib/public-data";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityEventSchema } from "@/lib/schemas";
import { isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cityId = new URL(request.url).searchParams.get("city") || defaultCitySlug;
  if (!await getPublishedCity(cityId)) return NextResponse.json({ message: "Město není aktivní." }, { status: 404 });
  const viewer = await getCurrentAccount();
  return NextResponse.json({ items: await getCommunityEvents(cityId, viewer?.id) }, { headers: { "Cache-Control": viewer ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300" } });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Přidání akce vyžaduje připojený Supabase Auth." }, { status: 503 });
  const account = await getCurrentAccount(); if (!account) return NextResponse.json({ message: "Pro přidání akce se přihlaste." }, { status: 401 });
  if (account.accountStatus !== "active") return NextResponse.json({ message: "Váš účet má publikování pozastavené." }, { status: 403 });
  if (!account.complete) return NextResponse.json({ message: "Před přidáním akce doplňte profil a přijměte pravidla komunity.", profileRequired: true }, { status: 428 });
  if (!allowRequest(`community-event-ip:${requestFingerprint(request)}`, 5, 24 * 60 * 60 * 1000) || !allowRequest(`community-event-user:${account.id}`, 3, 24 * 60 * 60 * 1000)) return NextResponse.json({ message: "Denní limit přidaných akcí byl vyčerpán." }, { status: 429 });
  const form = await request.formData().catch(() => null); if (!form) return NextResponse.json({ message: "Formulář se nepodařilo přečíst." }, { status: 422 });
  const rawPrice = String(form.get("priceAmount") || "").trim();
  const parsed = communityEventSchema.safeParse({ title: form.get("title"), category: form.get("category"), startsAt: form.get("startsAt"), endsAt: form.get("endsAt") || "", venue: form.get("venue"), description: form.get("description"), isFree: String(form.get("isFree")) === "true", priceAmount: rawPrice || undefined, eventUrl: form.get("eventUrl") || "", publicVenueConsent: String(form.get("publicVenueConsent")) === "true", company: form.get("company") || "", cityId: form.get("cityId") || defaultCitySlug });
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug); if (!city) return NextResponse.json({ message: "Město není aktivní." }, { status: 422 });
  const clean = { title: sanitizePlainText(parsed.data.title), venue: sanitizePlainText(parsed.data.venue), description: sanitizePlainText(parsed.data.description, true) };
  const fingerprint = communityEventFingerprint({ cityId: city.id, title: clean.title, startsAt: parsed.data.startsAt, venue: clean.venue });
  const duplicate = (await listRecords("community_events")).some((row) => row.author_id === account.id && row.city_id === city.id && row.duplicate_fingerprint === fingerprint && ["published", "hidden"].includes(String(row.status)));
  if (duplicate) return NextResponse.json({ message: "Stejná akce už byla přidána." }, { status: 409 });
  const id = randomUUID(); const management = newManagementToken(); const image = form.get("image"); let imageUrl: string | undefined;
  try {
    if (image instanceof File && image.size) imageUrl = await sanitizeAndUploadCommunityImage(image, id);
    const { token: _discarded, ...managementPrivate } = management; void _discarded;
    const saved = await insertRecord("community_events", { id, author_id: account.id, city_id: city.id, title: clean.title, category: parsed.data.category, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt || null, venue: clean.venue, description: clean.description, is_free: parsed.data.isFree, price_amount: parsed.data.isFree ? null : parsed.data.priceAmount, currency: "CZK", event_url: parsed.data.eventUrl || null, image_url: imageUrl || null, organizer: account.displayName, source_type: "community", author_email: account.email.toLowerCase(), management_token_hash: managementPrivate.hash, duplicate_fingerprint: fingerprint, status: "published", report_count: 0 });
    const identity = (await publicIdentityForRows([account.id], account.id)).get(account.id) || legacyProfileIdentity;
    return NextResponse.json({ item: publicCommunityEvent(saved, identity), message: "Akce je zveřejněná a můžete ji spravovat ze svého profilu." }, { status: 201 });
  } catch (error) {
    if (imageUrl) await removeCommunityImage(imageUrl); const duplicateError = typeof error === "object" && error && "code" in error && error.code === "23505";
    return NextResponse.json({ message: duplicateError ? "Stejná akce už byla přidána." : error instanceof Error ? error.message : "Akci se nepodařilo uložit." }, { status: duplicateError ? 409 : 422 });
  }
}
