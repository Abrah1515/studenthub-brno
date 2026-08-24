"use client";

import Link from "next/link";
import { Eye, RefreshCcw, RotateCcw, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type Row = Record<string, unknown>;
type Sensitive = { sellerEmail: string; messages: Array<{ id: string; buyerEmail: string; message: string; deliveryStatus: string; createdAt: string }> };

export function MarketplaceAdminPanel({ listings, reports, history, actions, blocks, role, onApi }: { listings: Row[]; reports: Row[]; history: Row[]; actions: Row[]; blocks: Row[]; role: string; onApi: (url: string, options?: RequestInit) => Promise<boolean> }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sensitive, setSensitive] = useState<Record<string, Sensitive>>({});
  const [sensitiveError, setSensitiveError] = useState("");
  const visible = useMemo(() => listings.filter((row) => (!status || row.status === status) && (!query || `${row.title} ${row.public_alias} ${row.subject_name} ${row.automated_rejection_reason}`.toLowerCase().includes(query.toLowerCase()))), [listings, query, status]);
  const count = (value: string) => listings.filter((row) => row.status === value).length;

  async function moderate(listingId: string, action: string, reportId?: string) {
    const reason = window.prompt(action === "restore" ? "Důvod obnovení" : action === "dismiss_report" ? "Proč hlášení zamítáte?" : "Důvod zásahu");
    if (!reason?.trim()) return;
    await onApi("/api/admin/marketplace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId, action, reportId, reason: reason.trim() }) });
  }

  async function reveal(id: string) {
    setSensitiveError("");
    const response = await fetch(`/api/admin/marketplace/${encodeURIComponent(id)}/sensitive`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setSensitiveError(String(payload.message || "Citlivé údaje nelze načíst.")); return; }
    setSensitive((current) => ({ ...current, [id]: payload as Sensitive }));
  }

  return <section className="admin-panel marketplace-admin-panel">
    <div className="admin-section-head"><div><h2>Studentská burza</h2><p>Nové inzeráty se publikují z dokončeného profilu s ověřeným e-mailem. Kontakty se nenačítají automaticky a jejich zobrazení superadminem se audituje.</p></div><Link className="button button-secondary" href="/brno/burza" target="_blank">Otevřít burzu</Link></div>
    <div className="marketplace-admin-stats">
      <article><span>Aktivní</span><strong>{count("active")}</strong></article><article><span>Rezervované</span><strong>{count("reserved")}</strong></article><article><span>Prodané</span><strong>{count("sold")}</strong></article><article><span>Expirované</span><strong>{count("expired")}</strong></article><article><span>Nahlášené</span><strong>{reports.filter((row) => ["new", "reviewed"].includes(String(row.status))).length}</strong></article><article><span>Kontaktování</span><strong>{listings.reduce((total, row) => total + Number(row.contact_count || 0), 0)}</strong></article>
    </div>
    <div className="marketplace-admin-filters"><label><Search size={16} /><span className="sr-only">Hledat inzerát</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Název, přezdívka, předmět…" /></label><label><span>Stav</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Všechny stavy</option>{["pending_verification", "active", "reserved", "sold", "expired", "hidden", "rejected", "deleted"].map((value) => <option value={value} key={value}>{value}</option>)}</select></label></div>
    {sensitiveError && <div className="error-state" role="alert">{sensitiveError}</div>}
    <div className="approval-list">
      {visible.length === 0 ? <div className="empty-state"><h3>Žádné inzeráty</h3><p>Burza nepoužívá demonstrační nabídky. Nový záznam se objeví až po skutečném odeslání formuláře.</p></div> : visible.map((row) => {
        const id = String(row.id); const itemReports = reports.filter((report) => report.listing_id === id); const itemSensitive = sensitive[id];
        return <article key={id}><div><span className={`status-pill status-${String(row.status)}`}>{String(row.status)}</span><h3>{String(row.title)}</h3><p>{String(row.short_description || "")}</p><small>{String(row.category)} · {String(row.university_id || "Brno")} · {String(row.faculty_id || "bez fakulty")} · {String(row.created_at || "")}</small><small>{Number(row.report_count || 0)} hlášení · {Number(row.contact_count || 0)} kontaktování</small>
          {Boolean(row.automated_rejection_reason) && <p className="source-block-reason"><strong>Automatické odmítnutí:</strong> {String(row.automated_rejection_reason)}</p>}
          {itemReports.map((report) => <div className="marketplace-admin-report" key={String(report.id)}><ShieldAlert size={15} /><span>{String(report.reason)} · {String(report.detail || "bez upřesnění")} · {String(report.status)}</span>{!["resolved", "dismissed"].includes(String(report.status)) && <><button onClick={() => moderate(id, "resolve_report", String(report.id))}>Vyřešit</button><button onClick={() => moderate(id, "dismiss_report", String(report.id))}>Zamítnout</button></>}</div>)}
          {itemSensitive && <div className="marketplace-sensitive"><strong>Auditované kontakty</strong><p>Prodávající: {itemSensitive.sellerEmail}</p>{itemSensitive.messages.length ? itemSensitive.messages.map((message) => <article key={message.id}><p>{message.message}</p><small>{message.buyerEmail} · {message.deliveryStatus} · {message.createdAt}</small></article>) : <small>Žádné zprávy zájemců.</small>}</div>}
        </div><div>{["active", "reserved"].includes(String(row.status)) && <button className="button button-secondary" onClick={() => moderate(id, "hide")}>Skrýt</button>}{row.status === "hidden" && <button className="button button-secondary" onClick={() => moderate(id, "restore")}><RotateCcw size={15} />Obnovit</button>}<button className="button button-secondary" onClick={() => moderate(id, "block_abuse")}><ShieldAlert size={15} />Blokovat zneužití</button>{row.status !== "deleted" && <button className="button button-secondary" onClick={() => moderate(id, "delete")}><Trash2 size={15} />Odstranit</button>}{role === "super_admin" && !itemSensitive && <button className="button button-secondary" onClick={() => reveal(id)}><Eye size={15} />Zobrazit kontakty</button>}</div></article>;
      })}
    </div>
    <details className="admin-audit-log"><summary>Historie a audit ({history.length + actions.length})</summary><ul>{[...actions, ...history].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 100).map((row) => <li key={`${String(row.id)}-${String(row.event_type || row.action)}`}><strong>{String(row.event_type || row.action)}</strong> · {String(row.listing_id)} · {String(row.created_at)}</li>)}</ul></details>
    {role === "super_admin" && <p className="muted"><RefreshCcw size={14} /> Aktivních blokací: {blocks.filter((row) => row.active).length}. Identifikátory blokací se do klienta neposílají.</p>}
  </section>;
}
