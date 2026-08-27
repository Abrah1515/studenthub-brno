"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const client = url && key ? createBrowserClient(url, key) : null;
    const channel = client?.channel("chat-unread").on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, refresh).subscribe();
    return () => { window.removeEventListener(chatUnreadEvent, update); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); window.clearInterval(timer); if (client && channel) void client.removeChannel(channel); };
  }, [refresh]);
  if (!count) return null;
  return <span className={compact ? "chat-badge compact" : "chat-badge"} aria-label={`${count} nepřečtených zpráv`}>{count > 99 ? "99+" : count}</span>;
}
