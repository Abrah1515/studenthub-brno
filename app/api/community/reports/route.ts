import { NextResponse } from "next/server";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityReportSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Hlášení vyžaduje připojený Supabase Auth." }, { status: 503 }); const user = await getCurrentAccount(); if (!user?.complete) return NextResponse.json({ message: "Pro hlášení se přihlaste a dokončete profil." }, { status: 401 }); if (user.accountStatus !== "active") return NextResponse.json({ message: "Účet je pozastavený." }, { status: 403 });
  if (!allowRequest(`community-report-ip:${requestFingerprint(request)}`, 12, 24 * 60 * 60 * 1000) || !allowRequest(`community-report-user:${user.id}`, 10, 24 * 60 * 60 * 1000)) return NextResponse.json({ message: "Denní limit hlášení byl vyčerpán." }, { status: 429 });
  const parsed = communityReportSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatné hlášení." }, { status: 422 }); const client = createServiceClient(); let cityId = "";
  if (parsed.data.targetType === "post") { const { data } = await client.from("community_posts").select("id,city_id,status,author_id").eq("id", parsed.data.targetId).maybeSingle(); if (!data || data.status === "deleted") return NextResponse.json({ message: "Obsah nebyl nalezen." }, { status: 404 }); if (data.author_id === user.id) return NextResponse.json({ message: "Vlastní obsah můžete upravit nebo odstranit." }, { status: 409 }); cityId = data.city_id; }
  else { const { data } = await client.from("community_comments").select("id,status,author_id,community_posts!inner(city_id)").eq("id", parsed.data.targetId).maybeSingle(); if (!data || data.status === "deleted") return NextResponse.json({ message: "Obsah nebyl nalezen." }, { status: 404 }); if (data.author_id === user.id) return NextResponse.json({ message: "Vlastní obsah můžete upravit nebo odstranit." }, { status: 409 }); const relation = data.community_posts as unknown as { city_id: string }; cityId = relation.city_id; }
  const { error } = await client.from("community_reports").insert({ reporter_id: user.id, target_type: parsed.data.targetType, target_id: parsed.data.targetId, reason: parsed.data.reason, detail: parsed.data.detail, city_id: cityId, status: "new" });
  if (error) return NextResponse.json({ message: error.code === "23505" ? "Tento obsah jste už nahlásili." : "Hlášení se nepodařilo uložit." }, { status: error.code === "23505" ? 409 : 422 }); return NextResponse.json({ message: "Hlášení jsme přijali k posouzení." }, { status: 201 });
}
