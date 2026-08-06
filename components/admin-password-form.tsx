"use client";

import { createBrowserClient } from "@supabase/ssr";
import { KeyRound, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function AdminPasswordForm() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const client = useMemo(() => url && anon ? createBrowserClient(url, anon, { auth: { detectSessionInUrl: false } }) : null, [url, anon]);
  const [recoveryState, setRecoveryState] = useState<"checking" | "ready" | "error">("checking");
  const [pending, setPending] = useState(false); const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function restoreRecoverySession() {
      if (!client) { if (active) { setError("Obnova vyžaduje připojený Supabase projekt."); setRecoveryState("error"); } return; }
      const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const fragmentError = fragment.get("error_description");
      if (fragmentError) { if (active) { setError("Odkaz je neplatný nebo vypršel. Vyžádejte si nový obnovovací e-mail."); setRecoveryState("error"); } return; }
      const accessToken = fragment.get("access_token"); const refreshToken = fragment.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (sessionError) { if (active) { setError("Odkaz se nepodařilo ověřit. Vyžádejte si nový obnovovací e-mail."); setRecoveryState("error"); } return; }
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        if (active) setRecoveryState("ready");
        return;
      }
      const { data, error: sessionError } = await client.auth.getSession();
      if (active) {
        if (sessionError || !data.session) { setError("Otevřete tuto stránku z nejnovějšího obnovovacího e-mailu."); setRecoveryState("error"); }
        else setRecoveryState("ready");
      }
    }
    void restoreRecoverySession();
    return () => { active = false; };
  }, [client]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); const form = new FormData(event.currentTarget); const password = String(form.get("password") || ""); const confirmation = String(form.get("confirmation") || "");
    if (password.length < 12) { setError("Heslo musí mít alespoň 12 znaků."); setPending(false); return; }
    if (password !== confirmation) { setError("Hesla se neshodují."); setPending(false); return; }
    if (!client || recoveryState !== "ready") { setError("Nejprve otevřete platný obnovovací odkaz."); setPending(false); return; }
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) { setError("Heslo se nepodařilo bezpečně uložit. Otevřete nový odkaz pro obnovu."); setPending(false); return; }
    window.location.assign("/admin");
  }
  return <form className="admin-login-card" onSubmit={submit}><span className="admin-login-icon"><KeyRound size={26} /></span><h1>Nastavení přístupu</h1><p>Zvolte nové unikátní heslo. Odkaz z pozvánky nebo obnovy je jednorázový.</p><label><span>Nové heslo</span><input name="password" type="password" autoComplete="new-password" minLength={12} required disabled={recoveryState !== "ready"} /></label><label><span>Potvrzení hesla</span><input name="confirmation" type="password" autoComplete="new-password" minLength={12} required disabled={recoveryState !== "ready"} /></label>{recoveryState === "checking" && <p role="status">Ověřuji obnovovací odkaz…</p>}{error && <p className="field-error" role="alert">{error}</p>}<button className="button button-primary" disabled={pending || recoveryState !== "ready"}>{pending || recoveryState === "checking" ? <Loader2 className="spin" size={18} /> : <KeyRound size={18} />}{pending ? "Ukládám…" : recoveryState === "checking" ? "Ověřuji odkaz…" : "Uložit heslo"}</button><small>Heslo zpracuje přímo Supabase Auth a StudentHub ho neukládá.</small></form>;
}
