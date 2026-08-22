import { NextResponse } from "next/server";
import { cleanCommunityText, containsPersonalContact, looksLikeCommunitySpam, publicCommunityComment } from "@/lib/community";
import { allowRequest, requestFingerprint } from "@/lib/rate-limit";
import { communityCommentUpdateSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/user-auth";

type Context = { params: Promise<{ id: string }> };
async function owned(id: string, userId: string) { const { data } = await createServiceClient().from("community_comments").select("*").eq("id", id).eq("author_id", userId).maybeSingle(); return data; }

export async function PATCH(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Úložiště není připojené." }, { status: 503 }); const user = await getCurrentUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (!allowRequest(`community-comment-edit:${user.id}:${requestFingerprint(request)}`, 30, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit úprav byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const comment = await owned(id, user.id); if (!comment || comment.status !== "active") return NextResponse.json({ message: "Komentář nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const parsed = communityCommentUpdateSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Komentář má neplatný obsah." }, { status: 422 }); const body = cleanCommunityText(parsed.data.body, true); if (containsPersonalContact(body)) return NextResponse.json({ message: "Do veřejného textu nevkládejte e-mail ani telefon." }, { status: 422 }); if (looksLikeCommunitySpam(body)) return NextResponse.json({ message: "Komentář vypadá jako automatický spam." }, { status: 422 });
  const { data: saved, error } = await createServiceClient().from("community_comments").update({ body }).eq("id", id).eq("author_id", user.id).select("*").single(); if (error) return NextResponse.json({ message: "Komentář se nepodařilo upravit." }, { status: 422 }); return NextResponse.json({ item: publicCommunityComment(saved, { owned: true }), message: "Komentář byl upraven." });
}

export async function DELETE(request: Request, context: Context) {
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Úložiště není připojené." }, { status: 503 }); const user = await getCurrentUser(); if (!user) return NextResponse.json({ message: "Nepřihlášeno." }, { status: 401 });
  if (!allowRequest(`community-comment-delete:${user.id}:${requestFingerprint(request)}`, 12, 60 * 60 * 1000)) return NextResponse.json({ message: "Limit operací byl vyčerpán." }, { status: 429 });
  const id = (await context.params).id; const comment = await owned(id, user.id); if (!comment || comment.status === "deleted") return NextResponse.json({ message: "Komentář nebyl nalezen nebo vám nepatří." }, { status: 404 });
  const { error } = await createServiceClient().from("community_comments").update({ status: "deleted", is_best: false, deleted_at: new Date().toISOString() }).eq("id", id).eq("author_id", user.id); if (error) return NextResponse.json({ message: "Komentář se nepodařilo odstranit." }, { status: 422 }); return new NextResponse(null, { status: 204 });
}
