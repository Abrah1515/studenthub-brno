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
  brandLogo: "#4f46e5",
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
  brandLogo: "#6366f1",
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
      brandLogo: style.getPropertyValue("--brand-logo").trim(),
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
  await expect(page.locator(".brand-mark img").first()).toHaveAttribute("src", /brand%2Fbrno%2Ficon-192\.png|brand\/brno\/icon-192\.png/);
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
