import { expect, test } from "@playwright/test";

test.describe("aktivní městské edice", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("studenthub-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false }));
      localStorage.setItem("studenthub-theme", "system");
      localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
      localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "praha", universityId: "cuni", facultyId: "cuni-mff", studyYear: 1, studyYearCycleStart: 2026, completed: true }));
      sessionStorage.setItem("studenthub-e2e-overlays", "manual");
    });
  });

  test("dashboard, školy a mapa používají pražskou edici bez přetékání", async ({ page }, testInfo) => {
    await page.goto("/praha", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "StudentHub Praha – přehled" }).first()).toBeVisible();
    await expect(page.locator("footer.footer")).toContainText("StudentHub Praha");

    await page.goto("/praha/kalendar", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Kalendář", exact: true })).toBeVisible();
    const university = page.locator('select[aria-label="Univerzita"]').first();
    for (const name of ["Univerzita Karlova", "České vysoké učení technické v Praze", "Vysoká škola ekonomická v Praze", "Česká zemědělská univerzita v Praze", "Vysoká škola chemicko-technologická v Praze"]) {
      await expect(university.locator("option", { hasText: name })).toHaveCount(1);
    }
    await expect(university.locator("option", { hasText: "Masarykova univerzita" })).toHaveCount(0);

    await page.goto("/praha/mista", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Užitečná místa", exact: true })).toBeVisible();
    await expect(page.getByLabel("Interaktivní mapa míst ve městě Praha")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    if (testInfo.project.name === "mobile-390") {
      await page.screenshot({ path: "artifacts/praha-mobile-390.png", fullPage: true });
    }
  });

  test("Praha a Olomouc zůstávají oddělené od Brna a aktivní Brigády jsou dostupné", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440");
    expect((await request.get("/praha")).status()).toBe(200);
    expect((await request.get("/olomouc")).status()).toBe(200);
    expect((await request.get("/brno")).status()).toBe(200);
    expect((await request.get("/praha/brigady")).status()).toBe(200);
    expect((await request.get("/olomouc/brigady")).status()).toBe(200);
    expect((await request.get("/praha/nabidky")).status()).toBe(404);
  });

  test("přehled a brigády aktivních měst fungují na telefonu i desktopu", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "tablet-768");

    for (const city of [
      { slug: "brno", name: "Brno" },
      { slug: "praha", name: "Praha" },
      { slug: "ostrava", name: "Ostrava" },
      { slug: "olomouc", name: "Olomouc" },
    ]) {
      await page.goto(`/${city.slug}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("link", { name: `StudentHub ${city.name} – přehled` }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      await page.goto(`/${city.slug}/brigady`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: new RegExp(`Brigády.*${city.name}`, "i") })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  });
});
