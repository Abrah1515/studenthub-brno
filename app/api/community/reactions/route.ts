import { NextResponse } from "next/server";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityReactionSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/user-auth";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Reakce vyžadují připojený Supabase Auth." }, { status: 503 }); const user = await getCurrentUser(); if (!user) return NextResponse.json({ message: "Nejprve ověřte e-mail přihlašovacím odkazem." }, { status: 401 });
  if (!allowRequest(`community-reaction-ip:${requestFingerprint(request)}`, 80, 60 * 60 * 1000) || !allowRequest(`community-reaction-user:${user.id}`, 60, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit reakcí byl vyčerpán." }, { status: 429 });
  const parsed = communityReactionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatná reakce." }, { status: 422 }); const client = createServiceClient(); const table = parsed.data.targetType === "post" ? "community_posts" : "community_comments";
  const { data: target } = await client.from(table).select("*").eq("id", parsed.data.targetId).maybeSingle(); if (!target || target.status !== "active") return NextResponse.json({ message: "Obsah není dostupný." }, { status: 404 });
  if (parsed.data.targetType === "comment") {
    const { data: parent } = await client.from("community_posts").select("id").eq("id", String(target.post_id)).eq("status", "active").maybeSingle();
    if (!parent) return NextResponse.json({ message: "Obsah není dostupný." }, { status: 404 });
  }
  const { data: existing } = await client.from("community_reactions").select("id").eq("user_id", user.id).eq("target_type", parsed.data.targetType).eq("target_id", parsed.data.targetId).maybeSingle(); let active: boolean;
  if (existing) { const { error } = await client.from("community_reactions").delete().eq("id", existing.id).eq("user_id", user.id); if (error) return NextResponse.json({ message: "Reakci se nepodařilo odebrat." }, { status: 422 }); active = false; }
  else { const { error } = await client.from("community_reactions").insert({ user_id: user.id, target_type: parsed.data.targetType, target_id: parsed.data.targetId }); if (error) return NextResponse.json({ message: error.code === "23505" ? "Obsah už je označený." : "Reakci se nepodařilo uložit." }, { status: error.code === "23505" ? 409 : 422 }); active = true; }
  const { data: updated } = await client.from(table).select("helpful_count").eq("id", parsed.data.targetId).single(); return NextResponse.json({ active, helpfulCount: Number(updated?.helpful_count || 0) });
}
