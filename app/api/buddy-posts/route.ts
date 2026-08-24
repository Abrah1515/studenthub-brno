import { NextResponse } from "next/server";
import { expireBuddyPosts } from "@/lib/buddy";
import { defaultCitySlug } from "@/lib/cities";
import { getPublishedCity } from "@/lib/city-data";
import { insertRecord, listRecords } from "@/lib/data-store";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { buddyPostSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentAccount, getCurrentUser } from "@/lib/user-auth";
import { legacyProfileIdentity, publicIdentityForRows } from "@/lib/profile-server";

export async function GET(request: Request) {
  await expireBuddyPosts(); const url = new URL(request.url); const scope = url.searchParams.get("scope") || "public"; const user = scope === "mine" ? await getCurrentUser() : null;
  if (scope === "mine" && !user) return NextResponse.json({ message: "Přihlaste se ke svému účtu." }, { status: 401 });
  const [posts, joins] = await Promise.all([listRecords("buddy_posts"), scope === "mine" ? listRecords("buddy_join_requests") : Promise.resolve([])]);
  const blocked = user ? new Set((await createServiceClient().from("profile_blocks").select("blocked_id").eq("blocker_id",user.id)).data?.map((row)=>String(row.blocked_id)) || []) : new Set<string>();
  const visible = scope === "mine" ? posts.filter((post) => post.owner_id === user!.id) : posts.filter((post) => !blocked.has(String(post.owner_id||"")) && post.moderation_status === "approved" && post.status === "active" && new Date(String(post.expires_at)).getTime() >= Date.now());
  const identities=await publicIdentityForRows(visible.map((post)=>post.owner_id),user?.id);
  return NextResponse.json({ items: visible.map((post) => ({ id: post.id, activityType: post.activity_type, approximateLocation: post.approximate_location, startsAt: post.starts_at, description: post.description, maxParticipants: post.max_participants, status: post.status, moderationStatus: scope === "mine" ? post.moderation_status : undefined, author:post.owner_id?identities.get(String(post.owner_id))||legacyProfileIdentity:legacyProfileIdentity, joinCount: joins.filter((join) => join.post_id === post.id && join.status === "accepted").length, joinRequests: scope === "mine" ? joins.filter((join) => join.post_id === post.id).map((join) => ({ id: join.id, status: join.status, message: join.message, requesterId: join.requester_id })) : undefined })) });
}

export async function POST(request: Request) {
  if (!allowRequest(`buddy-post:${requestFingerprint(request)}`, 5, 24 * 60 * 60 * 1000)) return NextResponse.json({ message: "Denní limit příspěvků byl vyčerpán." }, { status: 429 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Parťáci vyžadují připojený Supabase Auth." }, { status: 503 });
  const profile = await getCurrentAccount(); if (!profile) return NextResponse.json({ message: "Pro zveřejnění se přihlaste." }, { status: 401 });
  if (profile.accountStatus!=="active") return NextResponse.json({ message: "Váš účet má pozastavené komunitní publikování." }, { status: 403 });
  if(!profile.complete) return NextResponse.json({message:"Před zveřejněním doplňte přezdívku, uživatelské jméno a souhlas s pravidly.",profileRequired:true},{status:428});
  const parsed = buddyPostSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte příspěvek.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const city = await getPublishedCity(parsed.data.cityId || defaultCitySlug); if (!city) return NextResponse.json({ message: "Město není aktivní." }, { status: 422 });
  const startsAt = new Date(parsed.data.startsAt); const expiresAt = new Date(startsAt.getTime() + 12 * 60 * 60 * 1000);
  const saved = await insertRecord("buddy_posts", { owner_id: profile.id, city_id: city.id, activity_type: parsed.data.activityType, approximate_location: parsed.data.approximateLocation, starts_at: startsAt.toISOString(), description: parsed.data.description, max_participants: parsed.data.maxParticipants, status: "active", moderation_status: "approved", expires_at: expiresAt.toISOString() });
  return NextResponse.json({ id: saved.id, message: "Příspěvek je zveřejněný. Kdykoli jej můžete upravit, uzavřít nebo odstranit." }, { status: 201 });
}
