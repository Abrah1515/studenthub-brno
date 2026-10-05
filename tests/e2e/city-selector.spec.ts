import { expect, test } from "@playwright/test";

test.describe("výběr města", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("studenthub-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false }));
      localStorage.setItem("studenthub-theme", "system");
      sessionStorage.setItem("studenthub-e2e-overlays", "manual");
    });
  });

  test("zobrazí čtyři ostrá loga, čtyři aktivní edice a žádný overflow", async ({ page }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "StudentHub", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("StudentHub | Studentský život ve tvém městě");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://studenthubapp.cz");
    await expect(page.getByText("Vyber si město", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Otevřít StudentHub Brno" })).toHaveAttribute("href", "/brno");
    await expect(page.getByRole("link", { name: "Otevřít StudentHub Praha" })).toHaveAttribute("href", "/praha");
    await expect(page.getByRole("link", { name: "Otevřít StudentHub Ostrava" })).toHaveAttribute("href", "/ostrava");
    await expect(page.getByText("Připravujeme", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Otevřít StudentHub Olomouc" })).toHaveAttribute("href", "/olomouc");
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

  test("aktivní město lze otevřít klávesnicí", async ({ page }) => {
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

  test("všechna publikovaná města a jejich aktivní Brigády jsou dostupné", async ({ request }) => {
    for (const path of ["/brno", "/brno/kalendar", "/brno/komunita", "/brno/mista"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }

    for (const path of ["/olomouc", "/olomouc/kalendar", "/olomouc/komunita", "/olomouc/mista"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }
    expect((await request.get("/olomouc/brigady")).status()).toBe(200);
    for (const path of ["/praha", "/praha/kalendar", "/praha/komunita", "/praha/mista"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }
    expect((await request.get("/praha/brigady")).status()).toBe(200);
    for (const path of ["/ostrava", "/ostrava/kalendar", "/ostrava/komunita", "/ostrava/mista", "/ostrava/brigady"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }
    expect((await request.get("/praha/nabidky")).status()).toBe(404);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const body = await sitemap.text();
    expect(body).toContain("https://studenthubapp.cz/brno");
    expect(body).toContain("https://studenthubapp.cz/olomouc");
    expect(body).toContain("https://studenthubapp.cz/praha");
    expect(body).toContain("https://studenthubapp.cz/ostrava");
    expect(body).toContain("https://studenthubapp.cz/ostrava/brigady");
    expect(body).toContain("/olomouc/brigady");
    expect(body).toContain("/praha/brigady");
  });

  test("aplikační shell používá logo a název právě otevřeného města", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
      localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "olomouc", universityId: "upol", facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    });
    await page.goto("/olomouc");
    const olomoucBrand = page.getByRole("link", { name: "StudentHub Olomouc – přehled" }).first();
    await expect(olomoucBrand).toBeVisible();
    await expect(olomoucBrand.locator('img[src*="studenthub-olomouc"]')).not.toHaveCount(0);
    await expect(page.locator("footer.footer")).toContainText("StudentHub Olomouc");

    await page.goto("/praha");
    const prahaBrand = page.getByRole("link", { name: "StudentHub Praha – přehled" }).first();
    await expect(prahaBrand).toBeVisible();
    await expect(prahaBrand.locator('img[src*="studenthub-praha"]')).not.toHaveCount(0);
    await expect(page.locator("footer.footer")).toContainText("StudentHub Praha");

    await page.goto("/ostrava");
    const ostravaBrand = page.getByRole("link", { name: "StudentHub Ostrava – přehled" }).first();
    await expect(ostravaBrand).toBeVisible();
    await expect(ostravaBrand.locator('img[src*="studenthub-ostrava"]')).not.toHaveCount(0);
    await expect(page.locator("footer.footer")).toContainText("StudentHub Ostrava");

    await page.goto("/brno");
    const brnoBrand = page.getByRole("link", { name: "StudentHub Brno – přehled" }).first();
    await expect(brnoBrand).toBeVisible();
    await expect(brnoBrand.locator('img[src*="studenthub-brno"]')).not.toHaveCount(0);
    await expect(page.locator("footer.footer")).toContainText("StudentHub Brno");
  });
});
