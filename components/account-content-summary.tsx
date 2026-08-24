"use client";

import Link from "next/link";
import { CalendarDays, MessageCircle, Pencil, ShoppingBag, Trash2, Users } from "lucide-react";

type Row = Record<string, unknown>;
type Content = { posts?: Row[]; comments?: Row[]; buddy?: Row[]; listings?: Row[]; events?: Row[] };

export function AccountContentSummary({ content, onRefresh }: { content: Content; onRefresh: () => void }) {
  async function removeEvent(id: string) { if (!confirm("Zrušit a odstranit vlastní akci?")) return; const response = await fetch(`/api/community-events/${id}`, { method: "DELETE" }); if (response.ok) onRefresh(); }
  async function listingAction(id: string, action: "reserve" | "sold") { const response = await fetch(`/api/marketplace/listings/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }); if (response.ok) onRefresh(); }
  async function removeListing(id: string) { if (!confirm("Odstranit vlastní inzerát?")) return; const response = await fetch(`/api/marketplace/listings/${id}`, { method: "DELETE" }); if (response.ok) onRefresh(); }
  return <div className="account-content-summary">
    <section><h3><MessageCircle size={17} /> Komunita ({content.posts?.length || 0})</h3>{content.posts?.length ? content.posts.map((item) => <Link key={String(item.id)} href={`/komunita?post=${item.id}`}>{String(item.body).slice(0, 100)}</Link>) : <p>Žádný vlastní příspěvek.</p>}</section>
    <section><h3><Users size={17} /> Hledám parťáka ({content.buddy?.length || 0})</h3><Link href="/partak/moje">Otevřít správu vlastních příspěvků</Link></section>
    <section><h3><ShoppingBag size={17} /> Burza ({content.listings?.length || 0})</h3>{content.listings?.length ? content.listings.map((item) => <div key={String(item.id)}><Link href={`/${String(item.city_id || "brno")}/burza/${item.id}`}>{String(item.title)}</Link><span className="card-actions"><button className="button button-secondary" onClick={() => listingAction(String(item.id), "reserve")}>Rezervovat</button><button className="button button-secondary" onClick={() => listingAction(String(item.id), "sold")}>Prodáno</button><button className="button button-quiet" onClick={() => removeListing(String(item.id))}><Trash2 size={14} /> Odstranit</button></span></div>) : <p>Žádný vlastní inzerát.</p>}</section>
    <section><h3><CalendarDays size={17} /> Komunitní akce ({content.events?.length || 0})</h3>{content.events?.length ? content.events.map((item) => <div key={String(item.id)}><Link href={item.status === "published" ? `/brno/kalendar?view=community#${item.id}` : `/akce/sprava?id=${item.id}`}>{String(item.title)} · {item.status === "pending" ? "čeká na schválení" : String(item.status)}</Link><span className="card-actions"><Link className="button button-quiet" href={`/akce/sprava?id=${item.id}`}><Pencil size={14} /> Upravit</Link><button className="button button-quiet" onClick={() => removeEvent(String(item.id))}><Trash2 size={14} /> Zrušit</button></span></div>) : <p>Žádná vlastní akce.</p>}</section>
  </div>;
}
