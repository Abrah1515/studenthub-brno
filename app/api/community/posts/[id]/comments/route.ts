import { NextResponse } from "next/server";
import { cleanCommunityText, containsPersonalContact, looksLikeCommunitySpam, publicCommunityComment } from "@/lib/community";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityCommentSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";
import { legacyProfileIdentity, publicIdentityForRows } from "@/lib/profile-server";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return NextResponse.json({ items: [], page: 1, nextPage: null });
  const postId = (await context.params).id; const source = new URL(request.url); const page = Math.min(100, Math.max(1, Number(source.searchParams.get("page")) || 1)); const limit = 10; const client = createServiceClient(); const viewer = await getCurrentAccount();
  const { data: post } = await client.from("community_posts").select("id,status").eq("id", postId).maybeSingle(); if (!post || post.status !== "active") return NextResponse.json({ message: "Diskuse není dostupná." }, { status: 404 });
  const from = (page - 1) * limit; const { data, count, error } = await client.from("community_comments").select("*", { count: "exact" }).eq("post_id", postId).eq("status", "active").order("is_best", { ascending: false }).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + limit - 1);
  if (error) return NextResponse.json({ message: "Komentáře se nepodařilo načíst." }, { status: 500 });
  let rows = (data || []) as Record<string, unknown>[]; const ids = rows.map((row) => String(row.id)); const { data: reactions } = viewer && ids.length ? await client.from("community_reactions").select("target_id").eq("user_id", viewer.id).eq("target_type", "comment").in("target_id", ids) : { data: [] };
  if (viewer) { const { data: blocks } = await client.from("profile_blocks").select("blocked_id").eq("blocker_id", viewer.id); const blocked = new Set((blocks || []).map((row) => String(row.blocked_id))); rows = rows.filter((row) => !blocked.has(String(row.author_id || ""))); }
  const identities = await publicIdentityForRows(rows.map((row) => row.author_id), viewer?.id);
  const helpful = new Set((reactions || []).map((row) => String(row.target_id)));
  return NextResponse.json({ items: rows.map((row) => publicCommunityComment(row, { owned: Boolean(viewer && row.author_id === viewer.id), viewerHelpful: helpful.has(String(row.id)), author: row.author_id ? identities.get(String(row.author_id)) || legacyProfileIdentity : legacyProfileIdentity })), page, nextPage: count != null && from + rows.length < count ? page + 1 : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Komentáře vyžadují připojený Supabase Auth." }, { status: 503 });
  const user = await getCurrentAccount(); if (!user) return NextResponse.json({ message: "Pro komentování se přihlaste." }, { status: 401 });
  if (user.accountStatus !== "active") return NextResponse.json({ message: "Váš účet má komunitní funkce pozastavené." }, { status: 403 });
  if (!user.complete) return NextResponse.json({ message: "Před komentováním doplňte profil a přijměte pravidla komunity.", profileRequired: true }, { status: 428 });
  if (!allowRequest(`community-comment-ip:${requestFingerprint(request)}`, 30, 60 * 60 * 1000) || !allowRequest(`community-comment-user:${user.id}`, 20, 60 * 60 * 1000)) return NextResponse.json({ message: "Hodinový limit komentářů byl vyčerpán." }, { status: 429 });
  const raw = await request.json().catch(() => null); const parsed = communityCommentSchema.safeParse({ ...(typeof raw === "object" && raw ? raw : {}), nickname: user.displayName }); if (!parsed.success) return NextResponse.json({ message: "Komentář má neplatný obsah.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const nickname = cleanCommunityText(user.displayName); const body = cleanCommunityText(parsed.data.body, true); if (containsPersonalContact(`${nickname}\n${body}`)) return NextResponse.json({ message: "Do veřejného textu nevkládejte e-mail ani telefon." }, { status: 422 });
  if (looksLikeCommunitySpam(body)) return NextResponse.json({ message: "Komentář vypadá jako automatický spam." }, { status: 422 });
  const postId = (await context.params).id; const client = createServiceClient(); const { data: post } = await client.from("community_posts").select("id,city_id,status").eq("id", postId).maybeSingle();
  if (!post || post.status !== "active") return NextResponse.json({ message: "Diskuse není dostupná." }, { status: 404 });
  const { data: duplicate } = await client.from("community_comments").select("id").eq("post_id", postId).eq("author_id", user.id).eq("body", body).eq("status", "active").maybeSingle(); if (duplicate) return NextResponse.json({ message: "Stejný komentář už byl přidán." }, { status: 409 });
  await client.from("community_profiles").upsert({ user_id: user.id, nickname, city_id: post.city_id }, { onConflict: "user_id" });
  const { data: saved, error } = await client.from("community_comments").insert({ post_id: postId, author_id: user.id, author_nickname: nickname, body, status: "active" }).select("*").single(); if (error) return NextResponse.json({ message: "Komentář se nepodařilo uložit." }, { status: 422 });
  const identity = (await publicIdentityForRows([user.id], user.id)).get(user.id) || legacyProfileIdentity;
  return NextResponse.json({ item: publicCommunityComment(saved, { owned: true, author: identity }), message: "Komentář je zveřejněný." }, { status: 201 });
}
