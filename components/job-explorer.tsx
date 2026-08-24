"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BriefcaseBusiness, CheckCircle2, ChevronDown, MapPin, Search, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Job, JobRewardUnit } from "@/lib/types";
import { jobSubmissionSchema, type JobSubmissionInput } from "@/lib/schemas";
import { useStudentPreference } from "@/lib/client-preferences";
import { useModalDialog } from "@/lib/use-modal-dialog";
import { formatJobReward } from "@/lib/job-rewards";
import { MobileFilterToolbar } from "@/components/mobile-filter-toolbar";

const all = "Všechny";
const dateFormatter = new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" });
const rewardUnitLabels: Record<JobRewardUnit, string> = { hour: "Za hodinu", day: "Za den", shift: "Za směnu", month: "Za měsíc", agreement: "Dle domluvy", fixed: "Za úkol", volunteer: "Dobrovolnictví" };

function JobProposal({ onClose }: { onClose: () => void }) {
  const [success, setSuccess] = useState(false); const [serverError, setServerError] = useState("");
  const dialogRef = useModalDialog(true, onClose);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.input<typeof jobSubmissionSchema>, unknown, JobSubmissionInput>({ resolver: zodResolver(jobSubmissionSchema), defaultValues: { reward: 160, consent: false, company: "" } });
  async function submit(data: JobSubmissionInput) {
    setServerError(""); const response = await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); const result = await response.json();
    if (!response.ok) return setServerError(result.message || "Návrh se nepodařilo uložit."); setSuccess(true);
  }
  return <div ref={dialogRef} tabIndex={-1} className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="job-dialog-title" data-modal-layer><div className="modal-card"><div className="modal-head"><div><span className="eyebrow">Pro firmy a týmy</span><h2 id="job-dialog-title">Navrhnout brigádu</h2></div><button className="icon-button" data-autofocus onClick={onClose} aria-label="Zavřít formulář"><X size={19} /></button></div>{success ? <div className="success-state"><CheckCircle2 size={32} /><h3>Návrh je uložený</h3><p>Inzerát se zveřejní až po kontrole administrátorem.</p><button className="button button-primary" onClick={onClose}>Hotovo</button></div> : <form className="form-grid" onSubmit={handleSubmit(submit)} noValidate><label><span>Firma *</span><input {...register("companyName")} />{errors.companyName && <small className="field-error">Alespoň 2 znaky.</small>}</label><label><span>Název pozice *</span><input {...register("title")} />{errors.title && <small className="field-error">Alespoň 4 znaky.</small>}</label><label><span>Kontaktní e-mail *</span><input type="email" {...register("contactEmail")} />{errors.contactEmail && <small className="field-error">Zadejte platný e-mail.</small>}</label><label><span>Lokalita *</span><input {...register("location")} />{errors.location && <small className="field-error">Doplňte lokalitu.</small>}</label><label><span>Odměna v Kč/h *</span><input type="number" {...register("reward")} />{errors.reward && <small className="field-error">Minimálně 100 Kč.</small>}</label><label><span>Časová náročnost *</span><input {...register("workload")} placeholder="Např. 10 h týdně" />{errors.workload && <small className="field-error">Doplňte rozsah.</small>}</label><label className="form-span"><span>Popis práce *</span><textarea rows={4} {...register("description")} />{errors.description && <small className="field-error">Alespoň 30 znaků.</small>}</label><label className="honeypot" aria-hidden="true"><span>Company</span><input tabIndex={-1} autoComplete="off" aria-hidden="true" {...register("company")} /></label><label className="checkbox-field form-span"><input type="checkbox" {...register("consent")} /><span>Souhlasím se zpracováním údajů pro vyřízení návrhu. *</span></label>{errors.consent && <small className="field-error form-span">Potvrďte souhlas.</small>}{serverError && <p className="field-error form-span">{serverError}</p>}<button className="button button-primary form-span" disabled={isSubmitting}><Send size={17} />{isSubmitting ? "Ukládám…" : "Odeslat ke schválení"}</button></form>}</div></div>;
}

function comparableHourlyReward(job: Job) { return job.rewardUnit === "hour" ? job.rewardMin ?? job.reward : undefined; }

export function JobExplorer({ items }: { items: Job[] }) {
  const [query, setQuery] = useState(""); const [field, setField] = useState(all); const [workType, setWorkType] = useState(all); const [workload, setWorkload] = useState(all); const [locality, setLocality] = useState(""); const [rewardUnit, setRewardUnit] = useState<"all" | "unspecified" | JobRewardUnit>("all");
  const [minReward, setMinReward] = useState(0); const [includeUnspecified, setIncludeUnspecified] = useState(true);
  const [sort, setSort] = useState<"verified" | "reward">("verified"); const [filtersOpen, setFiltersOpen] = useState(false); const [showProposal, setShowProposal] = useState(false);
  const preference = useStudentPreference();
  const workTypeOptions = useMemo(() => [...new Set(items.map((job) => job.type))], [items]);
  const workloadOptions = useMemo(() => [...new Set(items.map((job) => job.workload).filter((value): value is string => Boolean(value)))], [items]);
  const rewardUnitOptions = useMemo(() => [...new Set(items.map((job) => job.rewardUnit).filter((value): value is JobRewardUnit => Boolean(value)))], [items]);
  const activeCount = [query.trim(), field !== all, workType !== all, workload !== all, locality.trim(), rewardUnit !== "all", minReward > 0, !includeUnspecified, sort !== "verified"].filter(Boolean).length;
  const filtered = useMemo(() => items.filter((job) => {
    if (job.status !== "approved" || (preference.universityId && job.universityIds?.length && !job.universityIds.includes(preference.universityId)) || (preference.facultyId && job.facultyIds?.length && !job.facultyIds.includes(preference.facultyId))) return false;
    if (field !== all && job.field !== field) return false; if (workType !== all && job.type !== workType) return false; if (workload !== all && job.workload !== workload) return false;
    if (locality.trim() && !job.location.toLocaleLowerCase("cs-CZ").includes(locality.trim().toLocaleLowerCase("cs-CZ"))) return false;
    if (rewardUnit === "unspecified" ? job.rewardUnit : rewardUnit !== "all" && job.rewardUnit !== rewardUnit) return false;
    const hourly = comparableHourlyReward(job); if (minReward > 0 && (hourly == null ? !includeUnspecified : hourly < minReward)) return false;
    return `${job.title} ${job.company || ""} ${job.location} ${job.positionLabel || ""}`.toLocaleLowerCase("cs-CZ").includes(query.trim().toLocaleLowerCase("cs-CZ"));
  }).sort((a, b) => sort === "reward" ? (comparableHourlyReward(b) ?? -1) - (comparableHourlyReward(a) ?? -1) : new Date(b.lastVerifiedAt).getTime() - new Date(a.lastVerifiedAt).getTime()), [items, field, workType, workload, locality, rewardUnit, minReward, includeUnspecified, query, sort, preference]);
  function resetFilters() { setQuery(""); setField(all); setWorkType(all); setWorkload(all); setLocality(""); setRewardUnit("all"); setMinReward(0); setIncludeUnspecified(true); setSort("verified"); }
  function trackOutbound(job: Job) {
    if (!job.applyUrl) return;
    try {
      void fetch("/api/clicks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "job", targetId: job.id, destinationHost: new URL(job.applyUrl).hostname, universityId: preference.universityId, facultyId: preference.facultyId, referralCode: sessionStorage.getItem("studenthub-referral") }) }).catch(() => undefined);
    } catch { /* Odchod na původní inzerát nesmí být blokován měřením. */ }
  }
  return <>
    <MobileFilterToolbar open={filtersOpen} activeCount={activeCount} onToggle={() => setFiltersOpen((open) => !open)} onReset={resetFilters} controlsId="job-filter-controls" />
    <section id="job-filter-controls" className={`filter-panel job-filters collapsible-filter-panel ${filtersOpen ? "is-open" : ""}`}>
      <label className="search-field"><span>Hledat brigádu</span><div><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pozice, firma, lokalita…" /></div></label>
      <label><span>Obor</span><div className="select-wrap"><select value={field} onChange={(event) => setField(event.target.value)}><option>{all}</option>{[...new Set(items.map((job) => job.field))].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Typ práce</span><div className="select-wrap"><select value={workType} onChange={(event) => setWorkType(event.target.value)}><option>{all}</option>{workTypeOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Rozsah práce</span><div className="select-wrap"><select value={workload} onChange={(event) => setWorkload(event.target.value)}><option>{all}</option>{workloadOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={16} /></div></label>
      <label><span>Lokalita</span><input value={locality} onChange={(event) => setLocality(event.target.value)} placeholder="Např. Brno-střed" /></label>
      <label><span>Typ odměny</span><div className="select-wrap"><select value={rewardUnit} onChange={(event) => setRewardUnit(event.target.value as "all" | "unspecified" | JobRewardUnit)}><option value="all">Všechny typy</option>{rewardUnitOptions.map((value) => <option key={value} value={value}>{rewardUnitLabels[value]}</option>)}<option value="unspecified">Neuvedeno</option></select><ChevronDown size={16} /></div></label>
      <label><span>Řazení</span><div className="select-wrap"><select value={sort} onChange={(event) => setSort(event.target.value as "verified" | "reward")}><option value="verified">Nejnověji ověřené</option><option value="reward">Nejvyšší hodinová odměna</option></select><ChevronDown size={16} /></div></label>
      <label><span>{minReward ? `Min. hodinová odměna: ${minReward} Kč` : "Bez minimální hodinové odměny"}</span><input aria-label="Minimální hodinová odměna" type="range" min="0" max="300" step="10" value={minReward} onChange={(event) => setMinReward(Number(event.target.value))} /></label>
      <label className="checkbox-field job-unknown-reward"><input type="checkbox" checked={includeUnspecified} onChange={(event) => setIncludeUnspecified(event.target.checked)} /><span>Zahrnout jiné typy odměny nebo neuvedenou sazbu</span></label>
    </section>
    <div className="result-toolbar"><div className="result-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? "schválená brigáda" : "schválených brigád"}</div><button className="button button-secondary" onClick={() => setShowProposal(true)}>Navrhnout brigádu</button></div>
    <section className="job-list" aria-live="polite">{filtered.length === 0 ? <div className="empty-state"><BriefcaseBusiness size={28} /><h2>{items.length ? "Filtrům neodpovídá žádná brigáda" : "Zatím nemáme ověřené brigády"}</h2><p>{items.length ? "Zkuste změnit nebo resetovat filtry." : <>Firma může poslat nabídku ke schválení. Další inzeráty najdete také na <a href="https://www.fajn-brigady.cz/vysledek.html?s_sekce=1&amp;id_lokality=okres-3702" target="_blank" rel="noopener noreferrer">Fajn-brigády.cz</a>.</>}</p></div> : filtered.map((job) => {
      const providerJob = job.providerKey === "fajn-brigady"; const hasLongDescription = job.description.length > 360;
      const metadata = [
        { label: "Odměna", value: formatJobReward(job) }, job.workload ? { label: "Rozsah", value: job.workload } : null,
        { label: "Typ", value: job.type }, { label: "Lokalita", value: job.location, location: true },
        job.positionsCount ? { label: "Volná místa", value: String(job.positionsCount) } : null,
        job.minimumEducation ? { label: "Min. vzdělání", value: job.minimumEducation } : null,
      ].filter(Boolean) as Array<{ label: string; value: string; location?: boolean }>;
      return <article className={`result-card job-card ${job.featured ? "featured" : ""}`} id={job.id} key={job.id} data-job-provider={job.providerKey || "manual"}><div className="job-heading"><span className="job-monogram">{job.company ? job.company.slice(0, 2).toUpperCase() : <BriefcaseBusiness size={20} aria-hidden="true" />}</span><div>{job.featured && <span className="sponsored">PLACENĚ ZVÝRAZNĚNO</span>}<h2>{job.title}</h2>{job.company && <p>{job.company}</p>}{job.positionLabel && job.positionLabel !== job.title && <small>{job.positionLabel}</small>}</div></div>
        {job.description && <>{<p className={`job-description ${hasLongDescription ? "is-long" : ""}`}>{job.description}</p>}{hasLongDescription && <details className="job-description-more"><summary>Celý popis</summary><p>{job.description}</p></details>}</>}
        <dl className="job-meta">{metadata.map((meta) => <div key={meta.label}><dt>{meta.label}</dt><dd>{meta.location && <MapPin size={14} />}{meta.value}</dd></div>)}</dl>
        {(job.benefits?.length || job.suitability?.length) && <div className="job-tags" aria-label="Benefity a vhodnost">{[...(job.benefits || []), ...(job.suitability || [])].map((label) => <span key={label}>{label}</span>)}</div>}
        {(job.applyUrl || job.contact) && <a className="button button-primary" href={job.applyUrl || `mailto:${job.contact}?subject=${encodeURIComponent(`Reakce na: ${job.title}`)}`} target={job.applyUrl ? "_blank" : undefined} rel={job.applyUrl ? "noopener noreferrer" : undefined} onClick={() => trackOutbound(job)}>{providerJob ? "Zobrazit nabídku a odpovědět" : "Odpovědět na nabídku"}</a>}
        {job.sourceUrl && <small className="source-note">Zdroj: <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer">{job.sourceLabel || "veřejný inzerát"}</a> · naposledy ověřeno {dateFormatter.format(new Date(job.lastVerifiedAt))}</small>}
      </article>;
    })}</section>
    {showProposal && <JobProposal onClose={() => setShowProposal(false)} />}
  </>;
}
