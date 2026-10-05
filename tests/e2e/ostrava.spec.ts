import { expect, test } from "@playwright/test";

test.describe("produkční připravenost Ostravy", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("studenthub-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false }));
      localStorage.setItem("studenthub-theme", "system");
      localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
      localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "ostrava", universityId: "vsbtuo", facultyId: "vsbtuo-fei", studyYear: 1, studyYearCycleStart: 2026, completed: true }));
      sessionStorage.setItem("studenthub-e2e-overlays", "manual");
    });
  });

  test("dashboard, školy a mapa používají ostravský kontext bez přetékání", async ({ page }, testInfo) => {
    await page.goto("/ostrava", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "StudentHub Ostrava – přehled" }).first()).toBeVisible();
    await expect(page.locator("footer.footer")).toContainText("StudentHub Ostrava");

    await page.goto("/ostrava/kalendar", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Kalendář", exact: true })).toBeVisible();
    const university = page.locator('select[aria-label="Univerzita"]').first();
    await expect(university.locator("option", { hasText: "Vysoká škola báňská" })).toHaveCount(1);
    await expect(university.locator("option", { hasText: "Ostravská univerzita" })).toHaveCount(1);
    await expect(university.locator("option", { hasText: "Masarykova univerzita" })).toHaveCount(0);

    await page.goto("/ostrava/mista", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Užitečná místa", exact: true })).toBeVisible();
    await expect(page.getByLabel("Interaktivní mapa míst ve městě Ostrava")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `artifacts/ostrava-${testInfo.project.name}.png`, fullPage: true });
  });

  test("hluboké odkazy a aktivní moduly Ostravy odpovídají společné architektuře", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440");
    for (const path of [
      "/ostrava", "/ostrava/kalendar", "/ostrava/mista", "/ostrava/brigady", "/ostrava/komunita",
      "/ostrava/partak", "/ostrava/burza", "/ostrava/bydleni", "/ostrava/chat",
    ]) {
      const response = await request.get(path);
      expect(response.status(), path).toBeLessThan(400);
    }
    expect((await request.get("/ostrava/nabidky")).status()).toBe(404);
  });

  test("Ostrava, Brno a Olomouc zůstávají dostupné a městsky oddělené", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet-768");
    for (const city of [
      { slug: "ostrava", name: "Ostrava" },
      { slug: "brno", name: "Brno" },
      { slug: "olomouc", name: "Olomouc" },
    ]) {
      await page.goto(`/${city.slug}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("link", { name: `StudentHub ${city.name} – přehled` }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  });
});
