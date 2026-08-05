"use client";

import { CheckCircle2, Download, ExternalLink, MoreVertical, Share2, Smartphone, SquarePlus, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { detectPwaInstallPlatform, pwaInstallGuide, type PwaEnvironment } from "@/lib/pwa-install";
import { useModalDialog } from "@/lib/use-modal-dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallContextValue = {
  installed: boolean;
  ready: boolean;
  openInstall: (beforeOpen?: () => void, returnFocus?: () => HTMLElement | null) => Promise<void>;
};

const InstallContext = createContext<InstallContextValue | null>(null);

function currentEnvironment(): PwaEnvironment {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standaloneDisplay: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: navigatorWithStandalone.standalone === true,
  };
}

function InstallDialog({ open, close, environment }: { open: boolean; close: () => void; environment: PwaEnvironment | null }) {
  const dialogRef = useModalDialog<HTMLDivElement>(open, close);
  if (!open || !environment || typeof document === "undefined") return null;
  const guide = pwaInstallGuide(environment);
  const ios = detectPwaInstallPlatform(environment) === "ios";
  return createPortal(
    <div className="pwa-install-layer" data-modal-layer data-testid="pwa-install-dialog">
      <button type="button" className="pwa-install-backdrop" data-modal-layer aria-label="Zavřít instalační návod" onClick={close} />
      <div ref={dialogRef} tabIndex={-1} className="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" data-modal-layer>
        <div className="modal-head">
          <div><span className="eyebrow">Instalovatelná webová aplikace</span><h2 id="pwa-install-title">{guide.title}</h2></div>
          <button type="button" className="icon-button" data-autofocus aria-label="Zavřít instalační návod" onClick={close}><X size={20} /></button>
        </div>
        <div className="pwa-install-lead"><Smartphone size={24} aria-hidden="true" /><p>{guide.lead}</p></div>
        <ol className="pwa-install-steps">{guide.steps.map((step, index) => <li key={step}><span>{index === 0 ? <MoreVertical size={18} /> : index === 1 && ios ? <Share2 size={18} /> : index === 1 ? <Download size={18} /> : <SquarePlus size={18} />}</span><p>{step}</p></li>)}</ol>
        <p className="pwa-install-note"><ExternalLink size={16} aria-hidden="true" />StudentHub je webová PWA. Není nabízený v App Store ani Google Play.</p>
        <button type="button" className="button button-primary pwa-dialog-done" onClick={close}>Rozumím</button>
      </div>
    </div>,
    document.body,
  );
}

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const returnFocusRef = useRef<(() => HTMLElement | null) | null>(null);
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [environment, setEnvironment] = useState<PwaEnvironment | null>(null);

  const refreshEnvironment = useCallback(() => {
    const next = currentEnvironment();
    setEnvironment(next);
    setInstalled(detectPwaInstallPlatform(next) === "installed");
    setReady(true);
  }, []);

  useEffect(() => {
    refreshEnvironment();
    const beforeInstall = (event: Event) => {
      if (detectPwaInstallPlatform(currentEnvironment()) === "ios") return;
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      refreshEnvironment();
    };
    const appInstalled = () => { promptRef.current = null; setInstalled(true); setDialogOpen(false); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    displayMode.addEventListener("change", refreshEnvironment);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
      displayMode.removeEventListener("change", refreshEnvironment);
    };
  }, [refreshEnvironment]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    window.setTimeout(() => returnFocusRef.current?.()?.focus(), 0);
  }, []);

  const openInstall = useCallback(async (beforeOpen?: () => void, returnFocus?: () => HTMLElement | null) => {
    returnFocusRef.current = returnFocus || null;
    beforeOpen?.();
    const nextEnvironment = currentEnvironment();
    setEnvironment(nextEnvironment);
    if (detectPwaInstallPlatform(nextEnvironment) === "installed") { setInstalled(true); return; }
    const deferredPrompt = promptRef.current;
    if (!deferredPrompt) { setDialogOpen(true); return; }
    promptRef.current = null;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      else setDialogOpen(true);
    } catch {
      setDialogOpen(true);
    }
  }, []);

  const value = useMemo(() => ({ installed, ready, openInstall }), [installed, ready, openInstall]);
  return <InstallContext.Provider value={value}>{children}<InstallDialog open={dialogOpen} close={closeDialog} environment={environment} /></InstallContext.Provider>;
}

export function PwaInstallButton({ placement = "menu", onBeforeOpen, returnFocus }: { placement?: "menu" | "action"; onBeforeOpen?: () => void; returnFocus?: () => HTMLElement | null }) {
  const context = useContext(InstallContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (!context) return null;
  const label = context.ready && context.installed ? "Aplikace je nainstalovaná" : "Nainstalovat aplikaci";
  const Icon = context.ready && context.installed ? CheckCircle2 : Download;
  return <button ref={buttonRef} type="button" className={placement === "action" ? "button button-secondary pwa-install-action" : "pwa-install-link"} disabled={context.ready && context.installed} aria-label={label} onClick={() => void context.openInstall(onBeforeOpen, returnFocus || (() => buttonRef.current))}><Icon size={placement === "action" ? 18 : 14} aria-hidden="true" />{label}</button>;
}
