"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ChatComposerTarget } from "@/components/chat-start-button";

export function ChatComposerCard({ target, onClose, dock = false }: { target: ChatComposerTarget; onClose: () => void; dock?: boolean }) {
  const router = useRouter(); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); if (!message.trim()) return;
    setBusy(true);
    const response = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, message, clientNonce: crypto.randomUUID() }) }).catch(() => null);
    const body = await response?.json().catch(() => ({})); setBusy(false);
    if (!response?.ok) { if (response?.status === 401) router.push(`/ucet/prihlaseni?next=${encodeURIComponent(location.pathname)}`); else if (response?.status === 428) router.push("/nastaveni"); else setError(body?.message || "Žádost se nepodařilo odeslat."); return; }
    const id = body.conversation?.id; if (!id) return;
    if (dock) window.dispatchEvent(new CustomEvent("studenthub-open-chat", { detail: { id } })); else router.replace(`/chat/${id}`);
  }
  return <section className="chat-compose-card" aria-labelledby="chat-compose-title"><header><div><strong id="chat-compose-title">Nová soukromá zpráva</strong><small>{target.label || target.recipientUsername || "Kontakt z veřejného obsahu"}</small></div><button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít"><X size={18} /></button></header><form onSubmit={submit}><label htmlFor="chat-first-message">První zpráva</label><textarea id="chat-first-message" autoFocus maxLength={2000} rows={dock ? 8 : 5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Napište stručně, proč se ozýváte…" /><small>Do přijetí žádosti lze poslat pouze tuto jednu zprávu. Nesdílejte citlivé údaje.</small>{error && <p className="form-message error" role="alert">{error}</p>}<button className="button button-primary" disabled={busy || !message.trim()}>{busy ? "Odesílám…" : <><Send size={16} />Odeslat žádost</>}</button></form></section>;
}
