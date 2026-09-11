import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyTutorialState, legacyTutorialStorageKey, normalizeTutorialState, readTutorialState, resumeTutorialIndex, tutorialSteps, tutorialStorageKey, tutorialVersion } from "@/lib/tutorial";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    value: (key: string) => values.get(key) ?? null,
  };
}

describe("interaktivní úvodní návod", () => {
  it("má jeden centrální seznam deseti skutečných a stabilních cílů", () => {
    expect(tutorialSteps).toHaveLength(10);
    expect(new Set(tutorialSteps.map((step) => step.id)).size).toBe(tutorialSteps.length);
    for (const [index, step] of tutorialSteps.entries()) {
      expect(step.order).toBe(index + 1);
      expect(step.availability).toBe("target-present");
      expect(step.desktopTarget).toMatch(/^[a-z-]+$/);
      expect(step.compactTarget).toMatch(/^[a-z-]+$/);
      expect(step.description.split(/[.!?](?:\s|$)/).filter(Boolean).length).toBeLessThanOrEqual(2);
    }
    expect(tutorialSteps.map((step) => step.title)).toEqual([
      "Vítej ve StudentHub Brno", "Moje škola a profil", "Kalendář a Co se děje", "Hlídač", "Místa v Brně",
      "Komunita a Hledám parťáka", "Soukromý chat", "Brigády, Burza a Bydlení", "Nainstaluj si aplikaci", "Máš hotovo",
    ]);
    expect(JSON.stringify(tutorialSteps)).not.toContain("Nabídky a slevy");
  });

  it("odděluje potvrzení, přeskočení, dokončení, poslední krok a verzi", () => {
    expect(normalizeTutorialState({ tutorialVersion, introConfirmed: true, status: "skipped", lastCompletedStep: "calendar" })).toEqual({ tutorialVersion, introConfirmed: true, status: "skipped", lastCompletedStep: "calendar" });
    expect(normalizeTutorialState({ tutorialVersion, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }).status).toBe("completed");
    expect(normalizeTutorialState({ tutorialVersion: 1, introConfirmed: true, status: "completed", lastCompletedStep: "complete" })).toEqual({ ...emptyTutorialState, introConfirmed: true });
  });

  it("obnoví prohlídku za posledním dokončeným krokem", () => {
    expect(resumeTutorialIndex({ tutorialVersion, introConfirmed: true, status: "in_progress", lastCompletedStep: "calendar" })).toBe(3);
    expect(resumeTutorialIndex(emptyTutorialState)).toBe(0);
    expect(resumeTutorialIndex({ ...emptyTutorialState, lastCompletedStep: "neexistuje" })).toBe(0);
  });

  it("převede původní potvrzení a nabídne novou verzi bez resetu ostatních nastavení", () => {
    const storage = memoryStorage({ [legacyTutorialStorageKey]: "studenthub-marketplace-v4", unrelated: "keep" });
    const state = readTutorialState(storage);
    expect(state).toEqual({ tutorialVersion, introConfirmed: true, status: "not_started", lastCompletedStep: null });
    expect(storage.value(legacyTutorialStorageKey)).toBeNull();
    expect(JSON.parse(storage.value(tutorialStorageKey)!)).toEqual(state);
    expect(storage.value("unrelated")).toBe("keep");
  });

  it("neobsahuje původní statickou tabulku a shell označuje reálné cíle", () => {
    const component = readFileSync("components/feature-tutorial.tsx", "utf8");
    const shell = readFileSync("components/site-shell.tsx", "utf8");
    expect(component).not.toContain("tutorial-steps");
    expect(component).toContain("tutorial-spotlight");
    expect(component).toContain("tutorial_target_missing");
    for (const target of ["calendar-navigation", "watcher-navigation", "places-navigation", "community-navigation", "chat-navigation", "housing-navigation", "settings-navigation"]) expect(shell).toContain(target);
  });
});
