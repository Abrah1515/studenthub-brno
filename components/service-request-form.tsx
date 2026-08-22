"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { serviceRequestSchema, type ServiceRequestInput } from "@/lib/schemas";

const serviceOptions = [
  ["windows-linux", "Instalace / nastavení Windows nebo Linux"], ["cleaning", "Čištění notebooku"], ["ssd-ram", "Výměna SSD nebo RAM"], ["backup", "Zálohování dat"], ["wifi-printer", "Nastavení Wi‑Fi nebo tiskárny"], ["device-choice", "Pomoc s výběrem zařízení"], ["other", "Jiný problém"],
] as const;

export function ServiceRequestForm() {
  const [serverState, setServerState] = useState<{ type: "success" | "error"; message: string; reference?: string } | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ServiceRequestInput>({
    resolver: zodResolver(serviceRequestSchema),
    defaultValues: { publicTitle: "", publicAlias: "", name: "", email: "", phone: "", serviceType: "windows-linux", description: "", location: "", preferredDate: "", consent: false, publishConsent: false, company: "" },
  });
  async function submit(data: ServiceRequestInput) {
    setServerState(null);
    try {
      const response = await fetch("/api/service-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Poptávku se nepodařilo uložit.");
      setServerState({ type: "success", message: result.message, reference: result.reference });
      reset();
    } catch (error) { setServerState({ type: "error", message: error instanceof Error ? error.message : "Došlo k neočekávané chybě." }); }
  }
  if (serverState?.type === "success") return <div className="success-state" role="status" data-testid="request-success"><CheckCircle2 size={34} /><h2>Žádost je zveřejněná</h2><p>{serverState.message}</p><strong>Číslo žádosti: {serverState.reference}</strong><div className="card-actions"><Link className="button button-primary" href="/pomoc/moje">Moje žádosti</Link><button className="button button-secondary" onClick={() => setServerState(null)}>Odeslat další</button></div></div>;
  return (
    <form className="form-card request-form" onSubmit={handleSubmit(submit)} noValidate data-testid="service-request-form">
      <div className="form-intro"><h2>Popište, s čím potřebujete pomoct</h2><p>Kontaktní údaje uvidí pouze oprávněný administrátor. Odeslání nezakládá závaznou objednávku.</p></div>
      <div className="form-grid">
        <label className="form-span"><span>Veřejný název žádosti *</span><input {...register("publicTitle")} placeholder="Např. Pomoc s instalací Linuxu" aria-invalid={!!errors.publicTitle} />{errors.publicTitle && <small className="field-error">{errors.publicTitle.message}</small>}</label>
        <label><span>Veřejná přezdívka *</span><input {...register("publicAlias")} autoComplete="nickname" placeholder="Např. Adam F." aria-invalid={!!errors.publicAlias} />{errors.publicAlias && <small className="field-error">{errors.publicAlias.message}</small>}</label>
        <label><span>Jméno *</span><input {...register("name")} autoComplete="name" placeholder="Jan Novák" aria-invalid={!!errors.name} />{errors.name && <small className="field-error">{errors.name.message}</small>}</label>
        <label><span>Typ pomoci *</span><select {...register("serviceType")}>{serviceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.serviceType && <small className="field-error">{errors.serviceType.message}</small>}</label>
        <label><span>E-mail</span><input {...register("email")} type="email" autoComplete="email" placeholder="jan@example.cz" aria-invalid={!!errors.email} />{errors.email && <small className="field-error">{errors.email.message}</small>}</label>
        <label><span>Telefon</span><input {...register("phone")} type="tel" autoComplete="tel" placeholder="+420 777 000 000" aria-invalid={!!errors.phone} />{errors.phone && <small className="field-error">{errors.phone.message}</small>}</label>
        <label className="form-span"><span>Popis problému *</span><textarea {...register("description")} rows={5} placeholder="Co přesně nefunguje? Neuvádějte sem telefon ani e-mail." aria-invalid={!!errors.description} />{errors.description && <small className="field-error">{errors.description.message}</small>}</label>
        <label><span>Přibližná lokalita *</span><input {...register("location")} placeholder="Např. Královo Pole" aria-invalid={!!errors.location} />{errors.location && <small className="field-error">{errors.location.message}</small>}</label>
        <label><span>Preferovaný termín *</span><input {...register("preferredDate")} type="date" min={new Date().toISOString().slice(0, 10)} aria-invalid={!!errors.preferredDate} />{errors.preferredDate && <small className="field-error">{errors.preferredDate.message}</small>}</label>
        <label className="honeypot" aria-hidden="true"><span>Firma</span><input {...register("company")} tabIndex={-1} autoComplete="off" aria-hidden="true" /></label>
      </div>
      <label className="checkbox-field"><input {...register("consent")} type="checkbox" /><span>Souhlasím se zpracováním uvedených údajů za účelem vyřízení poptávky. Údaje nebudou veřejné. *</span></label>
      {errors.consent && <small className="field-error">{errors.consent.message}</small>}
      <label className="checkbox-field"><input {...register("publishConsent")} type="checkbox" /><span>Souhlasím s okamžitým zveřejněním přezdívky, názvu, popisu, typu pomoci, přibližné lokality a preferovaného termínu. Jméno, e-mail ani telefon se nezveřejní. *</span></label>
      {errors.publishConsent && <small className="field-error">{errors.publishConsent.message}</small>}
      {serverState?.type === "error" && <div className="error-state" role="alert"><TriangleAlert size={18} />{serverState.message}</div>}
      <div className="form-footer"><span><ShieldCheck size={17} />Serverová validace a ochrana proti spamu</span><button className="button button-primary" disabled={isSubmitting} type="submit">{isSubmitting ? <Loader2 className="spin" size={18} /> : <Send size={18} />}{isSubmitting ? "Ukládám…" : "Odeslat poptávku"}</button></div>
    </form>
  );
}
