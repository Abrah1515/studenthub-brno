import { expect, test } from "@playwright/test";

test.describe("výběr města", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("studenthub-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false }));
      localStorage.setItem("studenthub-theme", "system");
      sessionStorage.setItem("studenthub-e2e-overlays", "manual");
    });
  });

  test("zobrazí čtyři ostrá loga, jediný aktivní odkaz a žádný overflow", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "StudentHub", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("StudentHub | Studentský život ve tvém městě");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://studenthubapp.cz");
    await expect(page.getByText("Vyber si město", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Otevřít StudentHub Brno" })).toHaveAttribute("href", "/brno");
    await expect(page.getByText("Připravujeme", { exact: true })).toHaveCount(3);
    await expect(page.locator(".city-selection-card-inactive a, .city-selection-card-inactive button")).toHaveCount(0);
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await expect(page.locator(".app-shell")).toHaveCount(0);
    await expect(page.locator(".city-selection-logo img:visible")).toHaveCount(4);
    await expect.poll(() => page.locator(".city-selection-logo img:visible").evaluateAll((images) => images.every((image) => {
      const element = image as HTMLImageElement;
      return element.complete && element.naturalWidth > 0 && element.clientWidth > 0 && /\/_next\/image\?.*w=\d+/.test(element.currentSrc);
    }))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    const columns = await page.locator(".city-selection-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(testInfo.project.name === "desktop-1440" ? 4 : testInfo.project.name === "tablet-768" ? 2 : 1);
    await page.screenshot({ path: `artifacts/city-selector-${testInfo.project.name}.png`, fullPage: true });
  });

  test("Brno lze otevřít klávesnicí a ostatní města zůstávají neaktivní", async ({ page }) => {
    await page.goto("/");
    const brno = page.getByRole("link", { name: "Otevřít StudentHub Brno" });
    await brno.focus();
    await expect(brno).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/brno$/);
  });

  test("tmavý režim používá pouze světlý text variant městských log", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("studenthub-theme", "dark"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".city-selection-logo-dark:visible")).toHaveCount(4);
    await expect(page.locator(".city-selection-logo-light:visible")).toHaveCount(0);
  });
});
