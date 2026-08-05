import { NextResponse } from "next/server";
import { ownerCookieName, ownerCookieOptions, ownerIdentity } from "@/lib/anonymous-owner";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord, listRecords } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { serviceRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url); const scope = url.searchParams.get("scope") || "public"; const owner = ownerIdentity(request);
  const type = url.searchParams.get("type"); const location = (url.searchParams.get("location") || "").toLocaleLowerCase("cs-CZ");
  const rows = await listRecords("service_requests");
  const visible = scope === "mine"
    ? rows.filter((row) => row.owner_token_hash === owner.hash)
    : rows.filter((row) => row.moderation_status === "approved");
  const filtered = visible.filter((row) => (!type || row.service_type === type) && (!location || String(row.location || "").toLocaleLowerCase("cs-CZ").includes(location)));
  const response = NextResponse.json({ items: filtered.map((row) => scope === "mine" ? { id: row.id, publicTitle: row.public_title, serviceType: row.service_type, description: row.description, location: row.location, preferredDate: row.preferred_date, moderationStatus: row.moderation_status, createdAt: row.created_at } : { id: row.id, publicTitle: row.public_title, serviceType: row.service_type, description: row.description, location: row.location, preferredDate: row.preferred_date, publishedAt: row.published_at || row.updated_at }) });
  if (owner.isNew) response.cookies.set(ownerCookieName, owner.token, ownerCookieOptions);
  return response;
}

export async function POST(request: Request) {
  const fingerprint = requestFingerprint(request);
  if (!allowRequest(`service:${fingerprint}`, 5, 60 * 60 * 1000)) return NextResponse.json({ message: "Příliš mnoho pokusů. Zkuste to prosím později." }, { status: 429 });
  const parsed = serviceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte vyplněné údaje.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const data = parsed.data; const city = await getPublishedCity(data.cityId || defaultCitySlug);
  if (!city) return NextResponse.json({ message: "Vybrané město není aktivní." }, { status: 422 });
  const owner = ownerIdentity(request);
  const saved = await insertRecord("service_requests", { city_id: city.id, public_title: data.publicTitle, name: data.name, email: data.email || null, phone: data.phone || null, service_type: data.serviceType, description: data.description, location: data.location, preferred_date: data.preferredDate, consent_at: new Date().toISOString(), owner_token_hash: owner.hash, moderation_status: "pending", status: "new", source: "web" });
  const id = String(saved.id);
  const response = NextResponse.json({ message: "Žádost je uložená a čeká na schválení. Kontakt zůstává neveřejný.", status: "pending", reference: `SH-${id.slice(0, 8).toUpperCase()}` }, { status: 201 });
  if (owner.isNew) response.cookies.set(ownerCookieName, owner.token, ownerCookieOptions);
  return response;
}
