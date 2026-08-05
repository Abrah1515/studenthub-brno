"use client";

import { Cookie, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useModalDialog } from "@/lib/use-modal-dialog";

type Consent = { analytics: boolean; marketing: boolean };
const defaultConsent: Consent = { analytics: false, marketing: false };

function syncAnalyticsCookie(consent: Consent) {
  document.cookie = consent.analytics ? `sh_analytics_consent=1; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}` : "sh_analytics_consent=; Path=/; Max-Age=0; SameSite=Lax";
}

function saveConsent(consent: Consent) {
  localStorage.setItem("studenthub-consent", JSON.stringify(consent));
  syncAnalyticsCookie(consent);
  window.dispatchEvent(new CustomEvent("studenthub-consent-changed", { detail: consent }));
}

export function hasResolvedCookieConsent() {
  try { const value = JSON.parse(localStorage.getItem("studenthub-consent") || "null"); return typeof value?.analytics === "boolean" && typeof value?.marketing === "boolean"; } catch { return false; }
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [consent, setConsent] = useState<Consent>(defaultConsent);
  const close = () => { if (!hasResolvedCookieConsent()) saveConsent(defaultConsent); setOpen(false); };
  const dialogRef = useModalDialog(open, close);

  useEffect(() => {
    const saved = localStorage.getItem("studenthub-consent");
    if (saved) {
      try { const parsed = JSON.parse(saved) as Consent; setConsent(parsed); syncAnalyticsCookie(parsed); } catch { setOpen(true); }
    } else setOpen(true);
    const handler = () => { setSettings(true); setOpen(true); };
    window.addEventListener("open-cookie-settings", handler);
    return () => window.removeEventListener("open-cookie-settings", handler);
  }, []);

  if (!open) return null;
  return (
    <div ref={dialogRef} tabIndex={-1} className="consent-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title" data-testid="cookie-consent" data-modal-layer>
      <div className="consent-icon"><Cookie size={22} /></div>
      <div className="consent-copy">
        <div className="consent-title-row"><h2 id="consent-title">Vaše soukromí, vaše volba</h2>{settings && <button className="icon-button" aria-label="Zavřít nastavení cookies" onClick={close}><X size={18} /></button>}</div>
        <p>Technické cookies zajišťují chod aplikace. Analytiku ani reklamu bez vašeho souhlasu nenačítáme.</p>
        {settings && (
          <div className="consent-settings">
            <label><span><strong>Technické</strong><small>Nezbytné pro motiv a přihlášení</small></span><input type="checkbox" checked disabled aria-label="Technické cookies jsou vždy povolené" /></label>
            <label><span><strong>Analytické</strong><small>Anonymní zlepšování aplikace</small></span><input type="checkbox" checked={consent.analytics} onChange={(event) => setConsent({ ...consent, analytics: event.target.checked })} /></label>
            <label><span><strong>Marketingové</strong><small>Budoucí partnerské kampaně</small></span><input type="checkbox" checked={consent.marketing} onChange={(event) => setConsent({ ...consent, marketing: event.target.checked })} /></label>
          </div>
        )}
      </div>
      <div className="consent-actions">
        <button className="button button-secondary" onClick={() => setSettings(true)}><SlidersHorizontal size={17} />Upravit</button>
        <button className="button button-secondary" data-autofocus onClick={() => { saveConsent(defaultConsent); setOpen(false); }}>Pouze nezbytné</button>
        <button className="button button-primary" onClick={() => { const all = { analytics: true, marketing: true }; saveConsent(all); setConsent(all); setOpen(false); }}>Povolit vše</button>
        {settings && <button className="button button-primary" onClick={() => { saveConsent(consent); setOpen(false); }}>Uložit volbu</button>}
      </div>
    </div>
  );
}
