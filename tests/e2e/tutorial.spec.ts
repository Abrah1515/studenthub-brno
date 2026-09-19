import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { desktopTourSteps, mobileTourSteps, openTutorialEvent, tabletTourSteps, type TutorialStep } from "../../lib/tutorial";

function configFor(testInfo: TestInfo): readonly TutorialStep[] {
  if (testInfo.project.name === "mobile-390") return mobileTourSteps;
  if (testInfo.project.name === "tablet-768") return tabletTourSteps;
  return desktopTourSteps;
}

async function prepareTour(page: Page, state: Record<string, unknown> = { tutorialVersion: 3, introConfirmed: true, status: "not_started", lastCompletedStep: null }) {
  await page.addInitScript((tutorialState) => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "muni", facultyId: "muni-fi", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-theme", "light");
    if (!sessionStorage.getItem("studenthub-tutorial-test-initialized")) {
      localStorage.removeItem("studenthub-tutorial-version");
      localStorage.setItem("studenthub-tutorial-state", JSON.stringify(tutorialState));
      sessionStorage.setItem("studenthub-tutorial-test-initialized", "true");
    }
  }, state);
}

async function waitForStep(page: Page, id: string) {
  const tour = page.getByTestId("guided-tutorial");
  await expect(tour).toHaveAttribute("data-tour-step", id);
  await expect(tour).toHaveAttribute("data-tour-transitioning", "false");
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();
  return tour;
}

async function advanceTo(page: Page, id: string) {
  const tour = page.getByTestId("guided-tutorial");
  for (let guard = 0; guard < 30; guard += 1) {
    await expect(tour).toHaveAttribute("data-tour-transitioning", "false");
    if (await tour.getAttribute("data-tour-step") === id) return;
    await tour.getByRole("button", { name: "Další" }).click();
  }
  throw new Error("Krok " + id + " nebyl nalezen.");
}

async function assertGeometry(page: Page) {
  const result = await page.evaluate(() => {
    const spotlight = document.querySelector(".tutorial-spotlight")?.getBoundingClientRect();
    const popover = document.querySelector(".tutorial-popover")?.getBoundingClientRect();
    if (!spotlight || !popover) return null;
    const overlapWidth = Math.max(0, Math.min(spotlight.right, popover.right) - Math.max(spotlight.left, popover.left));
    const overlapHeight = Math.max(0, Math.min(spotlight.bottom, popover.bottom) - Math.max(spotlight.top, popover.top));
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      popoverInside: popover.left >= 0 && popover.top >= 0 && popover.right <= innerWidth && popover.bottom <= innerHeight,
      spotlightInside: spotlight.left >= 0 && spotlight.top >= 0 && spotlight.right <= innerWidth && spotlight.bottom <= innerHeight,
      overlapArea: overlapWidth * overlapHeight,
    };
  });
  expect(result).not.toBeNull();
  expect(result?.overflow).toBeLessThanOrEqual(1);
  expect(result?.popoverInside).toBe(true);
  expect(result?.spotlightInside).toBe(true);
  expect(result?.overlapArea).toBeLessThanOrEqual(1);
}

test("pevné pořadí všech kroků se třikrát zopakuje na telefonu, tabletu i desktopu", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const configured = configFor(testInfo);
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  for (let run = 0; run < 3; run += 1) {
    if (run > 0) await page.evaluate((eventName) => window.dispatchEvent(new Event(eventName)), openTutorialEvent);
    for (let index = 0; index < configured.length; index += 1) {
      const expected = configured[index];
      const tour = await waitForStep(page, expected.id);
      await expect(tour).toHaveAttribute("data-tour-target", expected.targetId);
      await expect(tour.getByText((index + 1) + " z " + configured.length)).toBeVisible();
      await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
      expect(new URL(page.url()).pathname).toBe("/brno");
      if (expected.menuState === "open") await expect(page.locator(".mobile-menu-panel")).toBeVisible();
      else await expect(page.locator(".mobile-menu-panel")).toHaveCount(0);
      await assertGeometry(page);
      await tour.getByRole("button", { name: index === configured.length - 1 ? "Dokončit" : "Další" }).click();
    }
    await expect(page.getByTestId("guided-tutorial")).toHaveCount(0);
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("studenthub-tutorial-state") || "null"));
  expect(stored).toMatchObject({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" });
});

test("Zpět zachová přesné opačné pořadí přes hranice navigačních oblastí", async ({ page }, testInfo) => {
  const configured = configFor(testInfo);
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  if (testInfo.project.name === "mobile-390") {
    await advanceTo(page, "chat");
    await tour.getByRole("button", { name: "Předchozí krok" }).click();
    await waitForStep(page, "buddy");
    await tour.getByRole("button", { name: "Předchozí krok" }).click();
    await waitForStep(page, "jobs");
    await advanceTo(page, "housing");
    await tour.getByRole("button", { name: "Předchozí krok" }).click();
    await waitForStep(page, "menu");
    await expect(page.locator(".mobile-menu-panel")).toHaveCount(0);
    await tour.getByRole("button", { name: "Další" }).click();
    await waitForStep(page, "housing");
    await expect(page.locator(".mobile-menu-panel")).toBeVisible();
  } else if (testInfo.project.name === "tablet-768") {
    await advanceTo(page, "chat");
    await tour.getByRole("button", { name: "Předchozí krok" }).click();
    await waitForStep(page, "jobs");
    await advanceTo(page, "watcher");
    await tour.getByRole("button", { name: "Předchozí krok" }).click();
    await waitForStep(page, "menu");
    await expect(page.locator(".mobile-menu-panel")).toHaveCount(0);
  } else {
    await advanceTo(page, "appearance");
    await tour.getByRole("button", { name: "Předchozí krok" }).click();
    await waitForStep(page, "admin");
    await tour.getByRole("button", { name: "Předchozí krok" }).click();
    await waitForStep(page, "contact");
  }
  await expect(tour.getByText(/ z /)).toBeVisible();
  const currentId = await tour.getAttribute("data-tour-step");
  expect(configured.some((item) => item.id === currentId)).toBe(true);
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("chybějící nebo neaktivní Bydlení se před startem odfiltruje a přepočítá počet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page, { tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" });
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  await page.locator('[data-tour-id="housing-navigation-desktop"]').evaluate((element) => element.remove());
  await page.evaluate((eventName) => window.dispatchEvent(new Event(eventName)), openTutorialEvent);
  const tour = await waitForStep(page, "welcome");
  await expect(tour.getByText("1 z 18")).toBeVisible();
  await advanceTo(page, "marketplace");
  await tour.getByRole("button", { name: "Další" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "school-profile");
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("změna breakpointu zachová funkci nebo zvolí nejbližší následující krok", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  await advanceTo(page, "marketplace");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(tour).toHaveAttribute("data-tour-layout", "desktop");
  await expect(tour).toHaveAttribute("data-tour-step", "marketplace");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tour).toHaveAttribute("data-tour-layout", "mobile");
  await advanceTo(page, "menu");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(tour).toHaveAttribute("data-tour-layout", "desktop");
  await expect(tour).toHaveAttribute("data-tour-step", "housing");
  await expect(page.locator(".tutorial-popover")).toHaveCount(1);
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("obnovení stránky pokračuje za posledním dokončeným krokem", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  await advanceTo(page, "calendar");
  await tour.getByRole("button", { name: "Další" }).click();
  await waitForStep(page, "watcher");
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForStep(page, "watcher");
  await page.getByTestId("guided-tutorial").getByRole("button", { name: "Přeskočit" }).click();
});

test("ruční spuštění zavře chat a instalační dialog, vrátí Přehled nahoru a zachová nastavení", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page, { tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" });
  await page.goto("/brno/mista", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-chat-dock-ready", "true");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("studenthub-open-chat", { detail: { id: "00000000-0000-4000-8000-000000000001" } })));
  await expect(page.locator(".chat-dock")).toBeVisible();
  await page.getByRole("navigation", { name: "Doplňkové odkazy" }).getByRole("button", { name: "Nainstalovat aplikaci" }).click();
  await expect(page.getByTestId("pwa-install-dialog")).toBeVisible();
  await page.evaluate((eventName) => window.dispatchEvent(new Event(eventName)), openTutorialEvent);
  const tour = await waitForStep(page, "welcome");
  await expect(page).toHaveURL(/\/brno$/);
  await expect(page.locator(".chat-dock,.chat-dock-minimized")).toHaveCount(0);
  await expect(page.getByTestId("pwa-install-dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("studenthub-preference-v4"))).toContain('"facultyId":"muni-fi"');
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("úvodní potvrzení je povinné, desktopové šipky fungují a psaní je neaktivuje", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page, { tutorialVersion: 3, introConfirmed: false, status: "not_started", lastCompletedStep: null });
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const intro = page.getByTestId("tutorial-intro");
  await expect(intro).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(intro).toBeVisible();
  await intro.getByRole("button", { name: "Rozumím" }).click();
  const tour = await waitForStep(page, "welcome");
  await tour.locator(".tutorial-popover").evaluate((element) => {
    const input = document.createElement("input"); input.setAttribute("aria-label", "Test psaní"); element.append(input); input.focus();
  });
  await page.keyboard.press("ArrowRight");
  await expect(tour).toHaveAttribute("data-tour-step", "welcome");
  await tour.getByLabel("Test psaní").evaluate((element) => element.remove());
  await tour.getByRole("button", { name: "Další" }).focus();
  await page.keyboard.press("ArrowRight");
  await waitForStep(page, "overview");
  await page.keyboard.press("ArrowLeft");
  await waitForStep(page, "welcome");
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
});

test("spotlight se plynule přesune, nebliká a rychlé kliknutí nespustí další krok", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = await waitForStep(page, "welcome");
  const rect = () => page.getByTestId("tour-spotlight").evaluate((element) => {
    const value = element.getBoundingClientRect();
    return { top: value.top, left: value.left, width: value.width, height: value.height };
  });
  const frames = await tour.getByRole("button", { name: "Další" }).evaluate(async (button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("Další není tlačítko.");
    const dialog = document.querySelector<HTMLElement>("[data-testid='guided-tutorial']");
    const spotlight = document.querySelector<HTMLElement>("[data-testid='tour-spotlight']");
    if (!dialog || !spotlight) throw new Error("Spotlight není dostupný.");
    const samples: Array<{ top: number; left: number; width: number; height: number; spotlights: number; popovers: number }> = [];
    const started = performance.now();
    const completed = new Promise<typeof samples>((resolve) => {
      const sample = () => {
        const value = spotlight.getBoundingClientRect();
        samples.push({ top: value.top, left: value.left, width: value.width, height: value.height, spotlights: document.querySelectorAll(".tutorial-spotlight").length, popovers: document.querySelectorAll(".tutorial-popover").length });
        if ((dialog.dataset.tourStep === "overview" && dialog.dataset.tourTransitioning === "false") || performance.now() - started > 8_000) resolve(samples);
        else requestAnimationFrame(sample);
      };
      sample();
    });
    button.click();
    button.click();
    button.click();
    return completed;
  });
  await waitForStep(page, "overview");
  const end = await rect();
  const start = frames[0];
  expect(frames.some((frame) => Math.abs(frame.top - start.top) + Math.abs(frame.left - start.left) > 2 && Math.abs(frame.top - end.top) + Math.abs(frame.left - end.left) > 2)).toBe(true);
  expect(frames.every((frame) => frame.spotlights === 1 && frame.popovers === 1)).toBe(true);
  await expect(tour).toHaveAttribute("data-tour-step", "overview");
  await expect(page.locator(".tutorial-spotlight")).toHaveCount(1);
  await expect(page.locator(".tutorial-popover")).toHaveCount(1);
  await expect(tour.getByRole("button", { name: "Další" })).toBeFocused();

  await page.setViewportSize({ width: 740, height: 390 });
  await page.waitForTimeout(180);
  await expect(tour).toHaveAttribute("data-tour-transitioning", "true");
  await waitForStep(page, "overview");
  await assertGeometry(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  await expect(tour).toHaveAttribute("data-tour-transitioning", "true");
  await waitForStep(page, "overview");
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("mobilní menu se otevře před zvýrazněním a roluje nezávisle na stránce", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  test.setTimeout(60_000);
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = await waitForStep(page, "welcome");
  await advanceTo(page, "menu");
  await waitForStep(page, "menu");
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await tour.getByRole("button", { name: "Další" }).click();
  await expect(page.locator(".mobile-menu-panel")).toBeVisible();
  await expect(tour).toHaveAttribute("data-tour-transitioning", "true");
  await waitForStep(page, "housing");
  await advanceTo(page, "admin");
  await waitForStep(page, "admin");
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
  expect(await page.locator(".mobile-menu-panel").evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(0);
  await assertGeometry(page);
  await tour.getByRole("button", { name: "Předchozí krok" }).click();
  await waitForStep(page, "contact");
  await expect(page.locator(".tutorial-spotlight")).toHaveCount(1);
  await expect(page.locator(".tutorial-popover")).toHaveCount(1);
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("omezený pohyb vypne přesun a animovaný scroll, ale zachová krátké prolnutí", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = await waitForStep(page, "welcome");
  expect(await page.getByTestId("tour-spotlight").evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
  expect(await page.locator(".tutorial-popover-content").evaluate((element) => getComputedStyle(element).transitionDuration)).toContain("0.06s");
  await tour.evaluate((element) => new Promise<void>((resolve, reject) => {
    const button = [...element.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes("Další"));
    if (!button) return reject(new Error("Tlačítko Další nebylo nalezeno."));
    const observer = new MutationObserver(() => {
      if (element.dataset.tourStep === "overview" && element.dataset.tourTransitioning === "false") {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-tour-step", "data-tour-transitioning"] });
    button.click();
  }));
  await waitForStep(page, "overview");
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});
