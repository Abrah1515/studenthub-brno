import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "community-calendar-v1");
  });
});

async function filterButton(page: import("@playwright/test").Page) {
  return page.locator("#hlavni-obsah").getByRole("button", { name: /^Filtry/ }).first();
}

test("mobilní filtry jsou sbalené, drží stav v URL a nepřekrývají navigaci", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.goto("/brno/kalendar");
  const calendarPanel = page.getByRole("region", { name: "Filtry událostí" });
  await expect(calendarPanel).toBeHidden();
  const calendarButton = await filterButton(page); await calendarButton.click(); await expect(calendarPanel).toBeVisible();
  await calendarPanel.getByLabel("Hledat termín").fill("FIT"); await expect(page).toHaveURL(/q=FIT/);
  await calendarButton.click(); await expect(calendarPanel).toBeHidden(); await expect(calendarButton).toContainText("1");
  await page.goto("/brno"); await page.goBack(); await expect(page).toHaveURL(/q=FIT/); await (await filterButton(page)).click(); await expect(calendarPanel.getByLabel("Hledat termín")).toHaveValue("FIT");

  await page.goto("/brno/mista"); await expect(page.getByRole("region", { name: "Filtry míst" })).toBeHidden(); await expect(await filterButton(page)).toBeVisible();
  await page.goto("/brno/nabidky"); await expect(page.getByRole("region", { name: "Filtry nabídek" })).toBeHidden(); await expect(await filterButton(page)).toBeVisible();
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

test("dashboard odděluje probíhající období od nejbližšího budoucího termínu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/brno");
  await expect(page.getByRole("heading", { name: "Právě probíhá" })).toBeVisible();
  const nearest = page.locator("article.next-card"); await expect(nearest).toContainText("Začátek podzimního semestru 2026"); await expect(nearest).not.toContainText("Registrace předmětů na HF JAMU");
});
