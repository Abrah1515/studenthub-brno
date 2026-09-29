import { expect, test, type Page } from "@playwright/test";

const utilities = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Testovací WC", category: "Veřejné toalety", categoryCode: "public_toilet", address: "Brno", website: "", sourceUrl: "https://example.test/wc", lastVerifiedAt: "2026-09-25T08:00:00Z", verificationStatus: "verified", lat: 49.1954, lng: 16.6072, note: "WC" },
  { id: "10000000-0000-4000-8000-000000000002", name: "Testovací pítko", category: "Pítka", categoryCode: "drinking_fountain", address: "Brno", website: "", sourceUrl: "https://example.test/water", lastVerifiedAt: "2026-09-25T08:00:00Z", verificationStatus: "verified", lat: 49.196, lng: 16.608, note: "Pítko" },
  { id: "10000000-0000-4000-8000-000000000003", name: "Testovací lavička", category: "Lavičky a odpočinek", categoryCode: "bench", address: "Brno", website: "", sourceUrl: "https://example.test/bench", lastVerifiedAt: "2026-09-25T08:00:00Z", verificationStatus: "verified", lat: 49.1962, lng: 16.6082, note: "Lavička" },
];

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "", facultyId: "", studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
    sessionStorage.removeItem("studenthub-place-map-layers-v1");
  });
}

test.beforeEach(async ({ page }) => { await prepare(page); });

test("výběr místa se po jednom zaměření ustálí", async ({ page }) => {
  await page.goto("/brno/mista", { waitUntil: "domcontentloaded" });
  const marker = page.locator(".place-map-marker.main").first();
  await expect(marker).toBeVisible();
  const transitionProperty = await marker.evaluate(
    (element) => getComputedStyle(element).transitionProperty,
  );
  expect(transitionProperty.split(",").map((value) => value.trim())).not.toContain(
    "transform",
  );

  await marker.click();
  const selected = page.locator(".place-map-marker.selected").first();
  await expect(selected).toBeVisible();
  await expect(page.locator(".place-card.selected .place-details")).toBeVisible();
  await page.waitForTimeout(500);
  const settledTransform = await selected.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await page.waitForTimeout(450);
  await expect(selected).toBeVisible();
  expect(
    await selected.evaluate((element) => getComputedStyle(element).transform),
  ).toBe(settledTransform);

  const map = page.locator(".leaflet-host");
  const mapBox = await map.boundingBox();
  const markerBeforePan = await selected.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(markerBeforePan).not.toBeNull();
  if (!mapBox || !markerBeforePan) return;

  await page.mouse.move(mapBox.x + 70, mapBox.y + mapBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + 190, mapBox.y + mapBox.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForTimeout(700);

  const markerAfterPan = await selected.boundingBox();
  expect(markerAfterPan).not.toBeNull();
  if (!markerAfterPan) return;
  expect(Math.abs(markerAfterPan.x - markerBeforePan.x)).toBeGreaterThan(60);

  await page.waitForTimeout(1200);
  const markerAfterRefresh = await selected.boundingBox();
  expect(markerAfterRefresh).not.toBeNull();
  if (!markerAfterRefresh) return;
  expect(Math.abs(markerAfterRefresh.x - markerAfterPan.x)).toBeLessThan(3);
  expect(Math.abs(markerAfterRefresh.y - markerAfterPan.y)).toBeLessThan(3);
});

test("utility jsou výchozí skryté a aktivní vrstva se načte jen jednou pro výřez", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/places/map?**", async (route) => {
    requests += 1;
    const categories = new URL(route.request().url()).searchParams.get("categories")?.split(",") || [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: utilities.filter((item) => categories.includes(item.categoryCode)), truncated: false }) });
  });
  await page.goto("/brno/mista", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-host:visible")).toHaveCount(1);
  await page.waitForTimeout(500);
  expect(requests).toBe(0);
  await expect(page.locator(".place-map-marker.utility")).toHaveCount(0);
  await expect(page.locator(".place-map-marker.main").first()).toBeVisible();

  if ((page.viewportSize()?.width || 0) <= 860) {
    await page.getByRole("button", { name: /^Filtry/ }).click();
    const dialog = page.getByRole("dialog", { name: /^Filtry/ });
    await dialog.getByText("Vrstvy mapy").scrollIntoViewIfNeeded();
    await dialog.getByRole("checkbox", { name: "Veřejné toalety" }).check();
    await dialog.getByRole("button", { name: /^Zobrazit/ }).click();
  } else {
    await page.locator(".desktop-map-layers").getByRole("checkbox", { name: "Veřejné toalety" }).check();
  }
  await expect.poll(() => requests).toBe(1);
  await expect(page.locator(".place-map-cluster, .place-map-marker.utility").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("přímý filtr laviček zapne jejich vrstvu, ale na vzdáleném zoomu je drží ve shluku", async ({ page }) => {
  let requestedCategories = "";
  await page.route("**/api/places/map?**", async (route) => {
    requestedCategories = new URL(route.request().url()).searchParams.get("categories") || "";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [utilities[2]], truncated: false }) });
  });
  await page.goto("/brno/mista", { waitUntil: "domcontentloaded" });
  if ((page.viewportSize()?.width || 0) <= 860) {
    await page.getByRole("button", { name: /^Filtry/ }).click();
    const dialog = page.getByRole("dialog", { name: /^Filtry/ });
    await dialog.locator("select").first().selectOption({ label: "Lavičky a odpočinek" });
    await dialog.getByRole("button", { name: /^Zobrazit/ }).click();
  } else {
    const category = page.getByRole("region", { name: "Filtry míst" }).getByRole("combobox", { name: "Kategorie" });
    await category.selectOption({ label: "Lavičky a odpočinek" });
    await expect(category).toHaveValue("Lavičky a odpočinek");
  }
  await expect.poll(() => requestedCategories).toBe("bench");
  await expect(page.locator(".place-map-marker.utility")).toHaveCount(0);
  await expect(page.locator(".place-map-cluster")).toHaveCount(1);
});
