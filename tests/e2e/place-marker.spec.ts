import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "", facultyId: "", studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
});

test("výběr bodu používá vlastní přístupný marker bez chybějících Leaflet obrázků", async ({ page }) => {
  const legacyMarkerRequests: string[] = [];
  page.on("request", (request) => { if (/marker-(?:icon|shadow)(?:-2x)?\.png/i.test(request.url())) legacyMarkerRequests.push(request.url()); });
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "test", verified: true }, profile: { complete: true } }) }));
  await page.goto("/brno/mista", { waitUntil: "domcontentloaded" });
  await page.getByTestId("suggest-place").click();
  const dialog = page.getByRole("dialog", { name: "Navrhnout nové místo" });
  const marker = dialog.locator(".place-picker-marker");
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute("title", "Vybraný bod návrhu místa");
  await expect(marker).toHaveAttribute("tabindex", "0");
  await marker.focus();
  await expect(marker).toBeFocused();
  await expect(marker).toHaveClass(/leaflet-marker-draggable/);
  const latitude = dialog.getByLabel("Zeměpisná šířka");
  const before = await latitude.inputValue();
  const map = dialog.locator(".place-picker-map"); const mapBox = await map.boundingBox();
  if (mapBox) await map.click({ position: { x: Math.round(mapBox.width * .72), y: Math.round(mapBox.height * .38) } });
  await expect.poll(() => latitude.inputValue()).not.toBe(before);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect(marker.locator("span")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(legacyMarkerRequests).toEqual([]);
});
