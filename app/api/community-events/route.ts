import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { communityEventFingerprint, emailCommunityManagementLink, newManagementToken, publicCommunityEvent, removeCommunityImage, sanitizeAndUploadCommunityImage, sanitizePlainText } from "@/lib/community-events";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord, listRecords } from "@/lib/data-store";
import { getCommunityEvents } from "@/lib/public-data";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityEventSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const cityId = new URL(request.url).searchParams.get("city") || defaultCitySlug;
  if (!await getPublishedCity(cityId)) return NextResponse.json({ message: "Město není aktivní." }, { status: 404 });
  return NextResponse.json({ items: await getCommunityEvents(cityId) }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null); if (!form) return NextResponse.json({ message: "Formulář se nepodařilo přečíst." }, { status: 422 });
  const rawPrice = String(form.get("priceAmount") || "").trim();
  const parsed = communityEventSchema.safeParse({ title: form.get("title"), category: form.get("category"), startsAt: form.get("startsAt"), endsAt: form.get("endsAt") || "", venue: form.get("venue"), description: form.get("description"), isFree: String(form.get("isFree")) === "true", priceAmount: rawPrice ? rawPrice : undefined, eventUrl: form.get("eventUrl") || "", authorEmail: form.get("authorEmail"), publicVenueConsent: String(form.get("publicVenueConsent")) === "true", company: form.get("company") || "", cityId: form.get("cityId") || defaultCitySlug });
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug); if (!city) return NextResponse.json({ message: "Město není aktivní." }, { status: 422 });
  if (!allowRequest(`community-event:${requestFingerprint(request)}`, 3, 24 * 60 * 60 * 1000)) return NextResponse.json({ message: "Denní limit přidaných akcí byl vyčerpán." }, { status: 429 });
  const clean = { title: sanitizePlainText(parsed.data.title), venue: sanitizePlainText(parsed.data.venue), description: sanitizePlainText(parsed.data.description, true) };
  const fingerprint = communityEventFingerprint({ cityId: city.id, title: clean.title, startsAt: parsed.data.startsAt, venue: clean.venue });
  const duplicate = (await listRecords("community_events")).some((row) => row.city_id === city.id && row.duplicate_fingerprint === fingerprint && ["published", "hidden"].includes(String(row.status)));
  if (duplicate) return NextResponse.json({ message: "Stejná akce už byla přidána." }, { status: 409 });
  const id = randomUUID(); const management = newManagementToken(); const image = form.get("image"); let imageUrl: string | undefined;
  try {
    if (image instanceof File && image.size) imageUrl = await sanitizeAndUploadCommunityImage(image, id);
    const saved = await insertRecord("community_events", { id, city_id: city.id, title: clean.title, category: parsed.data.category, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt || null, venue: clean.venue, description: clean.description, is_free: parsed.data.isFree, price_amount: parsed.data.isFree ? null : parsed.data.priceAmount, currency: "CZK", event_url: parsed.data.eventUrl || null, image_url: imageUrl || null, author_email: parsed.data.authorEmail.toLowerCase(), management_token_hash: management.hash, duplicate_fingerprint: fingerprint, status: "published", report_count: 0 });
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL; const origin = process.env.DEMO_MODE === "true" || !configuredOrigin ? new URL(request.url).origin : configuredOrigin; const manageUrl = `${origin}/akce/sprava?id=${encodeURIComponent(String(saved.id))}#token=${management.token}`;
    const emailed = await emailCommunityManagementLink({ email: parsed.data.authorEmail, title: clean.title, manageUrl });
    return NextResponse.json({ item: publicCommunityEvent(saved), manageUrl, emailed, message: emailed ? "Akce je zveřejněná a odkaz pro správu jsme poslali e-mailem." : "Akce je zveřejněná. Bezpečný odkaz pro správu si teď uložte." }, { status: 201 });
  } catch (error) {
    if (imageUrl) await removeCommunityImage(imageUrl);
    const duplicateError = typeof error === "object" && error && "code" in error && error.code === "23505";
    return NextResponse.json({ message: duplicateError ? "Stejná akce už byla přidána." : error instanceof Error ? error.message : "Akci se nepodařilo uložit." }, { status: duplicateError ? 409 : 422 });
  }
}
