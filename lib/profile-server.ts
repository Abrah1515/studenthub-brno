import "server-only";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import type { PublicProfileIdentity } from "@/lib/profile-types";
import type { AccountProfile } from "@/lib/user-auth";

export { legacyProfileIdentity } from "@/lib/profile-types";

async function signedAvatar(profile: Record<string, unknown>) {
  if (profile.avatar_path && isSupabaseConfigured()) {
    const { data } = await createServiceClient().storage.from("profile-avatars").createSignedUrl(String(profile.avatar_path), 60 * 60);
    if (data?.signedUrl) return data.signedUrl;
  }
  const external = profile.avatar_url ? String(profile.avatar_url) : "";
  return /^https:\/\//.test(external) ? external : undefined;
}

export async function publicIdentityForRows(userIds: Array<unknown>, viewerId?: string | null) {
  const ids = [...new Set(userIds.filter((value): value is string => typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value)))];
  const result = new Map<string, PublicProfileIdentity>();
  if (!ids.length || !isSupabaseConfigured()) return result;
  let blocked = new Set<string>();
  if (viewerId) {
    const { data } = await createServiceClient().from("profile_blocks").select("blocked_id").eq("blocker_id", viewerId);
    blocked = new Set((data || []).map((row) => String(row.blocked_id)));
  }
  const { data } = await createServiceClient().from("profiles").select("id,username,display_name,avatar_path,avatar_url,university_id,faculty_id,study_program,study_year,show_faculty,show_study_program,show_study_year,profile_visibility,account_status").in("id", ids);
  for (const row of data || []) {
    const id = String(row.id); if (blocked.has(id) || row.account_status !== "active") continue;
    const isPublic = row.profile_visibility === "public" && Boolean(row.username);
    result.set(id, {
      username: isPublic ? String(row.username) : null, displayName: String(row.display_name || "Student"), avatarUrl: isPublic ? await signedAvatar(row) : undefined,
      universityId: isPublic && row.university_id ? String(row.university_id) : undefined,
      facultyId: isPublic && row.show_faculty && row.faculty_id ? String(row.faculty_id) : undefined,
      studyProgram: isPublic && row.show_study_program && row.study_program ? String(row.study_program) : undefined,
      studyYear: isPublic && row.show_study_year && row.study_year != null ? Number(row.study_year) : undefined,
      verifiedEmail: true, legacy: false,
    });
  }
  return result;
}

export async function publicProfileFromRow(row: Record<string, unknown>) {
  if (row.account_status !== "active" || row.profile_visibility !== "public" || !row.username) return null;
  return {
    username: String(row.username), displayName: String(row.display_name || "Student"), avatarUrl: await signedAvatar(row),
    bio: row.bio ? String(row.bio) : undefined, universityId: row.university_id ? String(row.university_id) : undefined,
    facultyId: row.show_faculty && row.faculty_id ? String(row.faculty_id) : undefined,
    studyProgram: row.show_study_program && row.study_program ? String(row.study_program) : undefined,
    studyYear: row.show_study_year && row.study_year != null ? Number(row.study_year) : undefined,
    interests: Array.isArray(row.interests) ? row.interests.map(String) : [], createdAt: String(row.created_at), verifiedEmail: true,
  };
}

function actualImageMime(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function saveProfileAvatar(file: File, profile: Pick<AccountProfile,"id"|"avatarPath">) {
  if (!isSupabaseConfigured()) throw new Error("Profilové fotografie vyžadují připojené úložiště.");
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error("Fotografie může mít nejvýše 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer()); const detected = actualImageMime(bytes);
  if (!detected || detected !== file.type) throw new Error("Fotografie musí být skutečný JPEG, PNG nebo WebP; SVG není povoleno.");
  const image = await loadImage(bytes).catch(() => null); if (!image || image.width < 1 || image.height < 1 || image.width > 12000 || image.height > 12000) throw new Error("Fotografii se nepodařilo bezpečně přečíst.");
  const ratio = Math.min(1,512/Math.max(image.width,image.height)); const width=Math.max(1,Math.round(image.width*ratio)); const height=Math.max(1,Math.round(image.height*ratio));
  const canvas=createCanvas(width,height); canvas.getContext("2d").drawImage(image,0,0,width,height); const encoded=await canvas.encode("webp",82);
  const client=createServiceClient(); const bucket=await client.storage.getBucket("profile-avatars");
  if (bucket.error) { const created=await client.storage.createBucket("profile-avatars",{ public:false,fileSizeLimit:1024*1024,allowedMimeTypes:["image/webp"] }); if (created.error && !/already exists/i.test(created.error.message)) throw new Error("Úložiště avatarů není dostupné."); }
  const path=`${profile.id}/avatar.webp`; const uploaded=await client.storage.from("profile-avatars").upload(path,encoded,{ contentType:"image/webp",upsert:true,cacheControl:"3600" }); if (uploaded.error) throw new Error("Fotografii se nepodařilo uložit.");
  if (profile.avatarPath && profile.avatarPath !== path) await client.storage.from("profile-avatars").remove([profile.avatarPath]);
  return path;
}

export async function removeProfileAvatar(profile: Pick<AccountProfile,"avatarPath">) { if (profile.avatarPath && isSupabaseConfigured()) await createServiceClient().storage.from("profile-avatars").remove([profile.avatarPath]); }
