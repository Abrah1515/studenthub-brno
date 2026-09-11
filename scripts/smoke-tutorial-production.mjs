import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.env.STUDENTHUB_PRODUCTION_URL || "https://studenthubapp.cz";
const cases = [
  { width: 390, height: 844, theme: "light", path: "/brno", lastCompletedStep: "welcome", expectedStep: "school-profile", file: "production-tutorial-390x844-light.png" },
  { width: 768, height: 1024, theme: "dark", path: "/brno", lastCompletedStep: "practical-services", expectedStep: "install", file: "production-tutorial-768x1024-dark.png" },
  { width: 1440, height: 900, theme: "light", path: "/brno/mista", lastCompletedStep: "watcher", expectedStep: "places", file: "production-tutorial-1440x900-light.png" },
];

mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const results = [];

try {
  for (const item of cases) {
    const context = await browser.newContext({ viewport: { width: item.width, height: item.height }, colorScheme: item.theme });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedInternalRequests = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText || "unknown";
      if (request.url().startsWith(baseUrl) && reason !== "net::ERR_ABORTED") failedInternalRequests.push(`${request.method()} ${request.url()} · ${reason}`);
    });
    await page.addInitScript(({ theme, lastCompletedStep }) => {
      localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
      localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "muni", facultyId: "muni-fi", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
      localStorage.setItem("studenthub-theme", theme);
      localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 2, introConfirmed: true, status: "in_progress", lastCompletedStep }));
    }, { theme: item.theme, lastCompletedStep: item.lastCompletedStep });
    const response = await page.goto(`${baseUrl}${item.path}?tutorial-production-audit=2`, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`${item.width}x${item.height}: HTTP ${response?.status() || "unknown"}`);
    const tour = page.getByTestId("guided-tutorial");
    await tour.waitFor({ state: "visible" });
    if (await tour.getAttribute("data-tour-step") !== item.expectedStep) throw new Error(`${item.width}x${item.height}: nesprávný krok tutorialu`);
    if (await page.locator('[role="dialog"][aria-modal="true"]').count() !== 1) throw new Error(`${item.width}x${item.height}: aktivní není právě jeden modál`);
    const geometry = await page.evaluate(() => {
      const popover = document.querySelector(".tutorial-popover")?.getBoundingClientRect();
      const spotlight = document.querySelector(".tutorial-spotlight")?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        inert: document.querySelector(".app-shell")?.hasAttribute("inert") || false,
        popoverInside: Boolean(popover && popover.left >= 0 && popover.top >= 0 && popover.right <= innerWidth && popover.bottom <= innerHeight),
        spotlightInside: Boolean(spotlight && spotlight.left >= 0 && spotlight.top >= 0 && spotlight.right <= innerWidth && spotlight.bottom <= innerHeight),
      };
    });
    if (geometry.overflow > 1 || !geometry.inert || !geometry.popoverInside || !geometry.spotlightInside) throw new Error(`${item.width}x${item.height}: neplatná geometrie ${JSON.stringify(geometry)}`);
    if (consoleErrors.length || failedInternalRequests.length) throw new Error(`${item.width}x${item.height}: chyby ${JSON.stringify({ consoleErrors, failedInternalRequests })}`);
    const screenshotPath = `artifacts/${item.file}`;
    await page.screenshot({ path: screenshotPath });
    results.push({ viewport: `${item.width}x${item.height}`, theme: item.theme, step: item.expectedStep, screenshotPath, ...geometry });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, results }, null, 2));
