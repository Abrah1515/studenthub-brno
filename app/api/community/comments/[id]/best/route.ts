import { NextResponse } from "next/server";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
export async function POST(_request: Request, context: Context) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Úložiště není připojené." }, { status: 503 }); const user = await getCurrentUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  const id = (await context.params).id; const client = createServiceClient(); const { data: comment } = await client.from("community_comments").select("id,post_id,status,is_best").eq("id", id).maybeSingle(); if (!comment || comment.status !== "active") return NextResponse.json({ message: "Odpověď není dostupná." }, { status: 404 });
  const { data: post } = await client.from("community_posts").select("id,author_id,status").eq("id", comment.post_id).maybeSingle(); if (!post || post.author_id !== user.id || post.status !== "active") return NextResponse.json({ message: "Nejužitečnější odpověď může vybrat pouze autor příspěvku." }, { status: 403 });
  await client.from("community_comments").update({ is_best: false }).eq("post_id", post.id).eq("is_best", true); const next = !comment.is_best; if (next) { const { error } = await client.from("community_comments").update({ is_best: true }).eq("id", id); if (error) return NextResponse.json({ message: "Odpověď se nepodařilo označit." }, { status: 422 }); }
  return NextResponse.json({ isBest: next, message: next ? "Odpověď je označená jako nejužitečnější." : "Označení bylo odebráno." });
}
