"use client";

import Link from "next/link";
import { Clock, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

type Row = Record<string, unknown>;

type Props = {
  listings: Row[];
  reports: Row[];
  history: Row[];
  actions: Row[];
  onApi: (url: string, options?: RequestInit) => Promise<boolean>;
};

const statuses = ["active", "pending_review", "hidden", "occupied", "found", "expired", "rejected", "deleted"];

export function HousingAdminPanel({ listings, reports, history, actions, onApi }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [now] = useState(() => Date.now());
  const visible = useMemo(
    () => listings.filter((row) =>
      (!status || row.status === status) &&
      (!query || `${row.title} ${row.locality} ${(row.moderation_flags as string[] || []).join(" ")}`.toLowerCase().includes(query.toLowerCase())),
    ),
    [listings, query, status],
  );
  const count = (value: string) => listings.filter((row) => row.status === value).length;

  async function runAction(listingId: string, kind: string, reportId?: string) {
    const reason = window.prompt("Povinný interní důvod rozhodnutí");
    if (!reason?.trim()) return;
    await onApi("/api/admin/housing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId, action: kind, reportId, reason: reason.trim() }),
    });
  }

  return (
    <section className="admin-panel housing-admin-panel">
      <div className="admin-section-head">
        <div>
          <h2>Bydlení</h2>
          <p>Vyšší riziko podvodů: zde jsou čekající, nahlášené, skryté i archivované inzeráty a jejich audit.</p>
        </div>
        <Link className="button button-secondary" href="/brno/bydleni" target="_blank">Otevřít Bydlení</Link>
      </div>

      <div className="marketplace-admin-stats">
        <article><span>Aktivní nabídky</span><strong>{listings.filter((row) => row.status === "active" && row.listing_type === "offer").length}</strong></article>
        <article><span>Aktivní poptávky</span><strong>{listings.filter((row) => row.status === "active" && row.listing_type === "wanted").length}</strong></article>
        <article><span>Čeká na kontrolu</span><strong>{count("pending_review")}</strong></article>
        <article><span>Otevřená hlášení</span><strong>{reports.filter((row) => ["new", "reviewed"].includes(String(row.status))).length}</strong></article>
        <article><span>Brzy vyprší</span><strong>{listings.filter((row) => row.status === "active" && new Date(String(row.expires_at)).getTime() < now + 3 * 86400000).length}</strong></article>
      </div>

      <div className="marketplace-admin-filters">
        <label><Search size={16} /><span className="sr-only">Hledat</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Název, lokalita, rizikový příznak…" /></label>
        <label><span>Stav</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Všechny stavy</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>

      <div className="approval-list">
        {visible.length === 0 ? (
          <div className="empty-state"><h3>Žádné inzeráty</h3><p>V produkci nevytváříme demonstrační bydlení.</p></div>
        ) : visible.map((row) => {
          const id = String(row.id);
          const itemReports = reports.filter((report) => report.listing_id === id);
          return (
            <article key={id}>
              <div>
                <span className={`status-pill status-${String(row.status)}`}>{String(row.status)}</span>
                <h3>{String(row.title)}</h3>
                <p>{String(row.short_description)}</p>
                <small>{String(row.listing_type)} · {String(row.locality)} · {String(row.price_monthly)} Kč · {String(row.created_at)}</small>
                {Array.isArray(row.moderation_flags) && row.moderation_flags.length > 0 && <p className="source-block-reason"><strong>Automatická kontrola:</strong> {row.moderation_flags.join(", ")}</p>}
                {itemReports.map((report) => (
                  <div className="marketplace-admin-report" key={String(report.id)}>
                    <ShieldAlert size={15} />
                    <span>{String(report.reason)} · {String(report.detail || "bez upřesnění")} · {String(report.status)}</span>
                    {!["resolved", "dismissed"].includes(String(report.status)) && <><button onClick={() => runAction(id, "resolve_report", String(report.id))}>Vyřešit</button><button onClick={() => runAction(id, "dismiss_report", String(report.id))}>Zamítnout</button></>}
                  </div>
                ))}
              </div>
              <div>
                {row.status === "pending_review" && <><button className="button button-primary" onClick={() => runAction(id, "approve")}>Schválit</button><button className="button button-secondary" onClick={() => runAction(id, "reject")}>Zamítnout</button></>}
                {row.status === "active" && <button className="button button-secondary" onClick={() => runAction(id, "hide")}>Skrýt</button>}
                {["hidden", "rejected"].includes(String(row.status)) && <button className="button button-secondary" onClick={() => runAction(id, "restore")}>Obnovit</button>}
                {row.status !== "deleted" && <button className="button button-secondary" onClick={() => runAction(id, "delete")}>Odstranit</button>}
                <button className="button button-secondary" onClick={() => runAction(id, "restrict_author")}>Omezit autora</button>
              </div>
            </article>
          );
        })}
      </div>

      <details className="admin-audit-log">
        <summary><Clock size={14} /> Historie a rozhodnutí ({history.length + actions.length})</summary>
        <ul>{[...history, ...actions].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 100).map((row) => <li key={`${String(row.id)}-${String(row.event_type || row.action)}`}><strong>{String(row.event_type || row.action)}</strong> · {String(row.listing_id)} · {String(row.created_at)}</li>)}</ul>
      </details>
    </section>
  );
}
