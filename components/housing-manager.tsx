"use client";

import Link from "next/link";
import { AlertTriangle, Eye, Loader2, Pencil, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { HousingListing } from "@/lib/housing-types";
import { housingLabels, housingPriceLabel } from "@/lib/housing-types";

export function HousingManager() {
  const [items, setItems] = useState<HousingListing[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", locality: "", shortDescription: "", description: "" });
  const [now] = useState(() => Date.now());

  async function load() {
    setState("loading");
    const response = await fetch("/api/housing/mine", { cache: "no-store" });
    if (!response.ok) { setState("error"); return; }
    const data = await response.json();
    setItems(data.items);
    setState("ready");
  }
  useEffect(() => { void load(); }, []);

  async function mutate(item: HousingListing, body: Record<string, unknown>, method = "PATCH") {
    setMessage("");
    const response = await fetch(`/api/housing/listings/${item.id}`, {
      method,
      headers: method === "PATCH" ? { "content-type": "application/json" } : undefined,
      body: method === "PATCH" ? JSON.stringify({ ...body, version: item.version }) : undefined,
    });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || "Změnu se nepodařilo uložit."); return; }
    setMessage(payload.message || "Změna byla uložena.");
    setEditing(null);
    await load();
  }
  function edit(item: HousingListing) {
    setEditing(item.id);
    setDraft({ title: item.title, locality: item.locality, shortDescription: item.shortDescription, description: item.description });
  }

  return (
    <div className="page-stack housing-manager">
      <header className="page-heading">
        <div><span className="eyebrow">Bydlení</span><h1>Moje inzeráty</h1><p>Správa stavu, platnosti a veřejných údajů. Kontakty zájemců zůstávají v soukromém chatu.</p></div>
        <Link className="button button-primary" href="/brno/bydleni/novy">Přidat inzerát</Link>
      </header>
      {message && <div className={message.includes("nepodařilo") ? "error-state" : "success-message"} role="status">{message}</div>}
      {state === "loading" ? <div className="settings-card"><Loader2 className="spin" />Načítám vaše inzeráty…</div> : state === "error" ? (
        <div className="error-state"><p>Inzeráty se nepodařilo načíst.</p><button className="button button-secondary" onClick={load}>Zkusit znovu</button></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><h2>Zatím nemáte žádný inzerát</h2><p>Po vložení zde uvidíte stav moderace, počet zobrazení i zahájených kontaktů.</p><Link className="button button-primary" href="/brno/bydleni/novy">Přidat inzerát</Link></div>
      ) : (
        <div className="housing-manager-list">
          {items.map((item) => {
            const expiresSoon = item.status === "active" && new Date(item.expiresAt).getTime() <= now + 3 * 86400000;
            return (
              <article key={item.id}>
                <header><div><span className={`status-pill status-${item.status}`}>{housingLabels.status[item.status]}</span><h2>{item.title}</h2><p>{housingPriceLabel(item)} · {item.locality}</p></div><Link className="icon-button" href={`/brno/bydleni/${item.id}`} aria-label="Otevřít detail"><Eye size={18} /></Link></header>
                <div className="housing-owner-stats"><span><strong>{item.viewCount || 0}</strong> zobrazení</span><span><strong>{item.contactCount || 0}</strong> kontaktů</span><span>Platnost do <strong>{new Intl.DateTimeFormat("cs-CZ").format(new Date(item.expiresAt))}</strong></span></div>
                {expiresSoon && <p className="warning-state"><AlertTriangle size={16} /> Inzerát brzy vyprší. Prodloužení je vždy ruční a přidá dalších 30 dní.</p>}
                {item.moderationFlags?.length ? <p className="warning-state">Kontrola: {item.moderationFlags.join(", ")}</p> : null}
                {editing === item.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); void mutate(item, { action: "update", ...draft }); }} className="housing-owner-edit">
                    <label><span>Název</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                    <label><span>Lokalita</span><input value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} /></label>
                    <label><span>Stručný popis</span><input value={draft.shortDescription} onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })} /></label>
                    <label><span>Popis</span><textarea rows={6} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
                    <div className="card-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Zrušit</button><button className="button button-primary"><Save size={16} />Uložit</button></div>
                  </form>
                ) : (
                  <div className="card-actions">
                    <button className="button button-secondary" onClick={() => edit(item)} disabled={["rejected"].includes(item.status)}><Pencil size={16} />Upravit</button>
                    {item.status === "active" && <button className="button button-secondary" onClick={() => mutate(item, { action: item.listingType === "offer" ? "occupied" : "found" })}>{item.listingType === "offer" ? "Označit Obsazeno" : "Označit Nalezeno"}</button>}
                    {item.status === "active" && <button className="button button-secondary" onClick={() => mutate(item, { action: "hide" })}>Dočasně skrýt</button>}
                    {["hidden", "occupied", "found"].includes(item.status) && <button className="button button-secondary" onClick={() => mutate(item, { action: "reopen" })}><RefreshCcw size={16} />Znovu zveřejnit</button>}
                    {["active", "expired"].includes(item.status) && <button className="button button-secondary" onClick={() => mutate(item, { action: "renew" })}><RefreshCcw size={16} />Prodloužit o 30 dní</button>}
                    <button className="button button-secondary danger" onClick={() => window.confirm("Opravdu inzerát odstranit včetně fotografií?") && mutate(item, {}, "DELETE")}><Trash2 size={16} />Odstranit</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
