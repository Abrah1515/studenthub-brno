import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { CommunityComment, CommunityPlace, CommunityPost } from "@/lib/community-types";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export const communityPostImageBucket = "community-post-images";

export function cleanCommunityText(value: string, multiline = false) {
  const clean = value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return multiline ? clean.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : clean.replace(/\s+/g, " ").trim();
}

export function containsPersonalContact(value: string) {
  const email = /\b[\w.+-]{1,64}@[\w.-]{1,190}\.[a-z]{2,24}\b/iu;
  const phone = /(?:^|[^\p{L}\p{N}])(?:\+?\d[\s().-]*){7,15}(?!\d)/u;
  return email.test(value) || phone.test(value);
}

export function looksLikeCommunitySpam(value: string) {
  const links = value.match(/https?:\/\//giu)?.length || 0;
  return links > 3 || /(.)\1{11,}/u.test(value);
}

export function communityFingerprint(userId: string, body: string) {
  const normalized = cleanCommunityText(body, true).normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return createHash("sha256").update(`${userId}|${normalized}`).digest("hex");
}

export function validateCommunityImage(file: Pick<File, "type" | "size">) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Obrázek musí být JPEG, PNG nebo WebP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Obrázek může mít nejvýše 5 MB.");
}

export async function saveCommunityPostImage(file: File, postId: string) {
  validateCommunityImage(file);
  if (!isSupabaseConfigured()) throw new Error("Nahrání obrázku vyžaduje připojené produkční úložiště.");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const source = await loadImage(Buffer.from(await file.arrayBuffer())).catch(() => null);
  if (!source || source.width < 1 || source.height < 1 || source.width > 12_000 || source.height > 12_000) throw new Error("Soubor není platný nebo má nepovolené rozměry.");
  const ratio = Math.min(1, 1600 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * ratio)); const height = Math.max(1, Math.round(source.height * ratio));
  const canvas = createCanvas(width, height); const context = canvas.getContext("2d"); context.drawImage(source, 0, 0, width, height);
  const bytes = await canvas.encode("webp", 82); const client = createServiceClient();
  const bucket = await client.storage.getBucket(communityPostImageBucket);
  if (bucket.error) {
    const created = await client.storage.createBucket(communityPostImageBucket, { public: true, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ["image/webp"] });
    if (created.error && !/already exists/i.test(created.error.message)) throw new Error("Úložiště obrázků není dostupné.");
  }
  const path = `${postId || randomUUID()}.webp`;
  const upload = await client.storage.from(communityPostImageBucket).upload(path, bytes, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (upload.error) throw new Error("Obrázek se nepodařilo bezpečně uložit.");
  return client.storage.from(communityPostImageBucket).getPublicUrl(path).data.publicUrl;
}

export async function removeCommunityPostImage(imageUrl: unknown) {
  if (!isSupabaseConfigured() || typeof imageUrl !== "string") return;
  const marker = `/storage/v1/object/public/${communityPostImageBucket}/`; const index = imageUrl.indexOf(marker); if (index < 0) return;
  const path = decodeURIComponent(imageUrl.slice(index + marker.length)); if (!/^[a-f0-9-]{36}\.webp$/.test(path)) return;
  await createServiceClient().storage.from(communityPostImageBucket).remove([path]);
}

export function publicCommunityPost(row: Record<string, unknown>, options: { owned?: boolean; viewerHelpful?: boolean; place?: CommunityPlace } = {}): CommunityPost {
  return {
    id: String(row.id), nickname: String(row.author_nickname), category: String(row.category) as CommunityPost["category"], body: String(row.body),
    imageUrl: row.image_url ? String(row.image_url) : undefined, place: options.place,
    universityId: row.university_id ? String(row.university_id) : undefined, facultyId: row.faculty_id ? String(row.faculty_id) : undefined,
    helpfulCount: Number(row.helpful_count || 0), commentCount: Number(row.comment_count || 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    owned: Boolean(options.owned), viewerHelpful: Boolean(options.viewerHelpful),
  };
}

export function publicCommunityComment(row: Record<string, unknown>, options: { owned?: boolean; viewerHelpful?: boolean } = {}): CommunityComment {
  return { id: String(row.id), postId: String(row.post_id), nickname: String(row.author_nickname), body: String(row.body), isBest: Boolean(row.is_best), helpfulCount: Number(row.helpful_count || 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at), owned: Boolean(options.owned), viewerHelpful: Boolean(options.viewerHelpful) };
}
