import { NextResponse } from "next/server";
import { ensureInstallation, installationCookie } from "@/lib/installation";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  if (!/(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookieHeader)) {
    return NextResponse.json({ authenticated: false, unreadCount: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ authenticated: false, unreadCount: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  if (!isSupabaseConfigured()) return NextResponse.json({ authenticated: true, available: false, unreadCount: 0 }, { status: 503 });
  const { identity, row } = await ensureInstallation(request, { cityId: account.cityId || "brno", universityId: account.universityId, facultyId: account.facultyId, studyYear: account.studyYear });
  await createServiceClient().from("anonymous_installations").update({ user_id: account.id, last_seen_at: new Date().toISOString() }).eq("id", row.id);
  const service = createServiceClient();
  const { data: members } = await service.from("chat_conversation_members").select("conversation_id,last_read_at").eq("profile_id", account.id).is("left_at", null);
  let unreadCount = 0;
  for (const member of members || []) {
    let query = service.from("chat_messages").select("id", { count: "exact", head: true }).eq("conversation_id", member.conversation_id).neq("sender_id", account.id).eq("status", "active");
    if (member.last_read_at) query = query.gt("created_at", member.last_read_at);
    unreadCount += (await query).count || 0;
  }
  const response = NextResponse.json({ authenticated: true, available: account.complete && account.accountStatus === "active", unreadCount }, { headers: { "Cache-Control": "private, no-store" } });
  installationCookie(response, identity);
  return response;
}
