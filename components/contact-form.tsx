"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { contactMessageSchema, type ContactMessageInput } from "@/lib/schemas";

export function ContactForm() {
  const [success, setSuccess] = useState(""); const [serverError, setServerError] = useState("");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ContactMessageInput>({ resolver: zodResolver(contactMessageSchema), defaultValues: { name: "", email: "", subject: "", message: "", company: "", cityId: "brno" } });
  async function submit(value: ContactMessageInput) { setServerError(""); setSuccess(""); const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); const result = await response.json(); if (!response.ok) { setServerError(result.message || "Zprávu se nepodařilo odeslat."); return; } setSuccess(result.message); reset(); }
  if (success) return <div className="success-state" role="status"><CheckCircle2 size={34} /><h2>Zpráva odeslána</h2><p>{success}</p><button className="button button-secondary" onClick={() => setSuccess("")}>Napsat další zprávu</button></div>;
  return <form className="form-card" onSubmit={handleSubmit(submit)} noValidate><div className="form-intro"><h2>Napište nám</h2><p>Odpovíme na e-mail, který uvedete. Heslo ani školní přihlašovací údaje nikdy neposílejte.</p></div><div className="form-grid"><label><span>Jméno *</span><input autoComplete="name" {...register("name")} />{errors.name && <small className="field-error">{errors.name.message}</small>}</label><label><span>E-mail *</span><input type="email" autoComplete="email" {...register("email")} />{errors.email && <small className="field-error">{errors.email.message}</small>}</label><label className="form-span"><span>Předmět *</span><input {...register("subject")} />{errors.subject && <small className="field-error">{errors.subject.message}</small>}</label><label className="form-span"><span>Zpráva *</span><textarea rows={7} {...register("message")} />{errors.message && <small className="field-error">{errors.message.message}</small>}</label><label className="honeypot" aria-hidden="true"><span>Company</span><input tabIndex={-1} autoComplete="off" aria-hidden="true" {...register("company")} /></label></div>{serverError && <p className="error-state" role="alert">{serverError}</p>}<div className="form-footer"><span>Kontaktní údaje nejsou veřejné.</span><button className="button button-primary" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="spin" size={18} /> : <Send size={18} />}{isSubmitting ? "Odesílám…" : "Odeslat zprávu"}</button></div></form>;
}
