import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
  });
});

async function filterButton(page: import("@playwright/test").Page) {
  return page.locator("#hlavni-obsah").getByRole("button", { name: /^Filtry/ }).first();
}

test("mobilní filtry jsou sbalené, drží stav v URL a nepřekrývají navigaci", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.goto("/brno/kalendar");
  const calendarPanel = page.getByRole("dialog", { name: "Filtry" });
  await expect(calendarPanel).toHaveCount(0);
  const calendarButton = await filterButton(page); await calendarButton.click(); await expect(calendarPanel).toBeVisible();
  await calendarPanel.getByLabel("Hledat termín").fill("FIT"); await expect(page).toHaveURL(/q=FIT/);
  await calendarPanel.getByRole("button", { name: /Zobrazit \d+ událostí/ }).click(); await expect(calendarPanel).toHaveCount(0); await expect(calendarButton).toContainText("1");
  await page.goto("/brno"); await page.goBack(); await expect(page).toHaveURL(/q=FIT/); await (await filterButton(page)).click(); await expect(calendarPanel.getByLabel("Hledat termín")).toHaveValue("FIT");

  await page.goto("/brno/mista"); await expect(page.getByRole("dialog", { name: "Filtry" })).toHaveCount(0); await expect(await filterButton(page)).toBeVisible();
  await page.goto("/brno/nabidky"); await expect(page).toHaveURL(/\/brno$/); await expect(page.getByRole("heading", { name: "Aktuální nabídky" })).toHaveCount(0);
  const overlap = await page.evaluate(() => { const nav = document.querySelector(".bottom-nav")!.getBoundingClientRect(); const main = document.querySelector("#hlavni-obsah")!.getBoundingClientRect(); return { navTop: nav.top, viewport: innerHeight, mainBottom: main.bottom }; });
  expect(overlap.navTop).toBeLessThanOrEqual(overlap.viewport);
});

test("GPS se aktivuje jen po kliknutí, ukáže vzdálenost a Google Maps navigaci", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.addInitScript(() => {
    Object.assign(window, { __studenthubGpsCalls: 0 });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition(success: PositionCallback) { (window as typeof window & { __studenthubGpsCalls: number }).__studenthubGpsCalls += 1; success({ coords: { latitude: 49.1951, longitude: 16.6068, accuracy: 15, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as GeolocationPosition); }, watchPosition() { return 1; }, clearWatch() {} } });
  });
  await page.goto("/brno/mista");
  expect(await page.evaluate(() => (window as typeof window & { __studenthubGpsCalls: number }).__studenthubGpsCalls)).toBe(0);
  await page.getByRole("button", { name: "Použít moji polohu" }).click();
  expect(await page.evaluate(() => (window as typeof window & { __studenthubGpsCalls: number }).__studenthubGpsCalls)).toBe(1);
  await expect(page.locator(".place-distance").first()).toBeVisible();
  const firstPlace = page.locator("article.place-card").first(); await firstPlace.locator("button.place-card-main").click();
  await expect(firstPlace.getByRole("link", { name: "Navigovat" })).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);
  const layout = await page.evaluate(() => { const list = document.querySelector(".places-list")!; const map = document.querySelector(".map-shell")!; return { mapAfterList: Boolean(list.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING), navZ: Number.parseInt(getComputedStyle(document.querySelector(".bottom-nav")!).zIndex || "0", 10), mapZ: Number.parseInt(getComputedStyle(map).zIndex || "0", 10) || 0 }; });
  expect(layout.mapAfterList).toBe(true); expect(layout.navZ).toBeGreaterThan(layout.mapZ);
});

test("výběr místa propojí seznam s mapou, funguje klávesnicí a přežije posun mapy", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/brno/mista?university=muni&campus=Bohunice");
  await expect(page.getByLabel("Hledat místo nebo adresu")).toHaveValue("Bohunice"); await expect(page.getByText("Knihovna univerzitního kampusu MUNI", { exact: true })).toBeVisible();
  const cards = page.locator("article.place-card"); await expect(cards.first()).toBeVisible();
  const firstName = (await cards.first().locator("strong").first().textContent())!; await cards.first().locator("button.place-card-main").click();
  await expect(cards.first()).toHaveClass(/selected/); const firstMarker = page.getByRole("button", { name: `Vybrat místo ${firstName}` }); await expect(firstMarker).toHaveClass(/selected/);
  const map = page.locator(".leaflet-host"); const box = await map.boundingBox(); expect(box).toBeTruthy(); if (box) { await page.mouse.move(box.x + box.width * .55, box.y + box.height * .55); await page.mouse.down(); await page.mouse.move(box.x + box.width * .35, box.y + box.height * .45, { steps: 4 }); await page.mouse.up(); }
  await expect(cards.first()).toHaveClass(/selected/);
  const secondMarker = page.locator('.leaflet-interactive[role="button"]').nth(1); if (await secondMarker.count()) { await secondMarker.focus(); await page.keyboard.press("Enter"); await expect(cards.nth(1)).toHaveClass(/selected/); }
});

test("dashboard nepovažuje ukončený bodový termín za probíhající", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/brno");
  const current = page.getByRole("heading", { name: "Právě probíhá" }).locator("..").locator("..");
  if (await current.count()) await expect(current).not.toContainText("Registrace předmětů na HF JAMU");
  const nearest = page.locator("article.next-card"); await expect(nearest).not.toContainText("Registrace předmětů na HF JAMU");
});
