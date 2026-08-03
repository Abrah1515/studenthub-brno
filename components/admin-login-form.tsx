"use client";
import { Loader2, LockKeyhole, LogIn } from "lucide-react";
import { useState } from "react";

export function AdminLoginForm() {
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }); const result = await response.json(); if (!response.ok) { setError(result.message || "Přihlášení se nezdařilo."); setPending(false); return; } window.location.assign("/admin"); }
  return <form className="admin-login-card" onSubmit={submit}><span className="admin-login-icon"><LockKeyhole size={26} /></span><h1>Administrace</h1><p>Přístup je určen pouze schváleným správcům a fakultním editorům.</p><label><span>E-mail</span><input name="email" type="email" autoComplete="username" required /></label><label><span>Heslo</span><input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="field-error" role="alert">{error}</p>}<button className="button button-primary" disabled={pending}>{pending ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}{pending ? "Ověřuji…" : "Přihlásit se"}</button><small>V produkci ověřuje účet Supabase Auth. Lokální testovací přístup musí být výslovně povolen v prostředí.</small></form>;
}
