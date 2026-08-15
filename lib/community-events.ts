import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { CommunityEvent } from "@/lib/types";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export const communityImageBucket = "community-event-images";

export function sanitizePlainText(value: string, multiline = false) {
  const withoutTags = value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return multiline ? withoutTags.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : withoutTags.replace(/\s+/g, " ").trim();
}

export function communityEventFingerprint(input: { cityId: string; title: string; startsAt: string; venue: string }) {
  const normalized = [input.cityId, input.title, input.startsAt.slice(0, 16), input.venue].map((value) => sanitizePlainText(value).normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()).join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function newManagementToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function managementTokenMatches(token: string | null, expectedHash: unknown) {
  if (!token || !/^[a-f0-9]{64}$/.test(token) || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const actual = createHash("sha256").update(token).digest("hex");
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
}

export function publicCommunityEvent(row: Record<string, unknown>): CommunityEvent {
  return { id: String(row.id), cityId: String(row.city_id), title: String(row.title), category: String(row.category) as CommunityEvent["category"], startsAt: String(row.starts_at), endsAt: row.ends_at ? String(row.ends_at) : undefined, venue: String(row.venue), description: String(row.description), isFree: Boolean(row.is_free), priceAmount: row.price_amount == null ? undefined : Number(row.price_amount), currency: "CZK", eventUrl: row.event_url ? String(row.event_url) : undefined, imageUrl: row.image_url ? String(row.image_url) : undefined, createdAt: String(row.created_at) };
}

export async function sanitizeAndUploadCommunityImage(file: File, eventId: string) {
  if (!isSupabaseConfigured()) throw new Error("Nahrání obrázku vyžaduje připojené produkční úložiště.");
  if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) throw new Error("Obrázek musí být JPEG, PNG nebo WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Obrázek může mít nejvýše 5 MB.");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const source = await loadImage(Buffer.from(await file.arrayBuffer())).catch(() => null);
  if (!source || source.width < 1 || source.height < 1 || source.width > 12_000 || source.height > 12_000) throw new Error("Obrázek se nepodařilo bezpečně přečíst.");
  const ratio = Math.min(1, 1600 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * ratio)); const height = Math.max(1, Math.round(source.height * ratio));
  const canvas = createCanvas(width, height); const context = canvas.getContext("2d"); context.drawImage(source, 0, 0, width, height);
  const bytes = await canvas.encode("webp", 82);
  const client = createServiceClient();
  const bucket = await client.storage.getBucket(communityImageBucket);
  if (bucket.error) {
    const created = await client.storage.createBucket(communityImageBucket, { public: true, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ["image/webp"] });
    if (created.error && !/already exists/i.test(created.error.message)) throw new Error("Úložiště obrázků není dostupné.");
  }
  const path = `${eventId}.webp`;
  const upload = await client.storage.from(communityImageBucket).upload(path, bytes, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (upload.error) throw new Error("Obrázek se nepodařilo bezpečně uložit.");
  return client.storage.from(communityImageBucket).getPublicUrl(path).data.publicUrl;
}

export async function removeCommunityImage(imageUrl: unknown) {
  if (!isSupabaseConfigured() || typeof imageUrl !== "string") return;
  const marker = `/storage/v1/object/public/${communityImageBucket}/`; const position = imageUrl.indexOf(marker); if (position < 0) return;
  const path = decodeURIComponent(imageUrl.slice(position + marker.length)); if (!/^[a-f0-9-]{36}\.webp$/.test(path)) return;
  await createServiceClient().storage.from(communityImageBucket).remove([path]);
}

export async function emailCommunityManagementLink(input: { email: string; title: string; manageUrl: string }) {
  const apiKey = process.env.RESEND_API_KEY; const from = process.env.CONTACT_FROM_EMAIL;
  if (!apiKey || !from) return false;
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [input.email], subject: `[StudentHub] Správa akce: ${input.title}`, text: `Vaše komunitní akce byla zveřejněna. Tento neveřejný odkaz slouží k její úpravě nebo odstranění:\n\n${input.manageUrl}\n\nOdkaz nikomu neposílejte.` }), cache: "no-store" }).catch(() => null);
  return Boolean(response?.ok);
}
