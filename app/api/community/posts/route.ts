import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanCommunityText, communityFingerprint, containsPersonalContact, looksLikeCommunitySpam, publicCommunityPost, removeCommunityPostImage, saveCommunityPostImage } from "@/lib/community";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { communityCategories, type CommunityPlace } from "@/lib/community-types";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityPostSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/user-auth";

export const runtime = "nodejs";

function safeScope(value: string | null) {
  return value && /^[a-z0-9-]{1,80}$/.test(value) ? value : null;
}

export async function GET(request: Request) {
  const source = new URL(request.url); const cityId = source.searchParams.get("city") || defaultCitySlug;
  if (!await getPublishedCity(cityId)) return NextResponse.json({ message: "Město není aktivní." }, { status: 404 });
  const page = Math.min(100, Math.max(1, Number(source.searchParams.get("page")) || 1)); const limit = 12; const sort = source.searchParams.get("sort") === "popular" ? "popular" : "newest";
  if (!isSupabaseConfigured()) return NextResponse.json({ items: [], page, nextPage: null, viewer: { loggedIn: false, nickname: "" } });
  const client = createServiceClient(); const viewer = await getCurrentUser();
  let query = client.from("community_posts").select("*", { count: "exact" }).eq("city_id", cityId).eq("status", "active");
  const requestedCategory = source.searchParams.get("category"); const category = communityCategories.includes(requestedCategory as (typeof communityCategories)[number]) ? requestedCategory : null; const university = safeScope(source.searchParams.get("university")); const faculty = safeScope(source.searchParams.get("faculty")); const search = cleanCommunityText(source.searchParams.get("q") || "");
  if (category) query = query.eq("category", category);
  if (faculty && university) query = query.or(`university_id.is.null,and(university_id.eq.${university},faculty_id.is.null),faculty_id.eq.${faculty}`);
  else if (university) query = query.or(`university_id.is.null,university_id.eq.${university}`);
  if (search) query = query.ilike("body", `%${search.replace(/[%_]/g, "")}%`);
  query = sort === "popular" ? query.order("helpful_count", { ascending: false }).order("comment_count", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }) : query.order("created_at", { ascending: false }).order("id", { ascending: false });
  const from = (page - 1) * limit; const { data, count, error } = await query.range(from, from + limit - 1); if (error) return NextResponse.json({ message: "Příspěvky se nepodařilo načíst." }, { status: 500 });
  const rows = (data || []) as Record<string, unknown>[]; const placeIds = rows.map((row) => String(row.place_id || "")).filter(Boolean); const postIds = rows.map((row) => String(row.id));
  const [{ data: placeRows }, { data: reactionRows }, { data: profile }] = await Promise.all([
    placeIds.length ? client.from("places").select("id,name,address,latitude,longitude").in("id", placeIds).eq("status", "approved") : Promise.resolve({ data: [] }),
    viewer && postIds.length ? client.from("community_reactions").select("target_id").eq("user_id", viewer.id).eq("target_type", "post").in("target_id", postIds) : Promise.resolve({ data: [] }),
    viewer ? client.from("community_profiles").select("nickname").eq("user_id", viewer.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const places = new Map((placeRows || []).map((row) => [String(row.id), { id: String(row.id), name: String(row.name), address: String(row.address), latitude: Number(row.latitude), longitude: Number(row.longitude) } satisfies CommunityPlace]));
  const helpful = new Set((reactionRows || []).map((row) => String(row.target_id)));
  return NextResponse.json({ items: rows.map((row) => publicCommunityPost(row, { owned: Boolean(viewer && row.author_id === viewer.id), viewerHelpful: helpful.has(String(row.id)), place: places.get(String(row.place_id || "")) })), page, nextPage: count != null && from + rows.length < count ? page + 1 : null, viewer: { loggedIn: Boolean(viewer), nickname: profile?.nickname || "" } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Publikování vyžaduje připojený Supabase Auth." }, { status: 503 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ message: "Nejprve ověřte e-mail přihlašovacím odkazem." }, { status: 401 });
  if (!allowRequest(`community-post-ip:${requestFingerprint(request)}`, 8, 24 * 60 * 60 * 1000) || !allowRequest(`community-post-user:${user.id}`, 5, 24 * 60 * 60 * 1000)) return NextResponse.json({ message: "Denní limit příspěvků byl vyčerpán." }, { status: 429 });
  const form = await request.formData().catch(() => null); if (!form) return NextResponse.json({ message: "Formulář se nepodařilo přečíst." }, { status: 422 });
  const parsed = communityPostSchema.safeParse({ nickname: form.get("nickname"), category: form.get("category"), body: form.get("body"), universityId: form.get("universityId") || "", facultyId: form.get("facultyId") || "", placeId: form.get("placeId") || "", company: form.get("company") || "", cityId: form.get("cityId") || defaultCitySlug });
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte příspěvek.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug); if (!city) return NextResponse.json({ message: "Město není aktivní." }, { status: 422 });
  const nickname = cleanCommunityText(parsed.data.nickname); const body = cleanCommunityText(parsed.data.body, true);
  if (containsPersonalContact(`${nickname}\n${body}`)) return NextResponse.json({ message: "Do veřejného textu nevkládejte e-mail ani telefon." }, { status: 422 });
  if (looksLikeCommunitySpam(body)) return NextResponse.json({ message: "Příspěvek vypadá jako automatický spam. Zkraťte odkazy nebo opakující se text." }, { status: 422 });
  const client = createServiceClient(); const [{ data: baseProfile }, { data: communityProfile }] = await Promise.all([client.from("profiles").select("is_blocked").eq("id", user.id).maybeSingle(), client.from("community_profiles").select("status").eq("user_id", user.id).maybeSingle()]);
  if (baseProfile?.is_blocked || communityProfile?.status === "blocked") return NextResponse.json({ message: "Váš účet má komunitní publikování pozastavené." }, { status: 403 });
  let place: CommunityPlace | undefined;
  if (parsed.data.placeId) { const { data } = await client.from("places").select("id,name,address,latitude,longitude").eq("id", parsed.data.placeId).eq("city_id", city.id).eq("status", "approved").maybeSingle(); if (!data) return NextResponse.json({ message: "Vybrané místo není dostupné." }, { status: 422 }); place = { id: String(data.id), name: String(data.name), address: String(data.address), latitude: Number(data.latitude), longitude: Number(data.longitude) }; }
  const fingerprint = communityFingerprint(user.id, body); const { data: duplicate } = await client.from("community_posts").select("id").eq("author_id", user.id).eq("duplicate_fingerprint", fingerprint).in("status", ["active", "hidden"]).maybeSingle();
  if (duplicate) return NextResponse.json({ message: "Stejný příspěvek už jste zveřejnili." }, { status: 409 });
  await client.from("community_profiles").upsert({ user_id: user.id, nickname, city_id: city.id, university_id: parsed.data.universityId || null, faculty_id: parsed.data.facultyId || null }, { onConflict: "user_id" });
  const id = randomUUID(); const image = form.get("image"); let imageUrl: string | undefined;
  try {
    if (image instanceof File && image.size) imageUrl = await saveCommunityPostImage(image, id);
    const { data: saved, error } = await client.from("community_posts").insert({ id, author_id: user.id, author_nickname: nickname, city_id: city.id, university_id: parsed.data.universityId || null, faculty_id: parsed.data.facultyId || null, place_id: parsed.data.placeId || null, category: parsed.data.category, body, image_url: imageUrl || null, status: "active", duplicate_fingerprint: fingerprint }).select("*").single();
    if (error) throw error;
    return NextResponse.json({ item: publicCommunityPost(saved, { owned: true, place }), message: "Příspěvek je zveřejněný." }, { status: 201 });
  } catch (error) {
    if (imageUrl) await removeCommunityPostImage(imageUrl); const duplicateError = typeof error === "object" && error && "code" in error && error.code === "23505";
    return NextResponse.json({ message: duplicateError ? "Stejný příspěvek už jste zveřejnili." : error instanceof Error ? error.message : "Příspěvek se nepodařilo uložit." }, { status: duplicateError ? 409 : 422 });
  }
}
