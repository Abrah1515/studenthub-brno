"use client";
/* Signed private avatars expire; bypass the Next image optimizer cache. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { Archive, MessageCircle, RefreshCw, UserRound, X } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChatConversation } from "@/lib/chat-types";
import { ChatComposerCard } from "@/components/chat-composer-card";
import { createChatRealtimeTopic } from "@/lib/chat-realtime";

export function ChatInbox() {
  const router = useRouter();
  const params = useSearchParams(); const compose = params.get("compose"); const target = compose ? { contextType: compose as "profile" | "buddy_post" | "marketplace_listing", contextId: params.get("contextId") || undefined, recipientUsername: params.get("to") || undefined, label: params.get("label") || undefined } : null;
  const [tab, setTab] = useState<"messages" | "requests" | "archived">("messages"); const [items, setItems] = useState<ChatConversation[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const requestId = useRef(0); const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const activeId = ++requestId.current; controller.current?.abort(); const activeController = new AbortController(); controller.current = activeController;
    const current = () => requestId.current === activeId && !activeController.signal.aborted;
    setLoading(true); setError("");
    try {
      const bootstrap = await fetch("/api/chat/bootstrap", { cache: "no-store", signal: activeController.signal });
      if (!current()) return;
      if (!bootstrap.ok) { setError("Konverzace se nepodařilo načíst."); return; }
      const session = await bootstrap.json();
      if (!current()) return;
      if (!session.authenticated) { setItems([]); setError("Pro soukromé zprávy se nejprve přihlaste."); return; }
      const response = await fetch(`/api/chat/conversations?tab=${tab}`, { cache: "no-store", signal: activeController.signal });
      if (!current()) return;
      if (!response.ok) { setError(response.status === 401 ? "Přihlášení vypršelo. Přihlaste se znovu." : "Konverzace se nepodařilo načíst."); return; }
      const payload = await response.json();
      if (!current()) return;
      setItems(payload.items || []); setError("");
    } catch (loadError) {
      if (!current() || (loadError instanceof DOMException && loadError.name === "AbortError")) return;
      setError("Konverzace se nepodařilo načíst.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [tab]);
  useEffect(() => { void refresh(); return () => controller.current?.abort(); }, [refresh]);
  useEffect(() => {
    const visible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("focus", visible); window.addEventListener("online", visible); document.addEventListener("visibilitychange", visible);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const client = url && key ? createBrowserClient(url, key) : null;
    const channel = client?.channel(createChatRealtimeTopic("inbox"))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_conversations" }, refresh)
      .subscribe();
    return () => { window.removeEventListener("focus", visible); window.removeEventListener("online", visible); document.removeEventListener("visibilitychange", visible); if (client && channel) void client.removeChannel(channel); };
  }, [refresh]);
  function selectTab(next: "messages" | "requests" | "archived") { if (next === tab) return; controller.current?.abort(); setLoading(true); setError(""); setItems([]); setTab(next); }
  return <div className="chat-page"><div className="page-heading"><div><p className="eyebrow">Soukromé zprávy</p><h1>Chat</h1><p>Konverzace jsou viditelné jen jejich účastníkům. StudentHub nepoužívá end-to-end šifrování.</p></div><button className="button button-secondary" onClick={refresh}><RefreshCw size={16} />Obnovit</button></div>{target && <ChatComposerCard target={target} onClose={() => router.replace("/chat")} />}
    <div className="chat-tabs" role="tablist" aria-label="Typ konverzací"><button role="tab" aria-selected={tab === "messages"} className={tab === "messages" ? "active" : ""} onClick={() => selectTab("messages")}>Zprávy</button><button role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "active" : ""} onClick={() => selectTab("requests")}>Žádosti</button><button role="tab" aria-selected={tab === "archived"} className={tab === "archived" ? "active" : ""} onClick={() => selectTab("archived")}><Archive size={15} />Archiv</button></div>
    {loading ? <div className="chat-list-state">Načítám konverzace…</div> : error ? <div className="chat-list-state"><X /><p>{error}</p><Link className="button button-primary" href={`/ucet/prihlaseni?next=${encodeURIComponent("/chat")}`}>Přihlásit se</Link></div> : items.length === 0 ? <div className="chat-list-state"><MessageCircle size={34} /><h2>{tab === "requests" ? "Žádné nové žádosti" : "Zatím tu nic není"}</h2><p>Konverzaci zahájíte tlačítkem Napsat u veřejného profilu, příspěvku Hledám parťáka nebo burzovního inzerátu.</p></div> : <div className="chat-list">{items.map((item) => <Link key={item.id} href={`/chat/${item.id}`} className={item.unreadCount ? "chat-list-item unread" : "chat-list-item"}><span className="chat-avatar">{item.other.avatarUrl ? <img src={item.other.avatarUrl} alt="" /> : <UserRound size={20} />}</span><span className="chat-list-copy"><strong>{item.other.displayName}</strong><small>{item.lastMessage?.body || item.context.title}</small><em>{item.context.active ? item.context.title : "Obsah už není aktivní"}</em></span><span className="chat-list-meta"><time>{new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(new Date(item.updatedAt))}</time>{item.unreadCount > 0 && <b aria-label={`${item.unreadCount} nepřečtených`}>{item.unreadCount}</b>}</span></Link>)}</div>}
  </div>;
}
