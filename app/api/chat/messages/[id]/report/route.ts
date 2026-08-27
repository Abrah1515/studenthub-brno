import { NextResponse } from "next/server";
import { chatMessageReportSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";
import { createAuthenticatedChatClient } from "@/lib/chat-server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount(); if (!account) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 });
  const parsed = chatMessageReportSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte důvod hlášení." }, { status: 422 });
  const { id } = await params; const service = createServiceClient();
  const { data: message } = await service.from("chat_messages").select("id,sender_id,conversation_id").eq("id", id).maybeSingle();
  if (!message || message.sender_id === account.id) return NextResponse.json({ message: "Tuto zprávu nelze nahlásit." }, { status: 404 });
  const { data: member } = await service.from("chat_conversation_members").select("conversation_id").eq("conversation_id", message.conversation_id).eq("profile_id", account.id).maybeSingle(); if (!member) return NextResponse.json({ message: "Zpráva nebyla nalezena." }, { status: 404 });
  const authenticated = await createAuthenticatedChatClient(); const { data: allowed } = await authenticated.rpc("consume_chat_rate_limit", { target_action: "report", target_limit: 10, target_window_seconds: 86400 }); if (!allowed) return NextResponse.json({ message: "Denní limit hlášení byl vyčerpán." }, { status: 429 });
  const { error } = await service.from("chat_message_reports").upsert({ message_id: id, reporter_id: account.id, reason: parsed.data.reason, detail: parsed.data.detail }, { onConflict: "message_id,reporter_id", ignoreDuplicates: true });
  return error ? NextResponse.json({ message: "Hlášení se nepodařilo uložit." }, { status: 422 }) : NextResponse.json({ message: "Hlášení bylo bezpečně předáno moderátorům." }, { status: 201 });
}
