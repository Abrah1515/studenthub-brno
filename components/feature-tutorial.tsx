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
  tutorialMotion,
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
type TargetRect = { top: number; left: number; width: number; height: number; radius: number };
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

function motionWait(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  if (milliseconds <= 0) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const timer = window.setTimeout(() => { cleanup(); resolve(true); }, milliseconds);
    const abort = () => { window.clearTimeout(timer); cleanup(); resolve(false); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function waitForScrollSettle(readPosition: () => number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const startedAt = performance.now();
    let last = readPosition();
    let stableFrames = 0;
    let frame = 0;
    const finish = (value: boolean) => { cancelAnimationFrame(frame); signal.removeEventListener("abort", abort); resolve(value); };
    const abort = () => finish(false);
    const sample = () => {
      if (signal.aborted) return finish(false);
      const current = readPosition();
      stableFrames = Math.abs(current - last) < .5 ? stableFrames + 1 : 0;
      last = current;
      if (stableFrames >= 4 || performance.now() - startedAt >= tutorialMotion.scrollMaxMs) return finish(true);
      frame = requestAnimationFrame(sample);
    };
    signal.addEventListener("abort", abort, { once: true });
    frame = requestAnimationFrame(sample);
  });
}

async function revealTarget(target: HTMLElement, step: TutorialStep, signal: AbortSignal) {
  const animate = !reducedMotion();
  const behavior: ScrollBehavior = animate ? "smooth" : "auto";
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
  if (!delta) return true;
  if (container) container.scrollTo({ top: container.scrollTop + delta, behavior });
  else if (step.scrollArea === "viewport") window.scrollTo({ top: window.scrollY + delta, behavior });
  if (animate) {
    const settled = await waitForScrollSettle(() => container ? container.scrollTop : window.scrollY, signal);
    if (!settled) {
      if (container) container.scrollTo({ top: container.scrollTop, behavior: "auto" });
      else window.scrollTo({ top: window.scrollY, behavior: "auto" });
      return false;
    }
  }
  await nextFrame();
  return !signal.aborted;
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
      transform: `translate3d(${clamp(selected.left, safeEdge, innerWidth - width - safeEdge)}px, ${clamp(selected.top, safeEdge, innerHeight - height - safeEdge)}px, 0)`,
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
  const [anchorStep, setAnchorStep] = useState<TutorialStep | null>(null);
  const [transitioning, setTransitioning] = useState(true);
  const [contentVisible, setContentVisible] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const stepsRef = useRef<readonly TutorialStep[]>([]);
  const indexRef = useRef(0);
  const layoutRef = useRef(layout);
  const currentStepRef = useRef<TutorialStep | null>(null);
  const targetRectRef = useRef<TargetRect | null>(null);
  const menuOpenRef = useRef(false);
  const transitioningRef = useRef(true);
  const transitionAbortRef = useRef<AbortController | null>(null);
  const trackingCleanupRef = useRef<(() => void) | null>(null);
  const resizeRequestRef = useRef(0);
  const step = steps?.[index] || null;
  const close = useCallback(() => { if (step) skip(step); }, [skip, step]);
  const dialogRef = useModalDialog<HTMLDivElement>(true, close);

  useEffect(() => {
    stepsRef.current = steps || [];
    indexRef.current = index;
    layoutRef.current = layout;
    currentStepRef.current = step;
  }, [index, layout, step, steps]);

  const stopTracking = useCallback(() => {
    trackingCleanupRef.current?.();
    trackingCleanupRef.current = null;
  }, []);

  const measureTarget = useCallback((target: HTMLElement, measuredStep: TutorialStep) => {
    const raw = target.getBoundingClientRect();
    const padding = 6;
    const top = Math.max(4, raw.top - padding);
    const left = Math.max(4, raw.left - padding);
    const width = Math.max(1, Math.min(raw.width + padding * 2, innerWidth - left - 4));
    const height = Math.max(1, Math.min(raw.height + padding * 2, innerHeight - top - 4));
    const rawRadius = Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 8;
    const rect = { top, left, width, height, radius: clamp(rawRadius + 3, 6, Math.min(30, height / 2)) };
    const popoverWidth = Math.min(360, innerWidth - safeEdge * 2);
    const heightForPlacement = Math.max(popoverRef.current?.offsetHeight || 220, 280);
    const positioned = positionPopover(rect, popoverWidth, heightForPlacement, measuredStep.preferredPlacement);
    setPopoverHeight((current) => current === heightForPlacement ? current : heightForPlacement);
    setPlacement(positioned.placement);
    setAnchorStep(measuredStep);
    targetRectRef.current = rect;
    setTargetRect(rect);
    return rect;
  }, []);

  const startTracking = useCallback((trackedStep: TutorialStep, trackedTarget: HTMLElement, request: number) => {
    stopTracking();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (generation.current !== request || transitioningRef.current) return;
        const current = targetFor(trackedStep.targetId) || trackedTarget;
        measureTarget(current, trackedStep);
      });
    };
    const targetObserver = new ResizeObserver(schedule);
    const popoverObserver = new ResizeObserver(schedule);
    targetObserver.observe(trackedTarget);
    if (popoverRef.current) popoverObserver.observe(popoverRef.current);
    window.addEventListener("scroll", schedule, true);
    trackingCleanupRef.current = () => {
      cancelAnimationFrame(frame);
      targetObserver.disconnect();
      popoverObserver.disconnect();
      window.removeEventListener("scroll", schedule, true);
    };
  }, [measureTarget, stopTracking]);

  const setTourMenu = useCallback(async (open: boolean, signal: AbortSignal) => {
    const changed = menuOpenRef.current !== open;
    if (changed) {
      menu(open);
      menuOpenRef.current = open;
    }
    await nextFrame();
    await nextFrame();
    if (changed && open && !reducedMotion()) return motionWait(tutorialMotion.menuMs, signal);
    return !signal.aborted;
  }, []);

  const focusPrimaryAction = useCallback(() => {
    const button = popoverRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    button?.focus({ preventScroll: true });
  }, []);

  const transitionTo = useCallback(async (destinationSteps: readonly TutorialStep[], requestedIndex: number, destinationLayout: TutorialLayout, direction: -1 | 0 | 1, force = false) => {
    if ((!force && transitioningRef.current) || !destinationSteps.length) return;
    transitionAbortRef.current?.abort();
    stopTracking();
    const controller = new AbortController();
    transitionAbortRef.current = controller;
    const request = ++generation.current;
    transitioningRef.current = true;
    setTransitioning(true);

    try {
      let destinationIndex = clamp(requestedIndex, 0, destinationSteps.length - 1);
      let destinationStep = destinationSteps[destinationIndex];
      let target: HTMLElement | null = null;
      const searchDirection = direction < 0 ? -1 : 1;

      while (destinationStep) {
        const menuReady = await setTourMenu(destinationStep.menuState === "open", controller.signal);
        if (!menuReady || controller.signal.aborted) return;
        target = targetFor(destinationStep.targetId);
        if (target) break;
        if (process.env.NODE_ENV !== "production") console.debug("tutorial_target_missing", { stepId: destinationStep.id, targetId: destinationStep.targetId, layout: destinationLayout });
        destinationIndex += searchDirection;
        destinationStep = destinationSteps[destinationIndex];
      }

      if (!destinationStep || !target) {
        const current = currentStepRef.current;
        if (current) skip(current);
        return;
      }

      const revealed = await revealTarget(target, destinationStep, controller.signal);
      if (!revealed || controller.signal.aborted || generation.current !== request) return;
      target = targetFor(destinationStep.targetId) || target;
      const animateSpotlight = targetRectRef.current !== null && !reducedMotion();
      measureTarget(target, destinationStep);
      await nextFrame();
      await nextFrame();
      if (animateSpotlight && !await motionWait(tutorialMotion.spotlightMs, controller.signal)) return;
      if (controller.signal.aborted || generation.current !== request) return;

      setContentVisible(false);
      if (!await motionWait(reducedMotion() ? 35 : tutorialMotion.textSwapMs, controller.signal)) return;
      stepsRef.current = destinationSteps;
      indexRef.current = destinationIndex;
      layoutRef.current = destinationLayout;
      currentStepRef.current = destinationStep;
      setLayout(destinationLayout);
      setSteps(destinationSteps);
      setIndex(destinationIndex);
      await nextFrame();
      await nextFrame();
      if (controller.signal.aborted || generation.current !== request) return;
      target = targetFor(destinationStep.targetId) || target;
      measureTarget(target, destinationStep);
      setContentVisible(true);
      if (!await motionWait(reducedMotion() ? 60 : tutorialMotion.textMs, controller.signal)) return;
      if (controller.signal.aborted || generation.current !== request) return;
      transitioningRef.current = false;
      setTransitioning(false);
      startTracking(destinationStep, target, request);
      await nextFrame();
      if (controller.signal.aborted || generation.current !== request) return;
      focusPrimaryAction();
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("tutorial_transition_failed", { message: error instanceof Error ? error.message : "unknown" });
        setContentVisible(true);
        transitioningRef.current = false;
        setTransitioning(false);
      }
    }
  }, [focusPrimaryAction, measureTarget, setTourMenu, skip, startTracking, stopTracking]);

  useEffect(() => {
    let cancelled = false;
    const selectedLayout = tutorialLayoutForWidth(innerWidth);
    void lockAvailableSteps(selectedLayout).then((available) => {
      if (cancelled || !available.length) return;
      const state = { ...readTutorialState(), lastCompletedStep: resumeAfterStepId };
      menuOpenRef.current = false;
      void transitionTo(available, resumeTutorialIndex(available, state), selectedLayout, 1, true);
    });
    return () => {
      cancelled = true;
      transitionAbortRef.current?.abort();
      stopTracking();
      menu(false);
      menuOpenRef.current = false;
    };
  }, [resumeAfterStepId, stopTracking, transitionTo]);

  useEffect(() => {
    let resizeTimer = 0;
    const resize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const nextLayout = tutorialLayoutForWidth(innerWidth);
        if (!stepsRef.current.length) return;
        const previous = stepsRef.current;
        const currentId = previous[indexRef.current]?.id || "welcome";
        if (nextLayout === layoutRef.current) {
          void transitionTo(previous, indexRef.current, nextLayout, 0, true);
          return;
        }
        const resizeRequest = ++resizeRequestRef.current;
        transitionAbortRef.current?.abort();
        stopTracking();
        transitioningRef.current = true;
        setTransitioning(true);
        void lockAvailableSteps(nextLayout).then((available) => {
          if (resizeRequestRef.current !== resizeRequest || !available.length) return;
          menuOpenRef.current = false;
          void transitionTo(available, matchingStepAfterLayoutChange(previous, available, currentId), nextLayout, 0, true);
        });
      }, 140);
    };
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [stopTracking, transitionTo]);

  const remember = useCallback((completedStep: TutorialStep, status: TutorialState["status"] = "in_progress", lastCompletedStep: string | null = completedStep.id) => {
    const current = readTutorialState();
    saveTutorialState({ ...current, tutorialVersion, introConfirmed: true, status, lastCompletedStep });
  }, []);

  const next = useCallback(() => {
    if (!step || !steps || transitioningRef.current) return;
    remember(step);
    if (index === steps.length - 1) finish(step);
    else void transitionTo(steps, index + 1, layout, 1, true);
  }, [finish, index, layout, remember, step, steps, transitionTo]);

  const back = useCallback(() => {
    if (!step || !steps || index === 0 || transitioningRef.current) return;
    const previousIndex = index - 1;
    remember(step, "in_progress", steps[previousIndex - 1]?.id || null);
    void transitionTo(steps, previousIndex, layout, -1, true);
  }, [index, layout, remember, step, steps, transitionTo]);

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

  const description = step?.id === "install" ? platformInstallDescription(step.description) : step?.description;
  const popoverPosition = useMemo(() => {
    if (!targetRect || !anchorStep) return { visibility: "hidden" } as React.CSSProperties;
    return positionPopover(targetRect, Math.min(360, innerWidth - safeEdge * 2), popoverHeight, anchorStep.preferredPlacement).style;
  }, [anchorStep, popoverHeight, targetRect]);

  return <div ref={dialogRef} tabIndex={-1} className="guided-tour-layer" role="dialog" aria-modal="true" aria-busy={transitioning} aria-labelledby={step ? "guided-tour-title" : undefined} aria-describedby={step ? "guided-tour-description" : undefined} data-testid="guided-tutorial" data-tour-step={step?.id || "preparing"} data-tour-layout={layout} data-tour-target={step?.targetId} data-tour-transitioning={transitioning} data-modal-layer>
    {targetRect && <div className="tutorial-spotlight" data-testid="tour-spotlight" aria-hidden="true" style={{ transform: `translate3d(${targetRect.left}px, ${targetRect.top}px, 0)`, width: targetRect.width, height: targetRect.height, borderRadius: targetRect.radius }} />}
    {step ? <div ref={popoverRef} className="tutorial-popover" data-placement={placement} data-content-visible={contentVisible} style={popoverPosition}>
      <div key={step.id} className="tutorial-popover-content" aria-live="polite">
        <div className="tutorial-progress"><span>{index + 1} z {steps?.length || 0}</span><span aria-hidden="true">{steps?.map((item, itemIndex) => <i key={item.id} className={itemIndex <= index ? "active" : ""} />)}</span></div>
        <span className="tutorial-pointer-label"><MousePointer2 size={15} />Interaktivní průvodce</span>
        <h2 id="guided-tour-title">{step.title}</h2>
        <p id="guided-tour-description">{description}</p>
        <div className="tutorial-actions">
          <button type="button" className="button button-ghost" onClick={() => skip(step)}>Přeskočit</button>
          <span className="tutorial-nav-actions">
            <button type="button" className="button button-secondary" onClick={back} disabled={index === 0 || transitioning} aria-label="Předchozí krok"><ArrowLeft size={17} />Zpět</button>
            <button type="button" className="button button-primary" data-autofocus onClick={next} disabled={transitioning}>{index === (steps?.length || 0) - 1 ? <><Check size={17} />Dokončit</> : <>Další<ArrowRight size={17} /></>}</button>
          </span>
        </div>
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
