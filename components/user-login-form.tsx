"use client";

import { CheckCircle2, LogIn } from "lucide-react";
import { useState } from "react";

export function UserLoginForm({ next = "/partak", description = "Příspěvky „Hledám parťáka“ mohou přidávat pouze účty s ověřeným e-mailem." }: { next?: string; description?: string }) {
  const [email, setEmail] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: React.FormEvent) { event.preventDefault(); setPending(true); setError(""); const response = await fetch("/api/auth/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, next }) }); const result = await response.json(); setPending(false); if (!response.ok) return setError(result.message || "Přihlášení se nepodařilo."); setMessage(result.message); }
  if (message) return <div className="success-state"><CheckCircle2 size={32} /><h2>Zkontrolujte e-mail</h2><p>{message}</p></div>;
  return <form className="form-card auth-card" onSubmit={submit}><h2>Přihlášení ověřovacím odkazem</h2><p>Heslo ani školní přihlašovací údaje nevytváříme. {description}</p><label><span>E-mail</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>{error && <p className="field-error" role="alert">{error}</p>}<button className="button button-primary" disabled={pending}><LogIn size={17} />{pending ? "Odesílám…" : "Poslat ověřovací odkaz"}</button></form>;
}
