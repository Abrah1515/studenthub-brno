import { expect, test } from "@playwright/test";

const lightPalette = {
  background: "#f8fafc",
  surface: "#fff",
  surfaceMuted: "#f1f5f9",
  primary: "#4f46e5",
  primaryHover: "#4338ca",
  primaryBright: "#6366f1",
  primarySoft: "#e0e7ff",
  text: "#0f172a",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  border: "#e2e8f0",
};

const darkPalette = {
  background: "#0f172a",
  surface: "#111827",
  surfaceMuted: "#1e293b",
  primary: "#6366f1",
  primaryHover: "#a5b4fc",
  primaryBright: "#818cf8",
  primarySoft: "#20264a",
  text: "#f8fafc",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  border: "#273244",
};

async function renderedPalette(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      background: style.getPropertyValue("--background").trim(),
      surface: style.getPropertyValue("--surface").trim(),
      surfaceMuted: style.getPropertyValue("--surface-muted").trim(),
      primary: style.getPropertyValue("--primary").trim(),
      primaryHover: style.getPropertyValue("--primary-hover").trim(),
      primaryBright: style.getPropertyValue("--primary-bright").trim(),
      primarySoft: style.getPropertyValue("--primary-soft").trim(),
      text: style.getPropertyValue("--text").trim(),
      textSecondary: style.getPropertyValue("--text-secondary").trim(),
      textMuted: style.getPropertyValue("--text-muted").trim(),
      border: style.getPropertyValue("--border").trim(),
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
});

test("Campus Indigo se vykreslí ve světle i tmě bez overflow", async ({ page }, testInfo) => {
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("studenthub-theme", "light"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await renderedPalette(page)).toEqual(lightPalette);
  await expect(page.locator(".brand img").first()).toHaveAttribute("src", /studenthub-(?:logo|icon)-v2/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.evaluate(() => localStorage.setItem("studenthub-theme", "dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await renderedPalette(page)).toEqual(darkPalette);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `artifacts/campus-indigo-dark-${testInfo.project.name}.png`, fullPage: true });
});

test("systémový režim reaguje na změnu zařízení", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("studenthub-theme", "system"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await renderedPalette(page)).toEqual(lightPalette);
});

test("nové logo je čitelné v navigaci, účtu, administraci a tmavém režimu", async ({ page }) => {
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  const mobile = (page.viewportSize()?.width || 0) <= 860;
  if (mobile) {
    await expect(page.locator(".mobile-brand .brand-mark img")).toBeVisible();
    await expect(page.locator(".mobile-brand .brand-mark img")).toHaveAttribute("src", /studenthub-icon-v2-192\.png/);
  } else {
    const horizontalLogo = page.locator(".desktop-sidebar .brand-logo-horizontal");
    const symbol = horizontalLogo.locator(".brand-logo-horizontal-symbol");
    const wordmark = horizontalLogo.locator(".brand-logo-wordmark");
    await expect(horizontalLogo).toBeVisible();
    await expect(page.locator(".desktop-sidebar .brand-logo-light")).toBeVisible();
    await expect(page.locator(".desktop-sidebar .brand-logo-light")).toHaveAttribute("src", /studenthub-logo-v2\.png/);
    const [logoBox, symbolBox, wordmarkBox] = await Promise.all([horizontalLogo.boundingBox(), symbol.boundingBox(), wordmark.boundingBox()]);
    expect(logoBox && logoBox.width > logoBox.height * 2.5).toBeTruthy();
    expect(symbolBox && wordmarkBox && symbolBox.x + symbolBox.width < wordmarkBox.x).toBeTruthy();
  }

  await page.goto("/ucet/prihlaseni", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".auth-brand-logo .brand-logo-light")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("studenthub-theme", "dark"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".auth-brand-logo .brand-logo-light")).toBeHidden();
  await expect(page.locator(".auth-brand-logo .brand-logo-dark")).toBeVisible();
  await expect(page.locator(".auth-brand-logo .brand-logo-dark")).toHaveAttribute("src", /studenthub-logo-dark-v2\.png/);

  await page.goto("/admin/prihlaseni", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".admin-login-logo .brand-logo-dark")).toBeVisible();
  await page.goto("/o-projektu", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".about-brand-logo .brand-logo-dark")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
