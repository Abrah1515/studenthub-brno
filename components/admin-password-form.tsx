"use client";

import { createBrowserClient } from "@supabase/ssr";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";

export function AdminPasswordForm() {
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); const form = new FormData(event.currentTarget); const password = String(form.get("password") || ""); const confirmation = String(form.get("confirmation") || "");
    if (password.length < 12) { setError("Heslo musí mít alespoň 12 znaků."); setPending(false); return; }
    if (password !== confirmation) { setError("Hesla se neshodují."); setPending(false); return; }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) { setError("Obnova vyžaduje připojený Supabase projekt."); setPending(false); return; }
    const client = createBrowserClient(url, anon); const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) { setError("Heslo se nepodařilo bezpečně uložit. Otevřete nový odkaz pro obnovu."); setPending(false); return; }
    window.location.assign("/admin");
  }
  return <form className="admin-login-card" onSubmit={submit}><span className="admin-login-icon"><KeyRound size={26} /></span><h1>Nastavení přístupu</h1><p>Zvolte nové unikátní heslo. Odkaz z pozvánky nebo obnovy je jednorázový.</p><label><span>Nové heslo</span><input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><label><span>Potvrzení hesla</span><input name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></label>{error && <p className="field-error" role="alert">{error}</p>}<button className="button button-primary" disabled={pending}>{pending ? <Loader2 className="spin" size={18} /> : <KeyRound size={18} />}{pending ? "Ukládám…" : "Uložit heslo"}</button><small>Heslo zpracuje přímo Supabase Auth a StudentHub ho neukládá.</small></form>;
}
