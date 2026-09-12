import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 1, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
  });
});

test("Bydlení je veřejné, serverově vykreslené a soukromé operace zůstávají chráněné", async ({ page, request }, testInfo) => {
  const response = await page.goto("/brno/bydleni?type=wanted&locality=Bohunice&sort=price_asc", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Bydlení", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Hledám bydlení" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Lokalita").first()).toHaveValue("Bohunice");
  expect(page.url()).toContain("type=wanted");
  expect(page.url()).toContain("locality=Bohunice");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  const feed = await request.get("/api/housing/listings?type=offer&locality=Brno");
  expect(feed.status()).toBe(200);
  const body = JSON.stringify(await feed.json());
  expect(body).not.toMatch(/moderation_note|duplicate_fingerprint|email|phone|exact_address/);
  const create = await request.post("/api/housing/listings", { multipart: { company: "" } });
  expect([401, 503]).toContain(create.status());
  const report = await request.post("/api/housing/listings/11111111-1111-4111-8111-111111111111/report", { data: { reason: "fraud", detail: "" } });
  expect(report.status()).toBe(401);

  await page.screenshot({ path: `artifacts/housing-${testInfo.project.name}.png`, fullPage: true });
});

test("navigace zpřístupní Bydlení bez zahuštění spodní lišty", async ({ page }) => {
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
  if ((page.viewportSize()?.width || 0) <= 860) {
    const bottomItems = page.locator(".bottom-nav a");
    expect(await bottomItems.count()).toBeLessThanOrEqual(5);
    await page.getByRole("button", { name: "Otevřít nabídku" }).click();
    const housing = page.locator(".mobile-menu-panel").getByRole("link", { name: "Bydlení" });
    await expect(housing).toBeVisible();
    await housing.click();
  } else {
    const housing = page.locator(".desktop-sidebar").getByRole("link", { name: "Bydlení" });
    await expect(housing).toBeVisible();
    await housing.click();
  }
  await expect(page).toHaveURL(/\/brno\/bydleni/);
  await expect(page.getByRole("heading", { name: "Bydlení", exact: true })).toBeVisible();
});

test("mobilní filtry používají jediný přístupný modal a vracejí focus", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.goto("/brno/bydleni", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: /^Filtry/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await page.locator('dialog[open]').count()).toBe(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("vytvoření a správa vyžadují společný potvrzený profil", async ({ page }) => {
  await page.goto("/brno/bydleni/novy", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Přihlásit se e-mailem" })).toBeVisible();
  await expect(page.getByText(/Pro vložení inzerátu se přihlaste potvrzeným e-mailem/i)).toBeVisible();
  await page.goto("/brno/bydleni/moje", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Přihlásit se e-mailem" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("Bydlení se nezpřístupňuje pro jiná města", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const response = await request.get("/praha/bydleni", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
