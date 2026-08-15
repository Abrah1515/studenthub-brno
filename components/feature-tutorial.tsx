"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, Flag, PlusCircle, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasResolvedCookieConsent } from "@/components/cookie-consent";
import { legacyPreferenceKey, olderPreferenceKey, preferenceKey, previousPreferenceKey, readPreference } from "@/lib/client-preferences";
import { useModalDialog } from "@/lib/use-modal-dialog";

export const tutorialVersion = "community-calendar-v1";
export const tutorialStorageKey = "studenthub-tutorial-version";
export const openTutorialEvent = "studenthub-open-tutorial";

export function FeatureTutorial() {
  const pathname = usePathname(); const firstVisit = useRef<boolean | null>(null); const [open, setOpen] = useState(false); const [full, setFull] = useState(false);
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    if (firstVisit.current == null) { const hadStoredPreference = [preferenceKey, previousPreferenceKey, olderPreferenceKey, legacyPreferenceKey].some((key) => localStorage.getItem(key)); firstVisit.current = !hadStoredPreference || !readPreference().completed; }
    let timer = 0;
    const tryOpen = (forced = false) => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!forced && localStorage.getItem(tutorialStorageKey) === tutorialVersion) return; if (!forced && (!hasResolvedCookieConsent() || !readPreference().completed)) return; if (document.querySelector('[aria-modal="true"]')) { if (!forced) timer = window.setTimeout(() => tryOpen(), 250); return; } setFull(forced || Boolean(firstVisit.current)); setOpen(true); }, forced ? 0 : 180); };
    const showAgain = () => tryOpen(true); const followSetup = () => tryOpen();
    window.addEventListener(openTutorialEvent, showAgain); window.addEventListener("studenthub-preference-changed", followSetup); window.addEventListener("studenthub-consent-changed", followSetup); tryOpen();
    return () => { window.clearTimeout(timer); window.removeEventListener(openTutorialEvent, showAgain); window.removeEventListener("studenthub-preference-changed", followSetup); window.removeEventListener("studenthub-consent-changed", followSetup); };
  }, [pathname]);
  const close = () => { localStorage.setItem(tutorialStorageKey, tutorialVersion); setOpen(false); };
  const dialogRef = useModalDialog<HTMLDivElement>(open, close); if (!open) return null;
  return <div className="onboarding-backdrop" data-modal-layer><div ref={dialogRef} tabIndex={-1} className="tutorial-card" role="dialog" aria-modal="true" aria-labelledby="feature-tutorial-title" data-modal-layer><div className="modal-head"><span className="tutorial-icon"><BookOpen size={24} /></span><button className="icon-button" data-autofocus aria-label="Zavřít návod" onClick={close}><X size={20} /></button></div><span className="eyebrow">{full ? "Vítejte ve StudentHubu" : "Novinka v kalendáři"}</span><h2 id="feature-tutorial-title">Školní termíny a akce jsou oddělené</h2>{full && <p>StudentHub spojuje ověřené akademické termíny, užitečná místa, nabídky a studentskou komunitu. Školu, fakultu a ročník můžete kdykoli změnit v části Moje škola.</p>}<div className="tutorial-steps"><article><span><CalendarDays size={20} /></span><div><strong>Školní termíny</strong><p>Pocházejí pouze z veřejných oficiálních zdrojů a ukazují datum posledního ověření.</p></div></article><article className="tutorial-highlight"><span><Sparkles size={20} /></span><div><strong>Přepínač „Co se děje“</strong><p>Otevírá komunitní akce. StudentHub jejich obsah předem neověřuje.</p></div></article><article className="tutorial-highlight"><span><PlusCircle size={20} /></span><div><strong>Tlačítko „Přidat akci“</strong><p>Akci zveřejníte bez účtu. Neveřejný odkaz slouží k pozdější úpravě nebo odstranění.</p></div></article><article className="tutorial-highlight"><span><Flag size={20} /></span><div><strong>Nahlášení obsahu</strong><p>Nevhodnou nebo neaktuální akci nahlaste. Více nezávislých hlášení ji automaticky skryje.</p></div></article></div><div className="tutorial-actions"><Link className="button button-primary" href="/brno/kalendar?view=community" onClick={close}>Otevřít Co se děje</Link><button className="button button-secondary" onClick={close}>Rozumím</button></div><small>Návod lze kdykoli znovu otevřít z menu.</small></div></div>;
}
