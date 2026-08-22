import { expect, test } from "@playwright/test";

const productionSmokeEnabled = process.env.PRODUCTION_SMOKE === "true";

test.describe("produkční StudentHub", () => {
  test.skip(!productionSmokeEnabled, "Spouští se pouze explicitně proti produkční adrese.");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
      localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
      localStorage.setItem("studenthub-tutorial-version", "studenthub-focus-v3");
    });
  });

  test("veřejná část používá nový obsah, bezpečné přesměrování a nepřetéká", async ({ page, request }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("favicon")) consoleErrors.push(message.text());
    });
    page.on("requestfailed", (requestItem) => {
      const url = requestItem.url();
      const errorText = requestItem.failure()?.errorText || "neznámá chyba";
      if (errorText === "net::ERR_ABORTED" && (url.includes("_rsc=") || url.includes("/admin/prihlaseni?from=%2Fadmin"))) return;
      if (!url.includes("tile.openstreetmap.org")) failedRequests.push(`${requestItem.failure()?.errorText}: ${url}`);
    });

    await page.goto(`/brno?production-audit=${Date.now()}`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "StudentHub Brno" })).toBeVisible();
    await expect(page.getByTestId("dashboard-offers")).toHaveCount(0);
    await expect(page.locator('a[href*="/nabidky"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `artifacts/production-focus-${testInfo.project.name}.png`, fullPage: true });

    await page.goto("/brno/nabidky?production-audit=1", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/brno$/);

    await page.goto("/brno/kalendar?view=community", { waitUntil: "networkidle" });
    await expect(page.getByRole("tab", { name: "Co se děje" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: "Festival vědy 2026", exact: true })).toBeVisible();
    await expect(page.getByText("Veřejný zdroj", { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await page.goto("/brno/mista?university=muni&campus=Bohunice", { waitUntil: "networkidle" });
    await expect(page.getByText("Knihovna univerzitního kampusu MUNI", { exact: true })).toHaveCount(1);
    await expect(page.locator(".leaflet-host")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    const adminApi = await request.get("/api/admin/data");
    expect([401, 403]).toContain(adminApi.status());
    const sitemap = await request.get("/sitemap.xml");
    expect(await sitemap.text()).not.toContain("/nabidky");
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
