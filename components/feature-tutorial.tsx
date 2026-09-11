"use client";

import { ArrowLeft, ArrowRight, Check, MousePointer2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BrandSymbol } from "@/components/brand-logo";
import { hasResolvedCookieConsent } from "@/components/cookie-consent";
import { readPreference } from "@/lib/client-preferences";
import { detectPwaInstallPlatform } from "@/lib/pwa-install";
import {
  emptyTutorialState,
  openTutorialEvent,
  readTutorialState,
  resumeTutorialIndex,
  saveTutorialState,
  tutorialMenuEvent,
  tutorialSteps,
  tutorialStorageKey,
  tutorialVersion,
  type TutorialState,
  type TutorialStep,
} from "@/lib/tutorial";
import { useModalDialog } from "@/lib/use-modal-dialog";

export { openTutorialEvent, tutorialStorageKey, tutorialVersion };

type Phase = "closed" | "intro" | "tour";
type TargetRect = { top: number; left: number; width: number; height: number };
type Placement = "top" | "bottom" | "left" | "right";

function isBrnoPath(pathname: string) { return pathname === "/brno" || pathname.startsWith("/brno/"); }
function isVisible(element: HTMLElement) { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }

function IntroConfirmation({ confirm }: { confirm: () => void }) {
  const dialogRef = useModalDialog<HTMLDivElement>(true, undefined, { closeOnEscape: false });
  return <div ref={dialogRef} tabIndex={-1} className="tutorial-intro-layer" role="dialog" aria-modal="true" aria-labelledby="tutorial-intro-title" aria-describedby="tutorial-intro-description" data-testid="tutorial-intro" data-modal-layer>
    <div className="tutorial-intro-card">
      <BrandSymbol size={50} />
      <span className="eyebrow">Nezávislý studentský projekt</span>
      <h2 id="tutorial-intro-title">Vítej ve StudentHub Brno</h2>
      <p id="tutorial-intro-description">Praktické informace a studentské služby na jednom místě. Nejde o oficiální aplikaci žádné univerzity.</p>
      <button type="button" className="button button-primary" data-autofocus onClick={confirm}>Rozumím</button>
    </div>
  </div>;
}

function platformInstallDescription(fallback: string) {
  if (typeof navigator === "undefined" || typeof window === "undefined") return fallback;
  const platform = detectPwaInstallPlatform({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, standaloneDisplay: matchMedia("(display-mode: standalone)").matches, navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true });
  if (platform === "ios") return "V Safari otevři Sdílet a vyber Přidat na plochu. StudentHub pak spustíš jako aplikaci.";
  if (platform === "android") return "V Chrome použij Nainstalovat aplikaci nebo Přidat na plochu. StudentHub není aplikace z Google Play.";
  if (platform === "installed") return "StudentHub už běží jako nainstalovaná PWA. Návod můžeš dokončit bez další akce.";
  if (/Windows/i.test(navigator.userAgent)) return "V Chrome nebo Edge použij Nainstalovat aplikaci. StudentHub se pak otevře v samostatném okně.";
  return fallback;
}

function GuidedTour({ initialIndex, finish, skip }: { initialIndex: number; finish: (step: TutorialStep) => void; skip: (step: TutorialStep) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [index, setIndex] = useState(initialIndex);
  const [compact, setCompact] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [placement, setPlacement] = useState<Placement>("right");
  const [popoverHeight, setPopoverHeight] = useState(220);
  const popoverRef = useRef<HTMLDivElement>(null);
  const missingTimer = useRef(0);
  const initialFocusSet = useRef(false);
  const step = tutorialSteps[index];
  const description = step.id === "install" ? platformInstallDescription(step.description) : step.description;
  const close = useCallback(() => skip(step), [skip, step]);
  const dialogRef = useModalDialog<HTMLDivElement>(true, close);

  useEffect(() => {
    const media = matchMedia("(max-width: 860px)");
    const update = () => setCompact(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const targetId = compact ? step.compactTarget : step.desktopTarget;
  const advance = useCallback((direction = 1) => {
    setTargetRect(null);
    setIndex((current) => clamp(current + direction, 0, tutorialSteps.length - 1));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (initialFocusSet.current) return;
      const initialFocus = popoverRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      initialFocus?.focus({ preventScroll: true });
      initialFocusSet.current = document.activeElement === initialFocus;
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    window.clearTimeout(missingTimer.current);
    window.dispatchEvent(new CustomEvent(tutorialMenuEvent, { detail: { open: compact && Boolean(step.compactMenu) } }));
    let target: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      target = [...document.querySelectorAll<HTMLElement>(`[data-tour-id="${targetId}"]`)].find(isVisible) || null;
      if (!target) {
        missingTimer.current = window.setTimeout(() => {
          if (process.env.NODE_ENV !== "production") console.debug("tutorial_target_missing", { stepId: step.id, targetId, pathname });
          if (index < tutorialSteps.length - 1) advance(1); else skip(step);
        }, 220);
        return;
      }
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      const rect = target.getBoundingClientRect();
      const padding = 6;
      const nextTop = Math.max(4, rect.top - padding);
      const nextLeft = Math.max(4, rect.left - padding);
      const nextRect = {
        top: nextTop,
        left: nextLeft,
        width: Math.max(1, Math.min(rect.width + padding * 2, innerWidth - nextLeft - 4)),
        height: Math.max(1, Math.min(rect.height + padding * 2, innerHeight - nextTop - 4)),
      };
      const popoverWidth = popoverRef.current?.offsetWidth || Math.min(360, innerWidth - 24);
      const popoverHeight = popoverRef.current?.offsetHeight || 220;
      setPopoverHeight((current) => current === popoverHeight ? current : popoverHeight);
      const gap = 14;
      let nextPlacement: Placement = "right";
      if (innerWidth <= 860) nextPlacement = nextRect.top >= popoverHeight + gap + 12 ? "top" : "bottom";
      else if (nextRect.left >= popoverWidth + gap + 12) nextPlacement = "left";
      else if (innerWidth - (nextRect.left + nextRect.width) >= popoverWidth + gap + 12) nextPlacement = "right";
      else nextPlacement = nextRect.top >= popoverHeight + gap + 12 ? "top" : "bottom";
      setTargetRect(nextRect); setPlacement(nextPlacement);
      if (!resizeObserver) { resizeObserver = new ResizeObserver(measure); resizeObserver.observe(target); }
    };
    const timer = window.setTimeout(measure, compact && step.compactMenu ? 90 : 0);
    window.addEventListener("resize", measure); window.addEventListener("scroll", measure, true);
    return () => { disposed = true; window.clearTimeout(timer); window.clearTimeout(missingTimer.current); resizeObserver?.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [advance, compact, index, pathname, skip, step, targetId]);

  useEffect(() => () => { window.dispatchEvent(new CustomEvent(tutorialMenuEvent, { detail: { open: false } })); }, []);

  const popoverStyle = useMemo(() => {
    if (!targetRect) return { visibility: "hidden" } as React.CSSProperties;
    const width = Math.min(360, innerWidth - 24);
    const height = popoverHeight;
    let left = clamp(targetRect.left + targetRect.width / 2 - width / 2, 12, innerWidth - width - 12);
    let top = targetRect.top + targetRect.height + 14;
    if (placement === "top") top = targetRect.top - height - 14;
    if (placement === "right") { left = targetRect.left + targetRect.width + 14; top = targetRect.top + targetRect.height / 2 - height / 2; }
    if (placement === "left") { left = targetRect.left - width - 14; top = targetRect.top + targetRect.height / 2 - height / 2; }
    return { width, left: clamp(left, 12, innerWidth - width - 12), top: clamp(top, 12, innerHeight - height - 12) } as React.CSSProperties;
  }, [placement, popoverHeight, targetRect]);

  function remember(completedStep: TutorialStep, status: TutorialState["status"] = "in_progress") {
    const current = readTutorialState();
    saveTutorialState({ ...current, tutorialVersion, introConfirmed: true, status, lastCompletedStep: completedStep.id });
  }
  function next() { remember(step); if (index === tutorialSteps.length - 1) finish(step); else advance(1); }
  function back() { advance(-1); }
  function activateTarget() { if (!step.allowTargetAction || step.route === undefined) return; remember(step); advance(1); router.push(`/brno${step.route}`); }

  return <div ref={dialogRef} tabIndex={-1} className="guided-tour-layer" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title" aria-describedby="guided-tour-description" data-testid="guided-tutorial" data-tour-step={step.id} data-modal-layer>
    {targetRect && <button type="button" className="tutorial-spotlight" data-testid="tour-spotlight" aria-label={step.allowTargetAction ? `Otevřít: ${step.title}` : `Zvýrazněno: ${step.title}`} disabled={!step.allowTargetAction} onClick={activateTarget} style={{ top: targetRect.top, left: targetRect.left, width: targetRect.width, height: targetRect.height }}><span className="sr-only">{step.title}</span></button>}
    <div ref={popoverRef} className="tutorial-popover" data-placement={placement} style={popoverStyle}>
      <div className="tutorial-progress"><span>{index + 1} z {tutorialSteps.length}</span><span aria-hidden="true">{tutorialSteps.map((item, itemIndex) => <i key={item.id} className={itemIndex <= index ? "active" : ""} />)}</span></div>
      <span className="tutorial-pointer-label"><MousePointer2 size={15} />Interaktivní průvodce</span>
      <h2 id="guided-tour-title">{step.title}</h2>
      <p id="guided-tour-description">{description}</p>
      <div className="tutorial-actions">
        <button type="button" className="button button-ghost" onClick={() => skip(step)}>Přeskočit</button>
        <span className="tutorial-nav-actions">
          <button type="button" className="button button-secondary" onClick={back} disabled={index === 0} aria-label="Předchozí krok"><ArrowLeft size={17} />Zpět</button>
          <button type="button" className="button button-primary" data-autofocus onClick={next}>{index === tutorialSteps.length - 1 ? <><Check size={17} />Dokončit</> : <>Další<ArrowRight size={17} /></>}</button>
        </span>
      </div>
    </div>
  </div>;
}

export function FeatureTutorial() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("closed");
  const [initialIndex, setInitialIndex] = useState(0);

  const beginTour = useCallback((fromStart = false) => {
    const state = readTutorialState();
    saveTutorialState({ ...state, tutorialVersion, introConfirmed: true, status: "in_progress", lastCompletedStep: fromStart ? null : state.lastCompletedStep });
    setInitialIndex(fromStart ? 0 : resumeTutorialIndex(state)); setPhase("tour");
  }, []);

  useEffect(() => {
    const manual = () => { if (isBrnoPath(pathname)) beginTour(true); };
    window.addEventListener(openTutorialEvent, manual);
    return () => window.removeEventListener(openTutorialEvent, manual);
  }, [beginTour, pathname]);

  useEffect(() => {
    if (!isBrnoPath(pathname) || phase !== "closed") return;
    let timer = 0;
    const tryOpen = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!hasResolvedCookieConsent() || !readPreference().completed || document.querySelector('[aria-modal="true"]')) { timer = window.setTimeout(tryOpen, 250); return; }
        const state = readTutorialState();
        if (state.status === "completed" || state.status === "skipped") return;
        if (!state.introConfirmed) setPhase("intro");
        else beginTour(false);
      }, 180);
    };
    window.addEventListener("studenthub-preference-changed", tryOpen); window.addEventListener("studenthub-consent-changed", tryOpen); tryOpen();
    return () => { window.clearTimeout(timer); window.removeEventListener("studenthub-preference-changed", tryOpen); window.removeEventListener("studenthub-consent-changed", tryOpen); };
  }, [beginTour, pathname, phase]);

  const confirmIntro = useCallback(() => { saveTutorialState({ ...emptyTutorialState, introConfirmed: true, status: "in_progress" }); setInitialIndex(0); setPhase("tour"); }, []);
  const closeTour = useCallback((step: TutorialStep, status: "skipped" | "completed") => {
    const state = readTutorialState();
    saveTutorialState({ ...state, tutorialVersion, introConfirmed: true, status, lastCompletedStep: status === "completed" ? step.id : state.lastCompletedStep });
    window.dispatchEvent(new CustomEvent(tutorialMenuEvent, { detail: { open: false } })); setPhase("closed");
  }, []);
  const finishTour = useCallback((step: TutorialStep) => closeTour(step, "completed"), [closeTour]);
  const skipTour = useCallback((step: TutorialStep) => closeTour(step, "skipped"), [closeTour]);

  if (phase === "intro") return <IntroConfirmation confirm={confirmIntro} />;
  if (phase === "tour") return <GuidedTour key={initialIndex} initialIndex={initialIndex} finish={finishTour} skip={skipTour} />;
  return null;
}
