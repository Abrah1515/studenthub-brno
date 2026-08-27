import { NextResponse } from "next/server";
import { chatError, getChatConversation, markChatRead } from "@/lib/chat-server";
import { chatConversationActionSchema } from "@/lib/schemas";
import { createServiceClient } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

async function owned(id: string, profileId: string) {
  const service = createServiceClient();
  const [{ data: conversation }, { data: member }] = await Promise.all([service.from("chat_conversations").select("*").eq("id", id).maybeSingle(), service.from("chat_conversation_members").select("*").eq("conversation_id", id).eq("profile_id", profileId).maybeSingle()]);
  return conversation && member && !member.left_at ? { service, conversation, member } : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount(); if (!account) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 });
  const { id } = await params; const conversation = await getChatConversation(account, id);
  return conversation ? NextResponse.json({ conversation }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ message: "Konverzace nebyla nalezena." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount(); if (!account) return NextResponse.json({ message: "Přihlaste se." }, { status: 401 });
  const parsed = chatConversationActionSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Neplatná akce." }, { status: 422 });
  const { id } = await params; const scope = await owned(id, account.id); if (!scope) return NextResponse.json({ message: "Konverzace nebyla nalezena." }, { status: 404 });
  const { service, conversation } = scope; const now = new Date().toISOString(); const action = parsed.data.action;
  try {
    if (action === "read") await markChatRead(account, id);
    else if (action === "accept") {
      if (conversation.status !== "requested" || conversation.recipient_id !== account.id) return NextResponse.json({ message: "Žádost nelze přijmout." }, { status: 409 });
      const { error } = await service.from("chat_conversations").update({ status: "active", accepted_at: now, updated_at: now }).eq("id", id).eq("status", "requested"); if (error) throw error;
    } else if (action === "decline") {
      if (conversation.status !== "requested" || conversation.recipient_id !== account.id) return NextResponse.json({ message: "Žádost nelze odmítnout." }, { status: 409 });
      const until = new Date(Date.now() + 30 * 86400000).toISOString(); const { error } = await service.from("chat_conversations").update({ status: "declined", declined_at: now, decline_until: until, updated_at: now }).eq("id", id).eq("status", "requested"); if (error) throw error;
    } else if (action === "archive" || action === "unarchive") { const { error } = await service.from("chat_conversation_members").update({ archived_at: action === "archive" ? now : null, updated_at: now }).eq("conversation_id", id).eq("profile_id", account.id); if (error) throw error; }
    else if (action === "mute") { const { error } = await service.from("chat_conversation_members").update({ muted_until: parsed.data.until, updated_at: now }).eq("conversation_id", id).eq("profile_id", account.id); if (error) throw error; }
    else if (action === "leave") {
      const { error: memberError } = await service.from("chat_conversation_members").update({ left_at: now, updated_at: now }).eq("conversation_id", id).eq("profile_id", account.id); if (memberError) throw memberError;
      const { error: conversationError } = await service.from("chat_conversations").update({ status: "left", updated_at: now }).eq("id", id); if (conversationError) throw conversationError;
    }
    else if (action === "block") {
      const otherId = conversation.initiator_id === account.id ? conversation.recipient_id : conversation.initiator_id;
      const { error } = await service.from("profile_blocks").upsert({ blocker_id: account.id, blocked_id: otherId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true }); if (error) throw error;
    }
    return NextResponse.json({ conversation: action === "leave" ? null : await getChatConversation(account, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const safe = chatError(error); return NextResponse.json({ message: safe.message }, { status: safe.status }); }
}
