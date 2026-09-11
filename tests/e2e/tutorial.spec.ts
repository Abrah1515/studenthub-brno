import { expect, test, type Page } from "@playwright/test";

const titles = [
  "Vítej ve StudentHub Brno",
  "Moje škola a profil",
  "Kalendář a Co se děje",
  "Hlídač",
  "Místa v Brně",
  "Komunita a Hledám parťáka",
  "Soukromý chat",
  "Brigády, Burza a Bydlení",
  "Nainstaluj si aplikaci",
  "Máš hotovo",
] as const;

async function prepareTour(page: Page, options: { state?: Record<string, unknown>; theme?: "light" | "dark" } = {}) {
  await page.addInitScript(({ state, theme }) => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "muni", facultyId: "muni-fi", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-theme", theme || "light");
    localStorage.removeItem("studenthub-tutorial-version");
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify(state || { tutorialVersion: 2, introConfirmed: true, status: "not_started", lastCompletedStep: null }));
  }, { state: options.state, theme: options.theme });
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test("prohlídka projde všemi skutečnými kroky, umí Zpět a uloží dokončení", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  for (let index = 0; index < titles.length; index += 1) {
    await expect(tour.getByRole("heading", { name: titles[index] })).toBeVisible();
    await expect(tour.getByText(`${index + 1} z ${titles.length}`)).toBeVisible();
    await expect(page.getByTestId("tour-spotlight")).toBeVisible();
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
    await assertNoOverflow(page);
    if (index === 1) {
      await tour.getByRole("button", { name: "Předchozí krok" }).click();
      await expect(tour.getByRole("heading", { name: titles[0] })).toBeVisible();
      await tour.getByRole("button", { name: "Další" }).click();
      await expect(tour.getByRole("heading", { name: titles[1] })).toBeVisible();
    }
    await tour.getByRole("button", { name: index === titles.length - 1 ? "Dokončit" : "Další" }).click();
  }
  await expect(tour).toHaveCount(0);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("studenthub-tutorial-state") || "null"));
  expect(state).toMatchObject({ tutorialVersion: 2, introConfirmed: true, status: "completed", lastCompletedStep: "complete" });
});

test("kliknutí na zvýrazněný cíl změní routu a prohlídka pokračuje", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  await tour.getByRole("button", { name: "Další" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "school-profile");
  await page.getByTestId("tour-spotlight").click();
  await expect(page).toHaveURL(/\/brno\/nastaveni$/);
  await expect(tour).toHaveAttribute("data-tour-step", "calendar");
  await expect(tour.getByRole("heading", { name: "Kalendář a Co se děje" })).toBeVisible();
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("chybějící cíl se bezpečně přeskočí bez prázdného popoveru", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page);
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  await page.locator('[data-tour-id="settings-navigation-desktop"]').evaluate((element) => element.remove());
  await tour.getByRole("button", { name: "Další" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "calendar");
  await expect(tour.getByRole("heading", { name: "Kalendář a Co se děje" })).toBeVisible();
  await expect(page.getByTestId("tour-spotlight")).toBeVisible();
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("telefon a tablet otevřou skutečné menu a zvýrazní spodní navigaci", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-1440");
  await prepareTour(page, { state: { tutorialVersion: 2, introConfirmed: true, status: "in_progress", lastCompletedStep: "welcome" }, theme: testInfo.project.name === "tablet-768" ? "dark" : "light" });
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  await expect(tour).toHaveAttribute("data-tour-step", "school-profile");
  await expect(page.locator(".mobile-menu-panel")).toBeVisible();
  await expect(page.locator('[data-tour-id="settings-navigation-menu"]:visible')).toHaveCount(1);
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
  await tour.getByRole("button", { name: "Další" }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "calendar");
  await expect(page.locator(".mobile-menu-panel")).toHaveCount(0);
  await expect(page.locator('[data-tour-id="calendar-navigation-bottom"]')).toBeVisible();
  await assertNoOverflow(page);
  await tour.getByRole("button", { name: "Přeskočit" }).click();
});

test("Návod spustí hotovou prohlídku znovu a Escape vrátí focus", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await prepareTour(page, { state: { tutorialVersion: 2, introConfirmed: true, status: "completed", lastCompletedStep: "complete" } });
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("navigation", { name: "Doplňkové odkazy" }).getByRole("button", { name: "Návod" });
  await expect(page.getByTestId("guided-tutorial")).toHaveCount(0);
  await trigger.click();
  const tour = page.getByTestId("guided-tutorial");
  await expect(tour).toHaveAttribute("data-tour-step", "welcome");
  await expect(tour.getByRole("button", { name: "Další" })).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("tour-spotlight")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(tour.getByRole("button", { name: "Další" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
});

test("aktivní profil používá stejný verzovaný lokální průběh bez citlivého sledování", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "11111111-1111-4111-8111-111111111111", verified: true }, profile: { complete: true } }) }));
  await page.route("**/api/profile", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profile: { email: "student@example.cz", username: "student", displayName: "Student", accountStatus: "active", cityId: "brno", universityId: "muni", facultyId: "muni-fi", studyProgram: "Informatika", studyYear: 2, bio: "", interests: [], avatarUrl: null, profileVisibility: "public", showFaculty: true, showStudyProgram: true, showStudyYear: true, communityRulesAccepted: true, complete: true } }) }));
  await prepareTour(page, { state: { tutorialVersion: 2, introConfirmed: true, status: "in_progress", lastCompletedStep: "calendar" } });
  await page.goto("/brno/nastaveni", { waitUntil: "domcontentloaded" });
  const tour = page.getByTestId("guided-tutorial");
  await expect(tour).toHaveAttribute("data-tour-step", "watcher");
  await tour.getByRole("button", { name: "Přeskočit" }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("studenthub-tutorial-state") || "null"));
  expect(state).toMatchObject({ tutorialVersion: 2, introConfirmed: true, status: "skipped", lastCompletedStep: "calendar" });
  expect(await page.evaluate(() => localStorage.getItem("studenthub-preference-v4"))).toContain('"universityId":"muni"');
});

test("prohlídka funguje nad mapou, komunitou a chatem bez druhého modálu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  for (const path of ["/brno/mista", "/brno/komunita", "/brno/chat"]) {
    await prepareTour(page);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const tour = page.getByTestId("guided-tutorial");
    await expect(tour).toBeVisible();
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
    await expect(page.getByTestId("tour-spotlight")).toBeVisible();
    await assertNoOverflow(page);
    await tour.getByRole("button", { name: "Přeskočit" }).click();
  }
});
