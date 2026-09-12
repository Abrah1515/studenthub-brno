"use client";

import { ArrowLeft, ArrowRight, Check, MousePointer2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandSymbol } from "@/components/brand-logo";
import { hasResolvedCookieConsent } from "@/components/cookie-consent";
import { readPreference } from "@/lib/client-preferences";
import { detectPwaInstallPlatform } from "@/lib/pwa-install";
import {
  emptyTutorialState,
  matchingStepAfterLayoutChange,
  openTutorialEvent,
  readTutorialState,
  resumeTutorialIndex,
  saveTutorialState,
  tutorialLayoutForWidth,
  tutorialMenuEvent,
  tutorialResetUiEvent,
  tutorialStepsForLayout,
  tutorialStorageKey,
  tutorialVersion,
  type TutorialLayout,
  type TutorialPlacement,
  type TutorialState,
  type TutorialStep,
} from "@/lib/tutorial";
import { useModalDialog } from "@/lib/use-modal-dialog";

export { openTutorialEvent, tutorialStorageKey, tutorialVersion };

type Phase = "closed" | "intro" | "preparing" | "tour";
type TargetRect = { top: number; left: number; width: number; height: number };
type PopoverPosition = { placement: Exclude<TutorialPlacement, "auto">; style: React.CSSProperties };

const safeEdge = 12;
const targetGap = 14;

function isBrnoPath(pathname: string) { return pathname === "/brno" || pathname.startsWith("/brno/"); }
function reducedMotion() { return matchMedia("(prefers-reduced-motion: reduce)").matches; }
function wait(milliseconds: number) { return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)); }
function nextFrame() { return new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
function menu(open: boolean) { window.dispatchEvent(new CustomEvent(tutorialMenuEvent, { detail: { open } })); }

function targetFor(targetId: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('[data-tour-id="' + targetId + '"]')].find((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }) || null;
}

async function lockAvailableSteps(layout: TutorialLayout): Promise<readonly TutorialStep[]> {
  const configured = tutorialStepsForLayout(layout);
  menu(configured.some((item) => item.menuState === "open"));
  await nextFrame(); await nextFrame(); await wait(45);
  const available = configured.filter((item) => targetFor(item.targetId));
  menu(false);
  await nextFrame();
  return available;
}

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

function PreparingTutorial() {
  const dialogRef = useModalDialog<HTMLDivElement>(true, undefined, { closeOnEscape: false });
  return <div ref={dialogRef} tabIndex={-1} className="tutorial-intro-layer" role="dialog" aria-modal="true" aria-label="Příprava návodu" data-modal-layer>
    <div className="tutorial-intro-card tutorial-preparing" role="status"><BrandSymbol size={42} /><strong>Připravuji návod…</strong></div>
  </div>;
}

function platformInstallDescription(fallback: string) {
  if (typeof navigator === "undefined" || typeof window === "undefined") return fallback;
  const platform = detectPwaInstallPlatform({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, standaloneDisplay: matchMedia("(display-mode: standalone)").matches, navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true });
  if (platform === "ios") return "V Safari otevři Sdílet a vyber Přidat na plochu.";
  if (platform === "android") return "V Chrome použij Nainstalovat aplikaci nebo Přidat na plochu.";
  if (platform === "installed") return "StudentHub už běží jako nainstalovaná PWA.";
  if (/Windows/i.test(navigator.userAgent)) return "V Chrome nebo Edge použij Nainstalovat aplikaci.";
  return fallback;
}

async function revealTarget(target: HTMLElement, step: TutorialStep) {
  const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
  const viewportTop = safeEdge;
  const viewportBottom = innerHeight - safeEdge;
  let container: HTMLElement | null = null;
  if (step.scrollArea === "menu") container = target.closest<HTMLElement>(".mobile-menu-panel");
  if (step.scrollArea === "sidebar") container = target.closest<HTMLElement>(".desktop-nav");
  const targetRect = target.getBoundingClientRect();
  const bounds = container?.getBoundingClientRect() || { top: viewportTop, bottom: viewportBottom };
  const visibleTop = Math.max(viewportTop, bounds.top + 8);
  const visibleBottom = Math.min(viewportBottom, bounds.bottom - 8);
  let delta = 0;
  if (targetRect.top < visibleTop) delta = targetRect.top - visibleTop;
  else if (targetRect.bottom > visibleBottom) delta = targetRect.bottom - visibleBottom;
  if (!delta) return;
  if (container) container.scrollTo({ top: container.scrollTop + delta, behavior });
  else if (step.scrollArea === "viewport") window.scrollTo({ top: window.scrollY + delta, behavior });
  await wait(behavior === "smooth" ? 230 : 0);
  await nextFrame();
}

function positionPopover(rect: TargetRect, width: number, height: number, preferred: TutorialPlacement): PopoverPosition {
  const positions: Record<Exclude<TutorialPlacement, "auto">, { left: number; top: number; fits: boolean; space: number }> = {
    top: { left: rect.left + rect.width / 2 - width / 2, top: rect.top - height - targetGap, fits: rect.top - height - targetGap >= safeEdge, space: rect.top },
    bottom: { left: rect.left + rect.width / 2 - width / 2, top: rect.top + rect.height + targetGap, fits: rect.top + rect.height + targetGap + height <= innerHeight - safeEdge, space: innerHeight - rect.top - rect.height },
    left: { left: rect.left - width - targetGap, top: rect.top + rect.height / 2 - height / 2, fits: rect.left - width - targetGap >= safeEdge, space: rect.left },
    right: { left: rect.left + rect.width + targetGap, top: rect.top + rect.height / 2 - height / 2, fits: rect.left + rect.width + targetGap + width <= innerWidth - safeEdge, space: innerWidth - rect.left - rect.width },
  };
  const fallback: Array<Exclude<TutorialPlacement, "auto">> = preferred === "auto" ? ["right", "left", "bottom", "top"] : [preferred, preferred === "top" ? "bottom" : preferred === "bottom" ? "top" : preferred === "left" ? "right" : "left", "bottom", "top", "right", "left"].filter((item, index, all) => item !== "auto" && all.indexOf(item) === index) as Array<Exclude<TutorialPlacement, "auto">>;
  const placement = fallback.find((item) => positions[item].fits) || [...fallback].sort((left, right) => positions[right].space - positions[left].space)[0];
  const selected = positions[placement];
  return {
    placement,
    style: {
      width,
      left: clamp(selected.left, safeEdge, innerWidth - width - safeEdge),
      top: clamp(selected.top, safeEdge, innerHeight - height - safeEdge),
    },
  };
}

function GuidedTour({ resumeAfterStepId, finish, skip }: { resumeAfterStepId: string | null; finish: (step: TutorialStep) => void; skip: (step: TutorialStep) => void }) {
  const [layout, setLayout] = useState<TutorialLayout>(() => tutorialLayoutForWidth(innerWidth));
  const [steps, setSteps] = useState<readonly TutorialStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [popoverHeight, setPopoverHeight] = useState(220);
  const [placement, setPlacement] = useState<Exclude<TutorialPlacement, "auto">>("right");
  const popoverRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const stepsRef = useRef<readonly TutorialStep[]>([]);
  const indexRef = useRef(0);
  const initialFocusSet = useRef(false);
  const step = steps?.[index] || null;
  const close = useCallback(() => { if (step) skip(step); }, [skip, step]);
  const dialogRef = useModalDialog<HTMLDivElement>(true, close);

  useEffect(() => { stepsRef.current = steps || []; indexRef.current = index; }, [index, steps]);

  useEffect(() => {
    let cancelled = false;
    const selectedLayout = tutorialLayoutForWidth(innerWidth);
    void lockAvailableSteps(selectedLayout).then((available) => {
      if (cancelled || !available.length) return;
      const state = { ...readTutorialState(), lastCompletedStep: resumeAfterStepId };
      setLayout(selectedLayout);
      setSteps(available);
      setIndex(resumeTutorialIndex(available, state));
    });
    return () => { cancelled = true; menu(false); };
  }, [resumeAfterStepId]);

  useEffect(() => {
    let resizeTimer = 0;
    const resize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const nextLayout = tutorialLayoutForWidth(innerWidth);
        if (nextLayout === layout || !stepsRef.current.length) return;
        const request = ++generation.current;
        const previous = stepsRef.current;
        const currentId = previous[indexRef.current]?.id || "welcome";
        setTargetRect(null);
        void lockAvailableSteps(nextLayout).then((available) => {
          if (generation.current !== request || !available.length) return;
          setLayout(nextLayout);
          setSteps(available);
          setIndex(matchingStepAfterLayoutChange(previous, available, currentId));
        });
      }, 140);
    };
    window.addEventListener("resize", resize);
    return () => { window.clearTimeout(resizeTimer); window.removeEventListener("resize", resize); };
  }, [layout]);

  useEffect(() => {
    if (!step) return;
    let disposed = false;
    let missingTimer = 0;
    let targetObserver: ResizeObserver | null = null;
    let popoverObserver: ResizeObserver | null = null;
    setTargetRect(null);
    menu(step.menuState === "open");
    const measure = () => {
      const target = targetFor(step.targetId);
      if (!target || disposed) return;
      const raw = target.getBoundingClientRect();
      const padding = 6;
      const rect = {
        top: Math.max(4, raw.top - padding),
        left: Math.max(4, raw.left - padding),
        width: Math.max(1, Math.min(raw.width + padding * 2, innerWidth - Math.max(4, raw.left - padding) - 4)),
        height: Math.max(1, Math.min(raw.height + padding * 2, innerHeight - Math.max(4, raw.top - padding) - 4)),
      };
      const width = Math.min(360, innerWidth - safeEdge * 2);
      const height = Math.max(popoverRef.current?.offsetHeight || 220, 280);
      const positioned = positionPopover(rect, width, height, step.preferredPlacement);
      setPopoverHeight((current) => current === height ? current : height);
      setPlacement(positioned.placement);
      setTargetRect(rect);
    };
    const prepare = async () => {
      await nextFrame(); await nextFrame();
      if (step.menuState === "open") await wait(55);
      const target = targetFor(step.targetId);
      if (!target) {
        missingTimer = window.setTimeout(() => {
          if (process.env.NODE_ENV !== "production") console.debug("tutorial_target_missing", { stepId: step.id, targetId: step.targetId, layout });
          if (index < (steps?.length || 0) - 1) setIndex((current) => current + 1);
          else skip(step);
        }, 220);
        return;
      }
      await revealTarget(target, step);
      if (disposed) return;
      measure();
      targetObserver = new ResizeObserver(measure); targetObserver.observe(target);
      if (popoverRef.current) { popoverObserver = new ResizeObserver(measure); popoverObserver.observe(popoverRef.current); }
    };
    void prepare();
    window.addEventListener("scroll", measure, true);
    return () => {
      disposed = true; window.clearTimeout(missingTimer);
      targetObserver?.disconnect(); popoverObserver?.disconnect();
      window.removeEventListener("scroll", measure, true);
    };
  }, [index, layout, skip, step, steps?.length]);

  useEffect(() => {
    if (!step || initialFocusSet.current) return;
    const timer = window.setTimeout(() => {
      const button = popoverRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      button?.focus({ preventScroll: true });
      initialFocusSet.current = document.activeElement === button;
    }, 80);
    return () => window.clearTimeout(timer);
  }, [step]);

  const remember = useCallback((completedStep: TutorialStep, status: TutorialState["status"] = "in_progress", lastCompletedStep: string | null = completedStep.id) => {
    const current = readTutorialState();
    saveTutorialState({ ...current, tutorialVersion, introConfirmed: true, status, lastCompletedStep });
  }, []);

  const next = useCallback(() => {
    if (!step || !steps) return;
    remember(step);
    setTargetRect(null);
    if (index === steps.length - 1) finish(step);
    else setIndex((current) => current + 1);
  }, [finish, index, remember, step, steps]);

  const back = useCallback(() => {
    if (!step || !steps || index === 0) return;
    const previousIndex = index - 1;
    remember(step, "in_progress", steps[previousIndex - 1]?.id || null);
    setTargetRect(null);
    setIndex(previousIndex);
  }, [index, remember, step, steps]);

  useEffect(() => {
    if (layout !== "desktop") return;
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) return;
      if (event.key === "ArrowRight") { event.preventDefault(); next(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); back(); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [back, layout, next]);

  useEffect(() => () => menu(false), []);

  const description = step?.id === "install" ? platformInstallDescription(step.description) : step?.description;
  const popoverPosition = useMemo(() => {
    if (!targetRect || !step) return { visibility: "hidden" } as React.CSSProperties;
    return positionPopover(targetRect, Math.min(360, innerWidth - safeEdge * 2), popoverHeight, step.preferredPlacement).style;
  }, [popoverHeight, step, targetRect]);

  return <div ref={dialogRef} tabIndex={-1} className="guided-tour-layer" role="dialog" aria-modal="true" aria-labelledby={step ? "guided-tour-title" : undefined} aria-describedby={step ? "guided-tour-description" : undefined} data-testid="guided-tutorial" data-tour-step={step?.id || "preparing"} data-tour-layout={layout} data-tour-target={step?.targetId} data-modal-layer>
    {targetRect && <div className="tutorial-spotlight" data-testid="tour-spotlight" aria-hidden="true" style={{ top: targetRect.top, left: targetRect.left, width: targetRect.width, height: targetRect.height }} />}
    {step ? <div ref={popoverRef} className="tutorial-popover" data-placement={placement} style={popoverPosition}>
      <div className="tutorial-progress"><span>{index + 1} z {steps?.length || 0}</span><span aria-hidden="true">{steps?.map((item, itemIndex) => <i key={item.id} className={itemIndex <= index ? "active" : ""} />)}</span></div>
      <span className="tutorial-pointer-label"><MousePointer2 size={15} />Interaktivní průvodce</span>
      <h2 id="guided-tour-title">{step.title}</h2>
      <p id="guided-tour-description">{description}</p>
      <div className="tutorial-actions">
        <button type="button" className="button button-ghost" onClick={() => skip(step)}>Přeskočit</button>
        <span className="tutorial-nav-actions">
          <button type="button" className="button button-secondary" onClick={back} disabled={index === 0} aria-label="Předchozí krok"><ArrowLeft size={17} />Zpět</button>
          <button type="button" className="button button-primary" data-autofocus onClick={next}>{index === (steps?.length || 0) - 1 ? <><Check size={17} />Dokončit</> : <>Další<ArrowRight size={17} /></>}</button>
        </span>
      </div>
    </div> : <div className="tutorial-loading" role="status">Připravuji dostupné kroky…</div>}
  </div>;
}

export function FeatureTutorial() {
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("closed");
  const [resumeAfterStepId, setResumeAfterStepId] = useState<string | null>(null);

  const beginTour = useCallback((fromStart = false) => {
    const state = readTutorialState();
    const resumeAfter = fromStart ? null : state.lastCompletedStep;
    saveTutorialState({ ...state, tutorialVersion, introConfirmed: true, status: "in_progress", lastCompletedStep: resumeAfter });
    window.dispatchEvent(new Event(tutorialResetUiEvent));
    menu(false);
    setResumeAfterStepId(resumeAfter);
    setPhase("preparing");
    if (pathname !== "/brno") router.replace("/brno");
  }, [pathname, router]);

  useEffect(() => {
    if (phase !== "preparing" || pathname !== "/brno") return;
    window.scrollTo({ top: 0, behavior: "auto" });
    const timer = window.setTimeout(() => setPhase("tour"), 60);
    return () => window.clearTimeout(timer);
  }, [pathname, phase]);

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

  const confirmIntro = useCallback(() => {
    saveTutorialState({ ...emptyTutorialState, introConfirmed: true, status: "in_progress" });
    beginTour(true);
  }, [beginTour]);

  const closeTour = useCallback((step: TutorialStep, status: "skipped" | "completed") => {
    const state = readTutorialState();
    saveTutorialState({ ...state, tutorialVersion, introConfirmed: true, status, lastCompletedStep: status === "completed" ? step.id : state.lastCompletedStep });
    menu(false);
    setPhase("closed");
  }, []);

  if (phase === "intro") return <IntroConfirmation confirm={confirmIntro} />;
  if (phase === "preparing") return <PreparingTutorial />;
  if (phase === "tour") return <GuidedTour resumeAfterStepId={resumeAfterStepId} finish={(step) => closeTour(step, "completed")} skip={(step) => closeTour(step, "skipped")} />;
  return null;
}
