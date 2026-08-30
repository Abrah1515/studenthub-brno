import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { chatConversationActionSchema, chatMessageReportSchema, chatMessageSchema, chatStartSchema } from "@/lib/schemas";
import { createChatRealtimeTopic } from "@/lib/chat-realtime";

const migration = readFileSync("supabase/migrations/202608260032_private_chat.sql", "utf8");
const bootstrapRoute = readFileSync("app/api/chat/bootstrap/route.ts", "utf8");
const chatLoginLinks = `${readFileSync("components/chat-inbox.tsx", "utf8")}\n${readFileSync("components/chat-composer-card.tsx", "utf8")}`;
const chatDock = readFileSync("components/chat-dock.tsx", "utf8");
const siteShell = readFileSync("components/site-shell.tsx", "utf8");

describe("soukromý chat", () => {
  it("validuje kontext, nonce a délku textu", () => {
    expect(chatStartSchema.safeParse({ contextType: "profile", recipientUsername: "student", message: "Ahoj", clientNonce: crypto.randomUUID() }).success).toBe(true);
    expect(chatStartSchema.safeParse({ contextType: "buddy_post", message: "Ahoj", clientNonce: crypto.randomUUID() }).success).toBe(false);
    expect(chatMessageSchema.safeParse({ message: "x".repeat(2001), clientNonce: crypto.randomUUID() }).success).toBe(false);
    expect(chatConversationActionSchema.safeParse({ action: "mute", until: new Date().toISOString() }).success).toBe(true);
    expect(chatMessageReportSchema.safeParse({ reason: "unsafe_meeting", detail: "" }).success).toBe(true);
  });

  it("odděluje konverzace, členství, zprávy, hlášení a audit", () => {
    for (const table of ["chat_conversations", "chat_conversation_members", "chat_messages", "chat_message_reports", "chat_moderation_actions"]) expect(migration).toContain(`public.${table}`);
    expect(migration).toContain("context_type in ('profile','buddy_post','marketplace_listing')");
    expect(migration).toContain("unique (sender_id,client_nonce)");
    expect(migration).toContain("chat_conversations_open_context_idx");
    expect(migration).toContain("char_length(btrim(body)) between 1 and 2000");
  });

  it("vynucuje žádost, blokování, serverovou identitu a RLS", () => {
    expect(migration).toContain("chat_request_one_message_only");
    expect(migration).toContain("chat_sender_mismatch");
    expect(migration).toContain("chat_profiles_blocked");
    expect(migration).toContain("members read chat conversations");
    expect(migration).toContain("members or report moderators read chat messages");
    expect(migration).toMatch(/revoke all on public\.chat_conversations[\s\S]+from anon,authenticated/i);
    expect(migration).not.toMatch(/grant (?:insert|update|delete|all) on public\.chat_messages to authenticated/i);
  });

  it("anonymní navigace nečeká na vzdálené ověření neexistující session", () => {
    expect(bootstrapRoute).toContain("sb-[^=;]+-auth-token");
    expect(bootstrapRoute.indexOf("auth-token")).toBeLessThan(bootstrapRoute.indexOf("getCurrentAccount()"));
  });

  it("každý realtime odběr dostane vlastní kanál i při více badge komponentách", () => {
    const first = createChatRealtimeTopic("unread");
    const second = createChatRealtimeTopic("unread");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^studenthub-chat-unread-[a-f0-9-]{36}$/);
  });

  it("anonymní chat vede na existující přihlašovací stránku a zachová návrat", () => {
    expect(chatLoginLinks).toContain("/ucet/prihlaseni?next=");
    expect(chatLoginLinks).not.toMatch(/\/ucet\?next=/);
  });

  it("na samostatných chatových routách dock vůbec nevykreslí a nemá nepravý modální focus trap", () => {
    expect(siteShell).toContain('!pathname.startsWith("/chat") && <ChatDock />');
    expect(chatDock).toContain('aria-modal="false"');
    expect(chatDock).not.toContain('event.key !== "Tab"');
    expect(chatDock).toContain("chatDockPrioritySurfaceSelector");
    expect(chatDock).toContain("minimized: true");
    expect(chatDock).toContain("lastPath.current === pathname");
  });
});
