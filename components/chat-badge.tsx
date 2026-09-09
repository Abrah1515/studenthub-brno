"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createChatRealtimeTopic } from "@/lib/chat-realtime";
import { createAuthenticatedRealtimeClient } from "@/lib/authenticated-realtime";

export const chatUnreadEvent = "studenthub-chat-unread";

export function ChatBadge({ compact = false }: { compact?: boolean }) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/chat/bootstrap", { cache: "no-store" }).catch(() => null); if (!response?.ok) return;
    const body = await response.json(); setCount(Number(body.unreadCount || 0));
  }, []);
  useEffect(() => {
    void refresh();
    const update = (event: Event) => { const next = (event as CustomEvent<number>).detail; if (Number.isFinite(next)) setCount(next); else void refresh(); };
    const visible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener(chatUnreadEvent, update); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(() => document.visibilityState === "visible" && void refresh(), 30000);
    let disposed=false; let realtime: Awaited<ReturnType<typeof createAuthenticatedRealtimeClient>>=null; let channel: RealtimeChannel|null=null;
    void createAuthenticatedRealtimeClient().then((client)=>{ if(disposed||!client)return; realtime=client; channel=client.channel(createChatRealtimeTopic("unread")).on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, refresh).subscribe(); });
    return () => { disposed=true; window.removeEventListener(chatUnreadEvent, update); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); window.clearInterval(timer); if (realtime && channel) void realtime.removeChannel(channel); };
  }, [refresh]);
  if (!count) return null;
  return <span className={compact ? "chat-badge compact" : "chat-badge"} aria-label={`${count} nepřečtených zpráv`}>{count > 99 ? "99+" : count}</span>;
}
