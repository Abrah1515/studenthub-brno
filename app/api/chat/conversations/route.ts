import { NextResponse } from "next/server";
import { chatError, createAuthenticatedChatClient, getChatConversation, listChatConversations, notifyChatRecipient } from "@/lib/chat-server";
import { chatStartSchema } from "@/lib/schemas";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { getCurrentAccount } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ message: "Pro zobrazení chatu se přihlaste." }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("tab");
  const tab = raw === "requests" || raw === "archived" ? raw : "messages";
  return NextResponse.json({ items: await listChatConversations(account, tab) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return NextResponse.json({ message: "Pro odeslání zprávy se přihlaste." }, { status: 401 });
  if (!account.complete || account.accountStatus !== "active") return NextResponse.json({ message: "Před použitím chatu dokončete aktivní profil.", profileRequired: true }, { status: 428 });
  if (!isSupabaseConfigured()) return NextResponse.json({ message: "Chat vyžaduje produkční databázi." }, { status: 503 });
  const parsed = chatStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Zkontrolujte příjemce a zprávu.", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  const service = createServiceClient();
  let recipientId: string | null = null; let contextId = parsed.data.contextId || null;
  if (parsed.data.contextType === "profile") {
    const { data } = await service.from("profiles").select("id").eq("username", parsed.data.recipientUsername).maybeSingle();
    recipientId = data ? String(data.id) : null; contextId = recipientId;
  } else if (parsed.data.contextType === "buddy_post") {
    const { data } = await service.from("buddy_posts").select("owner_id").eq("id", contextId).maybeSingle(); recipientId = data ? String(data.owner_id) : null;
  } else {
    const { data } = await service.from("marketplace_listings").select("seller_id").eq("id", contextId).maybeSingle(); recipientId = data?.seller_id ? String(data.seller_id) : null;
  }
  if (!recipientId || !contextId) return NextResponse.json({ message: "Příjemce nebo původní obsah není dostupný." }, { status: 404 });
  try {
    const messageNonce = parsed.data.clientNonce;
    const client = await createAuthenticatedChatClient();
    const { data: conversationId, error } = await client.rpc("start_chat_request", { target_profile: recipientId, target_context_type: parsed.data.contextType, target_context_id: contextId, first_body: parsed.data.message, message_nonce: messageNonce });
    if (error) throw error;
    const { data: first } = await service.from("chat_messages").select("id").eq("conversation_id", conversationId).eq("sender_id", account.id).eq("client_nonce", messageNonce).maybeSingle();
    if (first) await notifyChatRecipient(String(conversationId), String(first.id), account.id, true);
    return NextResponse.json({ conversation: await getChatConversation(account, String(conversationId)) }, { status: first ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const safe = chatError(error); console.error("chat_start_failed", { userId: account.id, code: safe.status });
    return NextResponse.json({ message: safe.message }, { status: safe.status });
  }
}
