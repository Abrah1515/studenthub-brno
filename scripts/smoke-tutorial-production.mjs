import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { chromium } from "@playwright/test";

const baseUrl = process.argv[2] || process.env.STUDENTHUB_PRODUCTION_URL || "https://studenthubapp.cz";
const sequences = {
  mobile: ["welcome", "overview", "calendar", "places", "community", "jobs", "buddy", "chat", "marketplace", "menu", "housing", "watcher", "school-profile", "change-city", "install", "appearance", "about", "contact", "admin", "complete"],
  tablet: ["welcome", "overview", "calendar", "places", "community", "jobs", "chat", "appearance", "menu", "watcher", "buddy", "marketplace", "housing", "school-profile", "change-city", "about", "install", "contact", "admin", "complete"],
  desktop: ["welcome", "overview", "calendar", "watcher", "chat", "places", "community", "buddy", "jobs", "marketplace", "housing", "school-profile", "change-city", "about", "install", "contact", "admin", "appearance", "complete"],
};
const viewports = [
  { width: 360, height: 800, target: "calendar" },
  { width: 390, height: 844, target: "marketplace", back: true },
  { width: 412, height: 915, target: "admin" },
  { width: 768, height: 1024, target: "marketplace" },
  { width: 1024, height: 768, target: "housing" },
  { width: 1440, height: 900, target: "appearance", back: true },
  { width: 1920, height: 1080, target: "complete" },
];
const themes = ["light", "dark"];

function layoutFor(width) { return width <= 767 ? "mobile" : width <= 860 ? "tablet" : "desktop"; }
function screenshotName(item, theme, suffix = "") { return "artifacts/production-tutorial-" + item.width + "x" + item.height + "-" + theme + "-" + item.target + suffix + ".png"; }

async function prepare(page, theme) {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "muni", facultyId: "muni-fi", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-theme", selectedTheme);
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "not_started", lastCompletedStep: null }));
  }, theme);
}

async function assertStep(page, expected, total) {
  const tour = page.getByTestId("guided-tutorial");
  await tour.waitFor({ state: "visible" });
  await page.waitForFunction((id) => {
    const tutorial = document.querySelector('[data-testid="guided-tutorial"]');
    return tutorial?.getAttribute("data-tour-step") === id
      && tutorial?.getAttribute("data-tour-transitioning") === "false"
      && Boolean(document.querySelector(".tutorial-spotlight"));
  }, expected);
  if (await tour.getAttribute("data-tour-step") !== expected) throw new Error("Očekáván krok " + expected);
  if (!(await tour.getByText((sequences[await tour.getAttribute("data-tour-layout")].indexOf(expected) + 1) + " z " + total).isVisible())) throw new Error("Nesprávný průběh u " + expected);
  if (new URL(page.url()).pathname !== "/brno") throw new Error("Tutorial změnil routu na " + page.url());
  if (await page.locator('[role="dialog"][aria-modal="true"]').count() !== 1) throw new Error("Aktivní není právě jeden modál");
}

async function geometry(page) {
  return page.evaluate(() => {
    const popover = document.querySelector(".tutorial-popover")?.getBoundingClientRect();
    const spotlight = document.querySelector(".tutorial-spotlight")?.getBoundingClientRect();
    if (!popover || !spotlight) return null;
    const overlapWidth = Math.max(0, Math.min(popover.right, spotlight.right) - Math.max(popover.left, spotlight.left));
    const overlapHeight = Math.max(0, Math.min(popover.bottom, spotlight.bottom) - Math.max(popover.top, spotlight.top));
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      popoverInside: popover.left >= 0 && popover.top >= 0 && popover.right <= innerWidth && popover.bottom <= innerHeight,
      spotlightInside: spotlight.left >= 0 && spotlight.top >= 0 && spotlight.right <= innerWidth && spotlight.bottom <= innerHeight,
      overlapArea: overlapWidth * overlapHeight,
      inert: document.querySelector(".app-shell")?.hasAttribute("inert") || false,
    };
  });
}

async function openAuditedPage(browser, item, theme, recordVideo) {
  const context = await browser.newContext({
    viewport: { width: item.width, height: item.height },
    colorScheme: theme,
    ...(recordVideo ? { recordVideo: { dir: "artifacts/tutorial-videos", size: { width: item.width, height: item.height } } } : {}),
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedInternalRequests = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => {
    const reason = request.failure()?.errorText || "unknown";
    if (request.url().startsWith(baseUrl) && reason !== "net::ERR_ABORTED") failedInternalRequests.push(request.method() + " " + request.url() + " · " + reason);
  });
  await prepare(page, theme);
  const response = await page.goto(baseUrl + "/brno?tutorial-order-audit=3", { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(item.width + "x" + item.height + ": HTTP " + (response?.status() || "unknown"));
  return { context, page, consoleErrors, failedInternalRequests };
}

async function moveTo(page, sequence, target) {
  const targetIndex = sequence.indexOf(target);
  for (let index = 0; index <= targetIndex; index += 1) {
    await assertStep(page, sequence[index], sequence.length);
    if (index < targetIndex) await page.getByTestId("guided-tutorial").getByRole("button", { name: "Další" }).click();
  }
}

mkdirSync("artifacts", { recursive: true });
mkdirSync("artifacts/tutorial-videos", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const results = [];

try {
  for (const item of viewports) {
    for (const theme of themes) {
      const layout = layoutFor(item.width);
      const sequence = sequences[layout];
      const { context, page, consoleErrors, failedInternalRequests } = await openAuditedPage(browser, item, theme, false);
      await moveTo(page, sequence, item.target);
      const measured = await geometry(page);
      if (!measured || measured.overflow > 1 || !measured.inert || !measured.popoverInside || !measured.spotlightInside || measured.overlapArea > 1) throw new Error(item.width + "x" + item.height + ": neplatná geometrie " + JSON.stringify(measured));
      if (consoleErrors.length || failedInternalRequests.length) throw new Error(item.width + "x" + item.height + ": chyby " + JSON.stringify({ consoleErrors, failedInternalRequests }));
      const file = screenshotName(item, theme);
      await page.screenshot({ path: file });
      let backFile = null;
      if (item.back) {
        const currentIndex = sequence.indexOf(item.target);
        await page.getByTestId("guided-tutorial").getByRole("button", { name: "Předchozí krok" }).click();
        await assertStep(page, sequence[currentIndex - 1], sequence.length);
        backFile = screenshotName(item, theme, "-back");
        await page.screenshot({ path: backFile });
      }
      results.push({ viewport: item.width + "x" + item.height, theme, layout, step: item.target, file, backFile, ...measured });
      await context.close();
    }
  }

  for (const item of [{ width: 390, height: 844, theme: "light", name: "mobile" }, { width: 1440, height: 900, theme: "dark", name: "desktop" }]) {
    const sequence = sequences[layoutFor(item.width)];
    const { context, page, consoleErrors, failedInternalRequests } = await openAuditedPage(browser, item, item.theme, true);
    const video = page.video();
    for (let index = 0; index < sequence.length; index += 1) {
      await assertStep(page, sequence[index], sequence.length);
      await page.waitForTimeout(120);
      await page.getByTestId("guided-tutorial").getByRole("button", { name: index === sequence.length - 1 ? "Dokončit" : "Další" }).click();
    }
    if (consoleErrors.length || failedInternalRequests.length) throw new Error("Video " + item.name + ": chyby " + JSON.stringify({ consoleErrors, failedInternalRequests }));
    await context.close();
    const source = await video.path();
    const destination = "artifacts/production-tutorial-" + item.name + "-walkthrough.webm";
    if (existsSync(destination)) rmSync(destination);
    renameSync(source, destination);
    results.push({ recording: item.name, file: destination });
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseUrl, results }, null, 2));
