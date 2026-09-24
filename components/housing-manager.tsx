"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Eye, ImagePlus, Loader2, Pencil, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { HousingListing } from "@/lib/housing-types";
import { housingCategories, housingFeatures, housingLabels, housingLifestylePreferences, housingListingTypes, housingPriceLabel, housingStayLengths } from "@/lib/housing-types";
import { OwnerScopeTabs } from "@/components/owner-scope-tabs";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

export function HousingManager() {
  const [items, setItems] = useState<HousingListing[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<HousingListing | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPending, setPhotoPending] = useState(false);
  const [draft, setDraft] = useState({ listingType: "offer" as HousingListing["listingType"], category: "private_room" as HousingListing["category"], title: "", locality: "", availableFrom: "", stayLength: "6_12_months" as HousingListing["stayLength"], shortDescription: "", description: "", priceMonthly: 0, utilitiesIncluded: false, utilitiesAmount: null as number | null, depositAmount: null as number | null, availableSpots: null as number | null, currentOccupants: null as number | null, furnished: null as boolean | null, transitAccess: "", features: [] as HousingListing["features"], wantedPersonCount: null as number | null, lifestylePreferences: [] as string[] });
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
    setDraft({ listingType: item.listingType, category: item.category, title: item.title, locality: item.locality, availableFrom: item.availableFrom, stayLength: item.stayLength, shortDescription: item.shortDescription, description: item.description, priceMonthly: item.priceMonthly, utilitiesIncluded: item.utilitiesIncluded, utilitiesAmount: item.utilitiesAmount ?? null, depositAmount: item.depositAmount ?? null, availableSpots: item.availableSpots ?? null, currentOccupants: item.currentOccupants ?? null, furnished: item.furnished ?? null, transitAccess: item.transitAccess || "", features: item.features, wantedPersonCount: item.wantedPersonCount ?? null, lifestylePreferences: item.lifestylePreferences });
  }
  async function remove(item: HousingListing) {
    setDeletePending(true);
    await mutate(item, {}, "DELETE");
    setDeletePending(false);
    setDeleting(null);
  }
  async function uploadPhotos(item: HousingListing) { if (!photoFiles.length) return; setPhotoPending(true); const form = new FormData(); photoFiles.forEach((file) => form.append("photos", file)); const response = await fetch(`/api/housing/listings/${item.id}/photos`, { method: "POST", body: form }); const payload = await response.json().catch(() => ({})); setPhotoPending(false); setMessage(payload.message || (response.ok ? "Fotografie byly přidány." : "Fotografie se nepodařilo uložit.")); if (response.ok) { setPhotoFiles([]); await load(); } }
  async function removePhoto(item: HousingListing, photoId: string) { const response = await fetch(`/api/housing/listings/${item.id}/photos`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoId }) }); if (!response.ok) { setMessage((await response.json().catch(() => ({}))).message || "Fotografii se nepodařilo odstranit."); return; } setMessage("Fotografie byla odstraněna."); await load(); }

  return (
    <div className="page-stack housing-manager">
      <header className="page-heading">
        <div><span className="eyebrow">Bydlení</span><h1>Moje inzeráty</h1><p>Správa stavu, platnosti a veřejných údajů. Kontakty zájemců zůstávají v soukromém chatu.</p></div>
        <Link className="button button-primary" href="/brno/bydleni/novy">Přidat inzerát</Link>
      </header>
      <OwnerScopeTabs mine allHref="/brno/bydleni" mineHref="/brno/bydleni/moje" />
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
                <header><div><span className={`status-pill status-${item.status}`}>{item.hiddenByAdmin ? "Skryto administrátorem" : housingLabels.status[item.status]}</span><h2>{item.title}</h2><p>{housingPriceLabel(item)} · {item.locality}</p></div><Link className="icon-button" href={`/brno/bydleni/${item.id}`} aria-label="Otevřít detail"><Eye size={18} /></Link></header>
                <div className="housing-owner-stats"><span><strong>{item.viewCount || 0}</strong> zobrazení</span><span><strong>{item.contactCount || 0}</strong> kontaktů</span><span>Platnost do <strong>{new Intl.DateTimeFormat("cs-CZ").format(new Date(item.expiresAt))}</strong></span></div>
                {expiresSoon && <p className="warning-state"><AlertTriangle size={16} /> Inzerát brzy vyprší. Prodloužení je vždy ruční a přidá dalších 30 dní.</p>}
                {item.moderationFlags?.length ? <p className="warning-state">Kontrola: {item.moderationFlags.join(", ")}</p> : null}
                {editing === item.id ? (
                  <form onSubmit={(event) => { event.preventDefault(); void mutate(item, { action: "update", ...draft }); }} className="housing-owner-edit">
                    <label><span>Typ inzerátu</span><select value={draft.listingType} onChange={(event) => setDraft({ ...draft, listingType: event.target.value as HousingListing["listingType"] })}>{housingListingTypes.map((value) => <option value={value} key={value}>{housingLabels.type[value]}</option>)}</select></label>
                    <label><span>Druh bydlení</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as HousingListing["category"] })}>{housingCategories.map((value) => <option value={value} key={value}>{housingLabels.category[value]}</option>)}</select></label>
                    <label><span>Název</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
                    <label><span>Lokalita</span><input value={draft.locality} onChange={(event) => setDraft({ ...draft, locality: event.target.value })} /></label>
                    <label><span>Dostupné od</span><input type="date" value={draft.availableFrom} onChange={(event) => setDraft({ ...draft, availableFrom: event.target.value })} /></label>
                    <label><span>Délka bydlení</span><select value={draft.stayLength} onChange={(event) => setDraft({ ...draft, stayLength: event.target.value as HousingListing["stayLength"] })}>{housingStayLengths.map((value) => <option value={value} key={value}>{housingLabels.stay[value]}</option>)}</select></label>
                    <label><span>Měsíční cena</span><input type="number" min={0} value={draft.priceMonthly} onChange={(event) => setDraft({ ...draft, priceMonthly: Number(event.target.value) })} /></label>
                    <label><span>Energie</span><input type="number" min={0} value={draft.utilitiesAmount ?? ""} disabled={draft.utilitiesIncluded} onChange={(event) => setDraft({ ...draft, utilitiesAmount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                    <label className="check-row"><input type="checkbox" checked={draft.utilitiesIncluded} onChange={(event) => setDraft({ ...draft, utilitiesIncluded: event.target.checked, utilitiesAmount: event.target.checked ? null : draft.utilitiesAmount })} /><span>Energie jsou zahrnuté</span></label>
                    <label><span>Kauce</span><input type="number" min={0} value={draft.depositAmount ?? ""} onChange={(event) => setDraft({ ...draft, depositAmount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                    {draft.listingType === "offer" ? <><label><span>Volná místa</span><input type="number" min={1} value={draft.availableSpots ?? ""} onChange={(event) => setDraft({ ...draft, availableSpots: event.target.value === "" ? null : Number(event.target.value) })} /></label><label><span>Současní obyvatelé</span><input type="number" min={0} value={draft.currentOccupants ?? ""} onChange={(event) => setDraft({ ...draft, currentOccupants: event.target.value === "" ? null : Number(event.target.value) })} /></label></> : <label><span>Počet osob</span><input type="number" min={1} value={draft.wantedPersonCount ?? ""} onChange={(event) => setDraft({ ...draft, wantedPersonCount: event.target.value === "" ? null : Number(event.target.value) })} /></label>}
                    <label><span>Dostupnost MHD</span><input value={draft.transitAccess} onChange={(event) => setDraft({ ...draft, transitAccess: event.target.value })} /></label>
                    <label><span>Stručný popis</span><input value={draft.shortDescription} onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })} /></label>
                    <label><span>Popis</span><textarea rows={6} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
                    <fieldset><legend>{draft.listingType === "offer" ? "Vybavení" : "Preference"}</legend><div className="housing-options">{draft.listingType === "offer" ? housingFeatures.map((value) => <label className="check-row" key={value}><input type="checkbox" checked={draft.features.includes(value)} onChange={(event) => setDraft({ ...draft, features: event.target.checked ? [...draft.features, value] : draft.features.filter((item) => item !== value) })} /><span>{housingLabels.feature[value]}</span></label>) : housingLifestylePreferences.map((value) => <label className="check-row" key={value}><input type="checkbox" checked={draft.lifestylePreferences.includes(value)} onChange={(event) => setDraft({ ...draft, lifestylePreferences: event.target.checked ? [...draft.lifestylePreferences, value] : draft.lifestylePreferences.filter((item) => item !== value) })} /><span>{housingLabels.lifestyle[value]}</span></label>)}</div></fieldset>
                    <fieldset><legend>Fotografie</legend><div className="housing-photo-previews">{item.photos.map((photo, index) => <figure key={photo.id}><span><Image src={photo.url} alt={`Fotografie ${index + 1}`} fill sizes="120px" unoptimized /></span><button type="button" aria-label={`Odstranit fotografii ${index + 1}`} onClick={() => void removePhoto(item, photo.id)}><Trash2 size={15} /></button></figure>)}</div><label className="housing-photo-picker"><ImagePlus size={18} /><span>Vybrat nové fotografie</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotoFiles(Array.from(event.target.files || []))} /></label>{photoFiles.length > 0 && <button type="button" className="button button-secondary" disabled={photoPending} onClick={() => void uploadPhotos(item)}>{photoPending ? "Nahrávám…" : `Přidat fotografie (${photoFiles.length})`}</button>}</fieldset>
                    <div className="card-actions"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Zrušit</button><button className="button button-primary"><Save size={16} />Uložit</button></div>
                  </form>
                ) : (
                  <div className="card-actions">
                    <button className="button button-secondary" onClick={() => edit(item)}><Pencil size={16} />Upravit</button>
                    {item.status === "active" && <button className="button button-secondary" onClick={() => mutate(item, { action: item.listingType === "offer" ? "occupied" : "found" })}>{item.listingType === "offer" ? "Označit Obsazeno" : "Označit Nalezeno"}</button>}
                    {item.status === "active" && <button className="button button-secondary" onClick={() => mutate(item, { action: "hide" })}>Dočasně skrýt</button>}
                    {!["archived", "rejected"].includes(item.status) && <button className="button button-secondary" onClick={() => mutate(item, { action: "archive" })}>Archivovat</button>}
                    {["hidden", "occupied", "found", "archived"].includes(item.status) && !item.hiddenByAdmin && <button className="button button-secondary" onClick={() => mutate(item, { action: "reopen" })}><RefreshCcw size={16} />Znovu zveřejnit</button>}
                    {["active", "expired"].includes(item.status) && <button className="button button-secondary" onClick={() => mutate(item, { action: "renew" })}><RefreshCcw size={16} />Prodloužit o 30 dní</button>}
                    <button className="button button-secondary danger" onClick={() => setDeleting(item)}><Trash2 size={16} />Odstranit</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <ConfirmDeleteDialog open={Boolean(deleting)} title="Smazat inzerát?" description="Inzerát zmizí z výpisu a nepoužívané fotografie se odstraní. Existující chat zůstane zachovaný." pending={deletePending} onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting) void remove(deleting); }} />
    </div>
  );
}
