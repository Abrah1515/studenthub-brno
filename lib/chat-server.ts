import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import type { AccountProfile } from "@/lib/user-auth";
import type { ChatContext, ChatConversation, ChatContextType, ChatMessage } from "@/lib/chat-types";
import { sendPendingPushNotifications } from "@/lib/push-notifications";

type DbRow = Record<string, unknown>;

export async function createAuthenticatedChatClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("chat_storage_unavailable");
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: { getAll: () => store.getAll(), setAll: () => undefined },
  });
}

export function chatError(error: unknown) {
  const source = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  const known: Record<string, { status: number; message: string }> = {
    chat_storage_unavailable: { status: 503, message: "Chat je dočasně nedostupný." },
    chat_profile_incomplete: { status: 428, message: "Před použitím chatu dokončete profil a přijměte pravidla komunity." },
    chat_recipient_unavailable: { status: 403, message: "Tomuto profilu nyní nelze napsat." },
    chat_blocked: { status: 403, message: "Konverzace není kvůli blokování dostupná." },
    chat_request_rate_limit: { status: 429, message: "Denní limit nových žádostí byl vyčerpán." },
    chat_message_rate_limit: { status: 429, message: "Zprávy posíláte příliš rychle. Zkuste to za chvíli." },
    chat_request_one_message_only: { status: 409, message: "Před přijetím žádosti lze poslat jen jednu zprávu." },
    chat_declined_cooldown: { status: 409, message: "Odmítnutou žádost lze ve stejném kontextu obnovit až po 30 dnech." },
    chat_invalid_participants: { status: 422, message: "Sami sobě napsat nemůžete." },
    chat_invalid_context: { status: 422, message: "Neplatný kontext konverzace." },
    chat_context_unavailable: { status: 404, message: "Původní obsah už není dostupný pro novou konverzaci." },
    chat_membership_required: { status: 403, message: "Do této konverzace nemáte přístup." },
    chat_sender_mismatch: { status: 403, message: "Odesílatele zprávy nelze změnit." },
    chat_not_writable: { status: 409, message: "Do této konverzace nyní nelze psát." },
    chat_not_active: { status: 409, message: "Konverzace není aktivní." },
  };
  const key = Object.keys(known).find((candidate) => source.includes(candidate));
  return key ? known[key] : { status: 500, message: "Chatovou operaci se nepodařilo dokončit." };
}

function displayBody(row: DbRow) {
  if (row.status === "hidden") return "Zpráva byla skryta moderátorem.";
  if (row.status === "deleted") return "Zpráva byla odstraněna.";
  return String(row.body || "");
}

function serializeMessage(row: DbRow, viewerId: string): ChatMessage {
  return {
    id: String(row.id), senderId: String(row.sender_id), body: displayBody(row),
    state: String(row.status || "active") as ChatMessage["state"], createdAt: String(row.created_at),
    own: String(row.sender_id) === viewerId,
  };
}

async function chatIdentity(service: SupabaseClient, id: string) {
  const { data } = await service.from("profiles").select("id,username,display_name,avatar_path,avatar_url,account_status").eq("id", id).maybeSingle();
  if (!data) return { id, username: null, displayName: "Nedostupný profil" };
  let avatarUrl = /^https:\/\//.test(String(data.avatar_url || "")) ? String(data.avatar_url) : undefined;
  if (data.avatar_path) {
    const signed = await service.storage.from("profile-avatars").createSignedUrl(String(data.avatar_path), 3600);
    avatarUrl = signed.data?.signedUrl || avatarUrl;
  }
  return {
    id, username: data.username ? String(data.username) : null,
    displayName: data.account_status === "deleted" ? "Odstraněný profil" : String(data.display_name || "Student"),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export async function resolveChatContext(service: SupabaseClient, type: ChatContextType, id: string): Promise<ChatContext> {
  if (type === "profile") {
    const { data } = await service.from("profiles").select("id,username,display_name,profile_visibility,account_status").eq("id", id).maybeSingle();
    const active = data?.account_status === "active";
    return { type, id, title: data ? `Profil: ${String(data.display_name || "Student")}` : "Původní profil", href: active && data?.profile_visibility === "public" && data.username ? `/profil/${data.username}` : null, active };
  }
  if (type === "buddy_post") {
    const { data } = await service.from("buddy_posts").select("id,activity_type,approximate_location,description,status,moderation_status,expires_at").eq("id", id).maybeSingle();
    const active = Boolean(data && data.status === "active" && data.moderation_status === "approved" && new Date(String(data.expires_at)).getTime() > Date.now());
    const title = data ? String(data.description || "Hledám parťáka").replace(/\s+/g, " ").slice(0, 80) : "Původní příspěvek Hledám parťáka";
    return { type, id, title: `Reakce na: ${title}`, detail: data?.approximate_location ? String(data.approximate_location) : undefined, href: active ? `/partak?post=${id}` : null, active };
  }
  const { data } = await service.from("marketplace_listings").select("id,title,price_mode,price_amount,status,expires_at").eq("id", id).maybeSingle();
  const active = Boolean(data && ["active", "reserved"].includes(String(data.status)) && (!data.expires_at || new Date(String(data.expires_at)).getTime() > Date.now()));
  const price = data?.price_mode === "free" ? "Zdarma" : data?.price_amount != null ? `${Number(data.price_amount).toLocaleString("cs-CZ")} Kč` : "Dohodou";
  return { type, id, title: data ? String(data.title) : "Původní burzovní inzerát", detail: data ? `${price} · ${data.status === "reserved" ? "rezervováno" : active ? "aktivní" : "neaktivní"}` : undefined, href: active ? `/brno/burza/${id}` : null, active };
}

async function unreadFor(service: SupabaseClient, conversationId: string, viewerId: string, lastReadAt: unknown) {
  let query = service.from("chat_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).neq("sender_id", viewerId).eq("status", "active");
  if (lastReadAt) query = query.gt("created_at", String(lastReadAt));
  const { count } = await query;
  return count || 0;
}

async function conversationFromRows(service: SupabaseClient, conversation: DbRow, member: DbRow, viewerId: string, withLatest = true): Promise<ChatConversation> {
  const otherId = String(conversation.initiator_id) === viewerId ? String(conversation.recipient_id) : String(conversation.initiator_id);
  const [other, context, latestResult, unreadCount] = await Promise.all([
    chatIdentity(service, otherId),
    resolveChatContext(service, String(conversation.context_type) as ChatContextType, String(conversation.context_id)),
    withLatest ? service.from("chat_messages").select("*").eq("conversation_id", String(conversation.id)).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    unreadFor(service, String(conversation.id), viewerId, member.last_read_at),
  ]);
  const status = String(conversation.status) as ChatConversation["status"];
  const requestedByMe = String(conversation.initiator_id) === viewerId;
  return {
    id: String(conversation.id), status, requestedByMe,
    canSend: status === "active" || (status === "requested" && !requestedByMe),
    canAccept: status === "requested" && !requestedByMe,
    archived: Boolean(member.archived_at), mutedUntil: member.muted_until ? String(member.muted_until) : null,
    other, context,
    lastMessage: latestResult.data ? serializeMessage(latestResult.data as DbRow, viewerId) : null,
    unreadCount, updatedAt: String(conversation.last_message_at || conversation.updated_at || conversation.created_at),
  };
}

export async function listChatConversations(account: AccountProfile, tab: "messages" | "requests" | "archived" = "messages") {
  if (!isSupabaseConfigured()) return [];
  const service = createServiceClient();
  let membersQuery = service.from("chat_conversation_members").select("*").eq("profile_id", account.id).is("left_at", null).order("updated_at", { ascending: false }).limit(100);
  membersQuery = tab === "archived" ? membersQuery.not("archived_at", "is", null) : membersQuery.is("archived_at", null);
  const { data: members, error } = await membersQuery;
  if (error || !members?.length) return [];
  const { data: conversations } = await service.from("chat_conversations").select("*").in("id", members.map((row) => row.conversation_id));
  const byId = new Map((conversations || []).map((row) => [String(row.id), row as DbRow]));
  const filtered = members.filter((member) => {
    const row = byId.get(String(member.conversation_id));
    if (!row) return false;
    const incomingRequest = row.status === "requested" && String(row.recipient_id) === account.id;
    return tab === "requests" ? incomingRequest : !incomingRequest;
  });
  const items = await Promise.all(filtered.map((member) => conversationFromRows(service, byId.get(String(member.conversation_id))!, member as DbRow, account.id)));
  return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getChatConversation(account: AccountProfile, id: string) {
  if (!isSupabaseConfigured()) return null;
  const service = createServiceClient();
  const [{ data: conversation }, { data: member }] = await Promise.all([
    service.from("chat_conversations").select("*").eq("id", id).maybeSingle(),
    service.from("chat_conversation_members").select("*").eq("conversation_id", id).eq("profile_id", account.id).maybeSingle(),
  ]);
  if (!conversation || !member || member.left_at) return null;
  return conversationFromRows(service, conversation as DbRow, member as DbRow, account.id, false);
}

export async function listChatMessages(account: AccountProfile, conversationId: string, before?: string | null, limit = 30) {
  if (!isSupabaseConfigured()) return { items: [] as ChatMessage[], nextCursor: null as string | null };
  const service = createServiceClient();
  const { data: member } = await service.from("chat_conversation_members").select("conversation_id").eq("conversation_id", conversationId).eq("profile_id", account.id).is("left_at", null).maybeSingle();
  if (!member) throw new Error("chat_membership_required");
  let query = service.from("chat_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(Math.min(50, limit + 1));
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || []; const hasMore = rows.length > limit; const page = rows.slice(0, limit); const nextCursor = hasMore ? String(page.at(-1)?.created_at) : null;
  return { items: page.reverse().map((row) => serializeMessage(row as DbRow, account.id)), nextCursor };
}

export async function markChatRead(account: AccountProfile, conversationId: string) {
  const service = createServiceClient();
  const { error } = await service.from("chat_conversation_members").update({ last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("conversation_id", conversationId).eq("profile_id", account.id).is("left_at", null);
  if (error) throw error;
}

export async function notifyChatRecipient(conversationId: string, messageId: string, senderId: string, requestKind: boolean) {
  if (!isSupabaseConfigured()) return;
  const service = createServiceClient();
  const { data: conversation } = await service.from("chat_conversations").select("initiator_id,recipient_id").eq("id", conversationId).maybeSingle();
  if (!conversation) return;
  const recipientId = String(conversation.initiator_id) === senderId ? String(conversation.recipient_id) : String(conversation.initiator_id);
  const { data: membership } = await service.from("chat_conversation_members").select("muted_until,left_at").eq("conversation_id", conversationId).eq("profile_id", recipientId).maybeSingle();
  if (!membership || membership.left_at || (membership.muted_until && Date.parse(String(membership.muted_until)) > Date.now())) return;
  const { data: installations } = await service.from("anonymous_installations").select("id").eq("user_id", recipientId);
  if (!installations?.length) return;
  await service.from("internal_notifications").upsert(installations.map((installation) => ({
    installation_id: installation.id, target_type: "chat_conversation", target_id: conversationId,
    kind: requestKind ? "chat_request" : "chat_message",
    title: requestKind ? "Nová žádost o kontakt" : "Nová soukromá zpráva",
    body: requestKind ? "Někdo vám chce napsat ve StudentHubu." : "Máte novou soukromou zprávu ve StudentHubu.",
    destination_url: `/chat/${conversationId}`, dedupe_key: `chat:${messageId}`, available_at: new Date().toISOString(),
  })), { onConflict: "installation_id,dedupe_key", ignoreDuplicates: true });
  await sendPendingPushNotifications(20).catch((error) => console.error("chat_push_delivery_failed", { conversationId, messageId, error: error instanceof Error ? error.message : "unknown" }));
}
