"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export function AccountPasswordChange() {
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setMessage(""); if (password !== confirm) return setMessage("Hesla se neshodují."); setPending(true); const response = await fetch("/api/auth/update-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }); const payload = await response.json().catch(() => ({})); setPending(false); setMessage(payload.message || "Heslo se nepodařilo změnit."); if (response.ok) { setPassword(""); setConfirm(""); } }
  return <details className="account-password-change"><summary><KeyRound size={16} /> Změnit heslo</summary><form onSubmit={submit}><label><span>Nové heslo</span><input type="password" minLength={10} maxLength={128} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label><span>Nové heslo znovu</span><input type="password" minLength={10} maxLength={128} autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label><button className="button button-primary" disabled={pending}>Bezpečně změnit heslo</button>{message && <p role="status">{message}</p>}</form></details>;
}
