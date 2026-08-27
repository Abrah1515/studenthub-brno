"use client";
/* Signed private avatars expire; bypass the Next image optimizer cache. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { Archive, MessageCircle, RefreshCw, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChatConversation } from "@/lib/chat-types";
import { ChatComposerCard } from "@/components/chat-composer-card";

export function ChatInbox() {
  const router = useRouter();
  const params = useSearchParams(); const compose = params.get("compose"); const target = compose ? { contextType: compose as "profile" | "buddy_post" | "marketplace_listing", contextId: params.get("contextId") || undefined, recipientUsername: params.get("to") || undefined, label: params.get("label") || undefined } : null;
  const [tab, setTab] = useState<"messages" | "requests" | "archived">("messages"); const [items, setItems] = useState<ChatConversation[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    const bootstrap = await fetch("/api/chat/bootstrap", { cache: "no-store" }).catch(() => null);
    if (!bootstrap?.ok) { setLoading(false); setError("Konverzace se nepodařilo načíst."); return; }
    const session = await bootstrap.json();
    if (!session.authenticated) { setItems([]); setLoading(false); setError("Pro soukromé zprávy se nejprve přihlaste."); return; }
    const response = await fetch(`/api/chat/conversations?tab=${tab}`, { cache: "no-store" }).catch(() => null);
    setLoading(false);
    if (!response?.ok) { setError(response?.status === 401 ? "Přihlášení vypršelo. Přihlaste se znovu." : "Konverzace se nepodařilo načíst."); return; }
    setItems((await response.json()).items || []); setError("");
  }, [tab]);
  useEffect(() => { void refresh(); }, [refresh]);
  return <div className="chat-page"><div className="page-heading"><div><p className="eyebrow">Soukromé zprávy</p><h1>Chat</h1><p>Konverzace jsou viditelné jen jejich účastníkům. StudentHub nepoužívá end-to-end šifrování.</p></div><button className="button button-secondary" onClick={refresh}><RefreshCw size={16} />Obnovit</button></div>{target && <ChatComposerCard target={target} onClose={() => router.replace("/chat")} />}
    <div className="chat-tabs" role="tablist" aria-label="Typ konverzací"><button role="tab" aria-selected={tab === "messages"} className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>Zprávy</button><button role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Žádosti</button><button role="tab" aria-selected={tab === "archived"} className={tab === "archived" ? "active" : ""} onClick={() => setTab("archived")}><Archive size={15} />Archiv</button></div>
    {loading ? <div className="chat-list-state">Načítám konverzace…</div> : error ? <div className="chat-list-state"><X /><p>{error}</p><Link className="button button-primary" href={`/ucet?next=${encodeURIComponent("/chat")}`}>Přihlásit se</Link></div> : items.length === 0 ? <div className="chat-list-state"><MessageCircle size={34} /><h2>{tab === "requests" ? "Žádné nové žádosti" : "Zatím tu nic není"}</h2><p>Konverzaci zahájíte tlačítkem Napsat u veřejného profilu, příspěvku Hledám parťáka nebo burzovního inzerátu.</p></div> : <div className="chat-list">{items.map((item) => <Link key={item.id} href={`/chat/${item.id}`} className={item.unreadCount ? "chat-list-item unread" : "chat-list-item"}><span className="chat-avatar">{item.other.avatarUrl ? <img src={item.other.avatarUrl} alt="" /> : <UserRound size={20} />}</span><span className="chat-list-copy"><strong>{item.other.displayName}</strong><small>{item.lastMessage?.body || item.context.title}</small><em>{item.context.active ? item.context.title : "Obsah už není aktivní"}</em></span><span className="chat-list-meta"><time>{new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(new Date(item.updatedAt))}</time>{item.unreadCount > 0 && <b aria-label={`${item.unreadCount} nepřečtených`}>{item.unreadCount}</b>}</span></Link>)}</div>}
  </div>;
}
