"use client";

import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, ImagePlus, Loader2, RefreshCcw, Save, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useAcademicCatalog } from "@/components/academic-catalog-provider";
import { marketplaceCategories, marketplaceLabels } from "@/lib/marketplace-types";

type Managed = Record<string, unknown>;
type Values = {
  listingType: "offer" | "wanted"; category: (typeof marketplaceCategories)[number]; title: string; shortDescription: string; description: string;
  priceMode: "fixed" | "free" | "negotiable"; priceAmount: string; priceScope: "item" | "bundle";
  universityId: string; facultyId: string; studyProgram: string; subjectName: string; subjectCode: string; teacherName: string; recommendedYear: string;
  handoffMethod: "in_person" | "shipping" | "digital" | "agreement"; handoffLocation: string;
};

export function MarketplaceManager({ listingId, citySlug }: { listingId: string; citySlug: string }) {
  const catalog = useAcademicCatalog();
  const [item, setItem] = useState<Managed | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "deleted">("loading");
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPending, setPhotoPending] = useState(false);
  const { register, handleSubmit, reset, control, formState: { isSubmitting } } = useForm<Values>();
  const universityId = useWatch({ control, name: "universityId" });

  useEffect(() => {
    if (!listingId) { setState("error"); setMessage("Chybí identifikátor inzerátu."); return; }
    void load();
    async function load() {
      const response = await fetch(`/api/marketplace/listings/${listingId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setState("error"); setMessage(payload.message || "Inzerát nelze tímto účtem spravovat."); return; }
      const value = payload.item as Managed; setItem(value);
      reset({
        listingType: String(value.listing_type || "offer") as Values["listingType"], category: String(value.category || "other") as Values["category"], title: String(value.title || ""), shortDescription: String(value.short_description || ""), description: String(value.description || ""),
        priceMode: String(value.price_mode || "fixed") as Values["priceMode"], priceAmount: value.price_amount == null ? "" : String(value.price_amount), priceScope: String(value.price_scope || "item") as Values["priceScope"],
        universityId: String(value.university_id || ""), facultyId: String(value.faculty_id || ""), studyProgram: String(value.study_program || ""), subjectName: String(value.subject_name || ""), subjectCode: String(value.subject_code || ""), teacherName: String(value.teacher_name || ""), recommendedYear: value.recommended_year == null ? "" : String(value.recommended_year),
        handoffMethod: String(value.handoff_method || "in_person") as Values["handoffMethod"], handoffLocation: String(value.handoff_location || ""),
      });
      setState("ready");
    }
  }, [listingId, reset]);

  async function mutate(body: Record<string, unknown>) {
    setMessage("");
    const response = await fetch(`/api/marketplace/listings/${listingId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || "Změnu se nepodařilo uložit."); return false; }
    setItem(payload.item); setMessage(payload.message || "Změna byla uložena."); return true;
  }
  async function save(values: Values) { await mutate({ action: "update", ...values, priceAmount: values.priceAmount ? Number(values.priceAmount) : null, recommendedYear: values.recommendedYear ? Number(values.recommendedYear) : null, universityId: values.universityId || null, facultyId: values.facultyId || null }); }
  async function remove() {
    setDeleting(true); const response = await fetch(`/api/marketplace/listings/${listingId}`, { method: "DELETE" }); setDeleting(false);
    if (!response.ok) { const payload = await response.json().catch(() => ({})); setMessage(payload.message || "Inzerát se nepodařilo odstranit."); return; }
    setDeleteOpen(false); setState("deleted");
  }
  async function refreshPhotos() { const response = await fetch(`/api/marketplace/listings/${listingId}`, { cache: "no-store" }); const payload = await response.json().catch(() => ({})); if (response.ok) setItem((current) => current ? { ...current, photos: payload.item.photos || [] } : current); }
  async function uploadPhotos() { if (!photoFiles.length) return; setPhotoPending(true); const form = new FormData(); photoFiles.forEach((file) => form.append("photos", file)); const response = await fetch(`/api/marketplace/listings/${listingId}/photos`, { method: "POST", body: form }); const payload = await response.json().catch(() => ({})); setPhotoPending(false); setMessage(payload.message || (response.ok ? "Fotografie byly přidány." : "Fotografie se nepodařilo uložit.")); if (response.ok) { setPhotoFiles([]); await refreshPhotos(); } }
  async function removePhoto(photoId: string) { const response = await fetch(`/api/marketplace/listings/${listingId}/photos`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoId }) }); if (!response.ok) { setMessage((await response.json().catch(() => ({}))).message || "Fotografii se nepodařilo odstranit."); return; } setMessage("Fotografie byla odstraněna."); await refreshPhotos(); }
  const faculties = catalog.faculties.filter((faculty) => faculty.universityId === universityId && faculty.active);

  return <div className="page-stack marketplace-manager">
    <header className="page-heading"><div><span className="eyebrow">Vlastní inzerát</span><h1>Správa inzerátu</h1><p>Přístup má pouze přihlášený prodávající. Kontaktní e-mail se ve veřejném API nezobrazuje.</p></div></header>
    {state === "loading" && <div className="settings-card"><Loader2 className="spin" />Ověřuji účet…</div>}
    {state === "error" && <div className="error-state">{message}</div>}
    {state === "deleted" && <div className="success-state"><CheckCircle2 size={36} /><h2>Inzerát byl odstraněn</h2><Link className="button button-primary" href={`/${citySlug}/burza`}>Zpět do burzy</Link></div>}
    {state === "ready" && item && <>
      <section className="marketplace-manager-status"><div><span>Stav</span><strong>{marketplaceLabels.status[String(item.status) as keyof typeof marketplaceLabels.status] || String(item.status)}</strong><small>Platnost do {item.expires_at ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(String(item.expires_at))) : "bez data"}</small></div><div>{item.status === "active" && <button className="button button-secondary" onClick={() => mutate({ action: "reserve" })}>Rezervováno</button>}{["active", "reserved"].includes(String(item.status)) && <button className="button button-secondary" onClick={() => mutate({ action: "sold" })}><ShoppingBag size={16} />Prodáno</button>}{item.status !== "archived" && <button className="button button-secondary" onClick={() => mutate({ action: "archive" })}>Archivovat</button>}{["reserved", "sold", "archived"].includes(String(item.status)) && <button className="button button-secondary" onClick={() => mutate({ action: "reopen" })}>Znovu aktivovat</button>}<button className="button button-secondary" onClick={() => mutate({ action: "renew" })}><RefreshCcw size={16} />Prodloužit o 30 dní</button></div></section>
      <form className="marketplace-form" onSubmit={handleSubmit(save)}><fieldset><legend>Upravit veřejné údaje</legend><div className="form-grid">
        <label><span>Typ inzerátu</span><select {...register("listingType")}><option value="offer">Nabízím</option><option value="wanted">Hledám</option></select></label>
        <label><span>Kategorie</span><select {...register("category")}>{marketplaceCategories.map((value) => <option value={value} key={value}>{marketplaceLabels.category[value]}</option>)}</select></label>
        <label className="form-span"><span>Název</span><input required minLength={4} maxLength={140} {...register("title")} /></label><label className="form-span"><span>Krátký popis</span><input required minLength={10} maxLength={240} {...register("shortDescription")} /></label><label className="form-span"><span>Úplný popis</span><textarea required minLength={30} maxLength={3000} rows={7} {...register("description")} /></label>
        <label><span>Způsob ceny</span><select {...register("priceMode")}><option value="fixed">Pevná cena</option><option value="free">Zdarma</option><option value="negotiable">Dohodou</option></select></label><label><span>Cena v Kč</span><input type="number" min="0" {...register("priceAmount")} /></label><label><span>Cena platí</span><select {...register("priceScope")}><option value="item">Za kus</option><option value="bundle">Za balíček</option></select></label>
        <label><span>Univerzita</span><select {...register("universityId")}><option value="">Celé Brno / neurčeno</option>{catalog.universities.filter((value) => value.active).map((value) => <option value={value.id} key={value.id}>{value.name}</option>)}</select></label><label><span>Fakulta</span><select {...register("facultyId")} disabled={!universityId}><option value="">Celá univerzita / neurčeno</option>{faculties.map((value) => <option value={value.id} key={value.id}>{value.name}</option>)}</select></label>
        <label><span>Studijní program</span><input {...register("studyProgram")} /></label><label><span>Předmět</span><input {...register("subjectName")} /></label><label><span>Kód předmětu</span><input {...register("subjectCode")} /></label><label><span>Vyučující</span><input {...register("teacherName")} /></label><label><span>Doporučený ročník</span><select {...register("recommendedYear")}><option value="">Neurčeno</option>{[1,2,3,4,5,6].map((year) => <option value={year} key={year}>{year}. ročník</option>)}</select></label>
        <label><span>Způsob předání</span><select {...register("handoffMethod")}><option value="in_person">Osobní předání</option><option value="shipping">Zaslání</option><option value="digital">Digitální předání</option><option value="agreement">Dohodou</option></select></label><label><span>Přibližné místo</span><input {...register("handoffLocation")} /></label>
      </div></fieldset><fieldset><legend>Fotografie</legend><div className="marketplace-photo-previews">{((item.photos || []) as Array<{ id: string; url: string }>).map((photo, index) => <figure key={photo.id}><span><Image src={photo.url} alt={`Fotografie ${index + 1}`} fill sizes="120px" unoptimized /></span><button type="button" aria-label={`Odstranit fotografii ${index + 1}`} onClick={() => void removePhoto(photo.id)}><Trash2 size={16} /></button></figure>)}</div><label className="marketplace-photo-picker"><ImagePlus size={20} /><span>Vybrat nové fotografie</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPhotoFiles(Array.from(event.target.files || []))} /></label>{photoFiles.length > 0 && <button type="button" className="button button-secondary" disabled={photoPending} onClick={() => void uploadPhotos()}>{photoPending ? "Nahrávám…" : `Přidat fotografie (${photoFiles.length})`}</button>}</fieldset>{message && <p className={message.includes("nepodařilo") ? "error-state" : "success-message"} role="status">{message}</p>}<div className="form-footer"><button className="button button-secondary" type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={17} />Odstranit</button><button className="button button-primary" disabled={isSubmitting}><Save size={17} />{isSubmitting ? "Ukládám…" : "Uložit úpravy"}</button></div></form>
    </>}
    <ConfirmDeleteDialog open={deleteOpen} title="Smazat inzerát?" description="Inzerát zmizí z výpisu a jeho nepoužívané fotografie se odstraní. Existující chat zůstane zachovaný." pending={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} />
  </div>;
}
