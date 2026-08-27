import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { insertRecord, listRecords, updateRecord } from "@/lib/data-store";
import { publicMarketplaceListing } from "@/lib/marketplace-public";
import type { MarketplaceListing } from "@/lib/marketplace-types";
import { legacyProfileIdentity, publicIdentityForRows } from "@/lib/profile-server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export const marketplaceImageBucket = "marketplace-images";
const publicStatuses = new Set(["active", "reserved", "sold"]);

export function cleanMarketplaceText(value: string, multiline = false) {
  const clean = value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return multiline ? clean.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : clean.replace(/\s+/g, " ").trim();
}

export function marketplaceHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function newMarketplaceToken() { const token = randomBytes(32).toString("hex"); return { token, hash: marketplaceHash(token) }; }
export function marketplaceTokenMatches(token: string | null, expected: unknown) {
  if (!token || !/^[a-f0-9]{64}$/.test(token) || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(marketplaceHash(token)), Buffer.from(expected));
}
export function marketplaceDuplicateFingerprint(input: { title: string; category: string; subjectCode?: string }) { return marketplaceHash([input.title, input.category, input.subjectCode || ""].map((value) => cleanMarketplaceText(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()).join("|")); }

export function prohibitedMarketplaceReason(input: { title: string; shortDescription: string; description: string }) {
  const text = `${input.title}\n${input.shortDescription}\n${input.description}`.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/naskenovan|scan(?:y|u|em)?\s+(?:ucebnice|skript)|pdf\s+(?:ucebnice|skript|knihy)|e-?knih.*(?:kopie|zdarma)/, "Nabídka pravděpodobně obsahuje nelegální digitální kopii."],
    [/(?:otazk|odpoved|reseni).{0,30}(?:zkous|testu|zapoctu)|vypracovan.{0,30}(?:zkous|test)/, "Nabídka pravděpodobně obsahuje zadání nebo odpovědi ke zkoušce."],
    [/(?:hotov|vyresen).{0,30}(?:ukol|projekt|semestr)|odevzdam za tebe|napisu za tebe/, "Nabídka pravděpodobně podporuje akademické podvádění."],
    [/nahravk.{0,20}prednask|material.{0,20}vyucujic.{0,20}bez/, "Nabídka pravděpodobně šíří materiál vyučujícího bez svolení."],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1] || null;
}

export function marketplaceEmailConfigured() { return Boolean(process.env.RESEND_API_KEY && (process.env.MARKETPLACE_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL)); }
async function sendMarketplaceEmail(input: { to: string; subject: string; text: string; replyTo?: string }) {
  const apiKey = process.env.RESEND_API_KEY; const from = process.env.MARKETPLACE_FROM_EMAIL || process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, reason: "missing_configuration" as const };
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text, ...(input.replyTo ? { reply_to: input.replyTo } : {}) }), cache: "no-store" }).catch(() => null);
  if (!response?.ok) return { ok: false, reason: "delivery_failed" as const };
  const payload = await response.json().catch(() => ({})) as { id?: string };
  return { ok: true, id: payload.id || null } as const;
}

export async function emailMarketplaceVerification(input: { email: string; title: string; verifyUrl: string }) {
  return sendMarketplaceEmail({ to: input.email, subject: `[StudentHub Burza] Ověřte inzerát: ${input.title}`, text: `Dokončete zveřejnění inzerátu kliknutím na tento jednorázový odkaz:\n\n${input.verifyUrl}\n\nOdkaz platí 2 hodiny. Pokud jste inzerát nevytvořili, zprávu ignorujte. StudentHub nezpracovává platby a tento odkaz nikomu neposílejte.` });
}

export async function relayMarketplaceContact(input: { sellerEmail: string; buyerEmail: string; title: string; message: string }) {
  return sendMarketplaceEmail({ to: input.sellerEmail, replyTo: input.buyerEmail, subject: `[StudentHub Burza] Zájem o: ${input.title}`, text: `Na váš inzerát ve Studentské burze přišla zpráva.\n\nE-mail zájemce: ${input.buyerEmail}\n\n${input.message}\n\nOdpovězte přímo na tento e-mail. StudentHub není stranou obchodu, nepřijímá platby a negarantuje předání.` });
}

export async function consumeMarketplaceLimit(request: Request, action: string, limit: number, windowSeconds: number) {
  const fingerprint = requestFingerprint(request);
  if (!isSupabaseConfigured()) return allowRequest(`marketplace:${action}:${fingerprint}`, limit, windowSeconds * 1000);
  const { data, error } = await createServiceClient().rpc("consume_marketplace_rate_limit", { p_key_hash: fingerprint, p_action: action, p_limit: limit, p_window_seconds: windowSeconds });
  return !error && data === true;
}

function actualImageMime(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function sanitizeAndUploadMarketplacePhoto(file: File, listingId: string, sortOrder: number) {
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error("Každá fotografie může mít nejvýše 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer()); const detected = actualImageMime(bytes);
  if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(detected) || file.type !== detected) throw new Error("Fotografie musí být skutečný JPEG, PNG nebo WebP. PDF, SVG a dokumenty nejsou povoleny.");
  if (!isSupabaseConfigured()) throw new Error("Nahrání fotografií vyžaduje připojené produkční úložiště.");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas"); const source = await loadImage(bytes).catch(() => null);
  if (!source || source.width < 1 || source.height < 1 || source.width > 12000 || source.height > 12000) throw new Error("Fotografii se nepodařilo bezpečně přečíst.");
  const ratio = Math.min(1, 1600 / Math.max(source.width, source.height)); const width = Math.max(1, Math.round(source.width * ratio)); const height = Math.max(1, Math.round(source.height * ratio));
  const canvas = createCanvas(width, height); canvas.getContext("2d").drawImage(source, 0, 0, width, height); const encoded = await canvas.encode("webp", 82);
  if (encoded.length > 2 * 1024 * 1024) throw new Error("Výsledná fotografie je příliš velká.");
  const client = createServiceClient(); const path = `${listingId}/${randomUUID()}.webp`;
  const upload = await client.storage.from(marketplaceImageBucket).upload(path, encoded, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (upload.error) throw new Error("Fotografii se nepodařilo bezpečně uložit.");
  return { id: randomUUID(), listing_id: listingId, storage_path: path, sort_order: sortOrder, width, height, mime_type: "image/webp", size_bytes: encoded.length };
}

export async function removeMarketplacePhotos(paths: unknown[]) {
  if (!isSupabaseConfigured()) return;
  const safe = paths.filter((path): path is string => typeof path === "string" && /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(path));
  if (safe.length) await createServiceClient().storage.from(marketplaceImageBucket).remove(safe);
}

async function photosWithSignedUrls(rows: Record<string, unknown>[]) {
  if (!rows.length || !isSupabaseConfigured()) return rows.map((row) => ({ ...row, signedUrl: undefined }));
  const paths = rows.map((row) => String(row.storage_path)); const { data } = await createServiceClient().storage.from(marketplaceImageBucket).createSignedUrls(paths, 60 * 60);
  const signed = new Map((data || []).map((item) => [item.path, item.signedUrl || undefined])); return rows.map((row): Record<string, unknown> & { signedUrl?: string } => ({ ...row, signedUrl: signed.get(String(row.storage_path)) }));
}

export async function getPublicMarketplaceListings(cityId = "brno", viewerId?: string): Promise<MarketplaceListing[]> {
  const now = Date.now(); const rows = await listRecords("marketplace_listings");
  const stale = rows.filter((row) => ["active", "reserved", "sold"].includes(String(row.status)) && row.expires_at && new Date(String(row.expires_at)).getTime() <= now);
  await Promise.all(stale.map((row) => updateRecord("marketplace_listings", String(row.id), { status: "expired" }).catch(() => null)));
  let visible = rows.filter((row) => row.city_id === cityId && publicStatuses.has(String(row.status)) && (!row.expires_at || new Date(String(row.expires_at)).getTime() > now));
  if (viewerId) { const { data: blocks } = await createServiceClient().from("profile_blocks").select("blocked_id").eq("blocker_id", viewerId); const blocked = new Set((blocks || []).map((row) => String(row.blocked_id))); visible = visible.filter((row) => !blocked.has(String(row.seller_id || ""))); }
  const ids = new Set(visible.map((row) => String(row.id))); const photoRows = (await listRecords("marketplace_listing_photos")).filter((row) => ids.has(String(row.listing_id))); const signedPhotos = await photosWithSignedUrls(photoRows);
  const identities = await publicIdentityForRows(visible.map((row) => row.seller_id), viewerId);
  const enriched = await Promise.all(visible.map(async (row) => { const item = publicMarketplaceListing(row, signedPhotos.filter((photo) => photo.listing_id === row.id)); return item ? { ...item, owned: Boolean(viewerId && row.seller_id === viewerId), chatAvailable: Boolean(row.seller_id && row.seller_id !== viewerId && ["active", "reserved"].includes(String(row.status))), author: row.seller_id ? identities.get(String(row.seller_id)) || legacyProfileIdentity : legacyProfileIdentity } : null; }));
  return enriched.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getPublicMarketplaceListing(id: string) { return (await getPublicMarketplaceListings()).find((item) => item.id === id) || null; }

export async function marketplaceListingByManagementToken(id: string, token: string | null) {
  const row = (await listRecords("marketplace_listings")).find((item) => String(item.id) === id);
  return row && !["deleted", "rejected"].includes(String(row.status)) && marketplaceTokenMatches(token, row.management_token_hash) ? row : null;
}

export async function marketplaceAbuseBlocked(emailHash: string, requestHash: string) {
  return (await listRecords("marketplace_abuse_blocks")).some((row) => row.active && [emailHash, marketplaceHash(requestHash)].includes(String(row.identifier_hash)));
}

export async function recordMarketplaceHistory(listingId: string, eventType: string, previousStatus: unknown, newStatus: unknown, actorType: string, changes: Record<string, unknown> = {}) {
  return insertRecord("marketplace_history", { listing_id: listingId, event_type: eventType, previous_status: previousStatus || null, new_status: newStatus || null, actor_type: actorType, changes });
}
