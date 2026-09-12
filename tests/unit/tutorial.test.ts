import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  desktopTourSteps,
  emptyTutorialState,
  legacyTutorialStorageKey,
  matchingStepAfterLayoutChange,
  mobileTourSteps,
  normalizeTutorialState,
  readTutorialState,
  resumeTutorialIndex,
  tabletTourSteps,
  tutorialLayoutForWidth,
  tutorialMotion,
  tutorialStorageKey,
  tutorialVersion,
} from "@/lib/tutorial";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    value: (key: string) => values.get(key) ?? null,
  };
}

const mobileOrder = ["welcome", "overview", "calendar", "places", "community", "jobs", "buddy", "chat", "marketplace", "menu", "housing", "watcher", "school-profile", "change-city", "install", "appearance", "about", "contact", "admin", "complete"];
const tabletOrder = ["welcome", "overview", "calendar", "places", "community", "jobs", "chat", "appearance", "menu", "watcher", "buddy", "marketplace", "housing", "school-profile", "change-city", "about", "install", "contact", "admin", "complete"];
const desktopOrder = ["welcome", "overview", "calendar", "watcher", "chat", "places", "community", "buddy", "jobs", "marketplace", "housing", "school-profile", "change-city", "about", "install", "contact", "admin", "appearance", "complete"];

describe("pevně uspořádaný interaktivní návod", () => {
  it("má samostatné deterministické pořadí pro telefon, tablet a desktop", () => {
    expect(mobileTourSteps.map((item) => item.id)).toEqual(mobileOrder);
    expect(tabletTourSteps.map((item) => item.id)).toEqual(tabletOrder);
    expect(desktopTourSteps.map((item) => item.id)).toEqual(desktopOrder);
    for (const steps of [mobileTourSteps, tabletTourSteps, desktopTourSteps]) {
      expect(steps.map((item) => item.order)).toEqual(steps.map((_, index) => index + 1));
      expect(new Set(steps.map((item) => item.id)).size).toBe(steps.length);
      for (const item of steps) {
        expect(item.targetId).toMatch(/^[a-z-]+$/);
        expect(item.availability).toBe("target-present");
        expect(["top", "bottom", "left", "right", "auto"]).toContain(item.preferredPlacement);
        expect(["closed", "open"]).toContain(item.menuState);
        expect(["none", "sidebar", "menu", "viewport"]).toContain(item.scrollArea);
        expect(item.description.split(/[.!?](?:\s|$)/).filter(Boolean).length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("dodržuje skutečné breakpointy a nekombinuje tablet se sidebarem", () => {
    expect(tutorialLayoutForWidth(360)).toBe("mobile");
    expect(tutorialLayoutForWidth(767)).toBe("mobile");
    expect(tutorialLayoutForWidth(768)).toBe("tablet");
    expect(tutorialLayoutForWidth(860)).toBe("tablet");
    expect(tutorialLayoutForWidth(861)).toBe("desktop");
    expect(tutorialLayoutForWidth(1440)).toBe("desktop");
    expect(tabletTourSteps.some((item) => item.targetId.endsWith("-desktop"))).toBe(false);
    expect(tabletTourSteps.slice(1, 6).every((item) => item.targetId.endsWith("-bottom"))).toBe(true);
  });

  it("řadí spodní navigaci zleva doprava, menu shora dolů a sidebar shora dolů", () => {
    expect(mobileTourSteps.slice(1, 6).map((item) => item.targetId)).toEqual([
      "overview-navigation-bottom", "calendar-navigation-bottom", "places-navigation-bottom", "community-navigation-bottom", "jobs-navigation-bottom",
    ]);
    expect(mobileTourSteps.findIndex((item) => item.id === "menu")).toBeLessThan(mobileTourSteps.findIndex((item) => item.id === "housing"));
    expect(mobileTourSteps.slice(10, 19).every((item) => item.menuState === "open" && item.scrollArea === "menu")).toBe(true);
    expect(desktopTourSteps.slice(1, 12).every((item) => item.targetId.endsWith("-desktop") && item.scrollArea === "sidebar")).toBe(true);
  });

  it("neobsahuje skryté Nabídky a umí vyřadit neaktivní Bydlení bez změny pořadí", () => {
    expect(JSON.stringify([mobileTourSteps, tabletTourSteps, desktopTourSteps])).not.toContain("offers-navigation");
    const withoutHousing = desktopTourSteps.filter((item) => item.id !== "housing");
    expect(withoutHousing.map((item) => item.id)).toEqual(desktopOrder.filter((item) => item !== "housing"));
  });

  it("obnovuje průběh a při změně breakpointu zachová stejnou funkci", () => {
    const state = { tutorialVersion, introConfirmed: true, status: "in_progress" as const, lastCompletedStep: "calendar" };
    expect(resumeTutorialIndex(desktopTourSteps, state)).toBe(3);
    expect(resumeTutorialIndex(mobileTourSteps, emptyTutorialState)).toBe(0);
    expect(matchingStepAfterLayoutChange(mobileTourSteps, desktopTourSteps, "marketplace")).toBe(desktopOrder.indexOf("marketplace"));
    expect(matchingStepAfterLayoutChange(mobileTourSteps, desktopTourSteps, "menu")).toBe(desktopOrder.indexOf("housing"));
  });

  it("odděluje potvrzení, přeskočení, dokončení a novou verzi", () => {
    expect(normalizeTutorialState({ tutorialVersion, introConfirmed: true, status: "skipped", lastCompletedStep: "calendar" })).toEqual({ tutorialVersion, introConfirmed: true, status: "skipped", lastCompletedStep: "calendar" });
    expect(normalizeTutorialState({ tutorialVersion: 2, introConfirmed: true, status: "completed", lastCompletedStep: "complete" })).toEqual({ ...emptyTutorialState, introConfirmed: true });
  });

  it("převede původní potvrzení bez smazání ostatních nastavení", () => {
    const storage = memoryStorage({ [legacyTutorialStorageKey]: "studenthub-marketplace-v4", unrelated: "keep" });
    const state = readTutorialState(storage);
    expect(state).toEqual({ tutorialVersion, introConfirmed: true, status: "not_started", lastCompletedStep: null });
    expect(storage.value(legacyTutorialStorageKey)).toBeNull();
    expect(JSON.parse(storage.value(tutorialStorageKey)!)).toEqual(state);
    expect(storage.value("unrelated")).toBe("keep");
  });

  it("nepřechází routy a používá jen stabilní cíle", () => {
    const component = readFileSync("components/feature-tutorial.tsx", "utf8");
    const shell = readFileSync("components/site-shell.tsx", "utf8");
    expect(component).not.toContain("router.push");
    expect(component).not.toContain("activateTarget");
    expect(component).toContain("lockAvailableSteps");
    expect(component).toContain("matchingStepAfterLayoutChange");
    for (const target of ["overview-navigation", "calendar-navigation", "watcher-navigation", "chat-navigation", "places-navigation", "community-navigation", "buddy-navigation", "jobs-navigation", "marketplace-navigation", "housing-navigation", "settings-navigation"]) expect(shell).toContain(target);
    for (const target of ["menu-trigger", "brand-compact", "brand-desktop", "appearance-navigation-topbar", "install-navigation-tablet", "admin-navigation-menu"]) expect(shell).toContain(target);
  });

  it("používá jeden plynulý, přerušitelný přechod s doporučeným časováním", () => {
    expect(tutorialMotion.spotlightMs).toBeGreaterThanOrEqual(300);
    expect(tutorialMotion.spotlightMs).toBeLessThanOrEqual(400);
    expect(tutorialMotion.scrollMaxMs).toBeGreaterThanOrEqual(350);
    expect(tutorialMotion.scrollMaxMs).toBeLessThanOrEqual(500);
    expect(tutorialMotion.textMs).toBeGreaterThanOrEqual(150);
    expect(tutorialMotion.textMs).toBeLessThanOrEqual(250);
    expect(tutorialMotion.easing).toBe("cubic-bezier(0.22, 1, 0.36, 1)");

    const component = readFileSync("components/feature-tutorial.tsx", "utf8");
    const styles = readFileSync("app/globals.css", "utf8");
    expect(component).toContain("new AbortController()");
    expect(component).toContain("waitForScrollSettle");
    expect(component).toContain("transitioningRef.current");
    expect(component).toContain('behavior: "auto"');
    expect(component).not.toContain("setTargetRect(null)");
    expect(styles).toContain("transform 360ms var(--tutorial-motion-easing)");
    expect(styles).toContain("tutorial-menu-panel-in 300ms");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
