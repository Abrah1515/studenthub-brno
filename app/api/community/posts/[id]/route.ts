import { NextResponse } from "next/server";
import { cleanCommunityText, communityFingerprint, containsPersonalContact, looksLikeCommunitySpam, publicCommunityPost, removeCommunityPostImage } from "@/lib/community";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityPostUpdateSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
async function owned(id: string, userId: string) { const { data } = await createServiceClient().from("community_posts").select("*").eq("id", id).eq("author_id", userId).maybeSingle(); return data; }

export async function PATCH(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Úložiště není připojené." }, { status: 503 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (!allowRequest(`community-post-edit:${user.id}:${requestFingerprint(request)}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit úprav byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const post = await owned(id, user.id); if (!post || post.status !== "active") return NextResponse.json({ message: "Příspěvek nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const parsed = communityPostUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte změny.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const nickname = parsed.data.nickname ? cleanCommunityText(parsed.data.nickname) : String(post.author_nickname); const body = parsed.data.body ? cleanCommunityText(parsed.data.body, true) : String(post.body);
  if (containsPersonalContact(`${nickname}\n${body}`)) return NextResponse.json({ message: "Do veřejného textu nevkládejte e-mail ani telefon." }, { status: 422 });
  if (looksLikeCommunitySpam(body)) return NextResponse.json({ message: "Příspěvek vypadá jako automatický spam." }, { status: 422 });
  const universityId = parsed.data.universityId !== undefined ? parsed.data.universityId || null : post.university_id;
  const facultyId = parsed.data.universityId !== undefined && !parsed.data.universityId
    ? null
    : parsed.data.facultyId !== undefined ? parsed.data.facultyId || null : post.faculty_id;
  const placeId = parsed.data.placeId !== undefined ? parsed.data.placeId || null : post.place_id;
  const client = createServiceClient(); if (placeId) { const { data } = await client.from("places").select("id").eq("id", placeId).eq("city_id", post.city_id).eq("status", "approved").maybeSingle(); if (!data) return NextResponse.json({ message: "Vybrané místo není dostupné." }, { status: 422 }); }
  const { data: saved, error } = await client.from("community_posts").update({ author_nickname: nickname, category: parsed.data.category ?? post.category, body, university_id: universityId, faculty_id: facultyId, place_id: placeId, duplicate_fingerprint: communityFingerprint(user.id, body) }).eq("id", id).eq("author_id", user.id).select("*").single();
  if (error) return NextResponse.json({ message: error.code === "23505" ? "Stejný příspěvek už jste zveřejnili." : "Příspěvek se nepodařilo upravit." }, { status: error.code === "23505" ? 409 : 422 });
  await client.from("community_profiles").update({ nickname, university_id: universityId, faculty_id: facultyId }).eq("user_id", user.id);
  return NextResponse.json({ item: publicCommunityPost(saved, { owned: true }), message: "Příspěvek byl upraven." });
}

export async function DELETE(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Úložiště není připojené." }, { status: 503 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (!allowRequest(`community-post-delete:${user.id}:${requestFingerprint(request)}`, 8, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit operací byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const post = await owned(id, user.id); if (!post || post.status === "deleted") return NextResponse.json({ message: "Příspěvek nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const client = createServiceClient(); const { error } = await client.from("community_posts").update({ status: "deleted", deleted_at: new Date().toISOString(), image_url: null }).eq("id", id).eq("author_id", user.id); if (error) return NextResponse.json({ message: "Příspěvek se nepodařilo odstranit." }, { status: 422 });
  await removeCommunityPostImage(post.image_url); return new NextResponse(null, { status: 204 });
}
