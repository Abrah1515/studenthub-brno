import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "", facultyId: "", studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
  });
});

test("právní dokument je čitelný bez vodorovného přetečení", async ({ page }) => {
  await page.goto("/soukromi");
  await expect(page.getByRole("heading", { name: "Zásady ochrany osobních údajů StudentHub" })).toBeVisible();
  await expect(page.getByText("Adam Abrahámek", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("12. září 2026", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Cookies", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("všechny tři dokumenty mají úplný obsah, canonical a bez placeholderů", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  for (const [path, heading, lastHeading, canonical] of [
    ["/soukromi", "Zásady ochrany osobních údajů StudentHub", "17. Stížnost u dozorového úřadu", "https://studenthubapp.cz/soukromi"],
    ["/cookies", "Zásady používání cookies a lokálního úložiště StudentHub", "13. Kontakt", "https://studenthubapp.cz/cookies"],
    ["/podminky", "Podmínky a pravidla StudentHub", "22. Závěrečná ustanovení", "https://studenthubapp.cz/podminky"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("heading", { name: lastHeading })).toBeAttached();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
    expect(await page.locator("body").innerText()).not.toMatch(/Pracovní verze|\[DOPLNIT|\[OVĚŘIT|localhost/i);
  }
});

test("obsah dokumentu vede na skutečnou kapitolu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/podminky");
  await page.getByRole("link", { name: "Soukromý chat", exact: true }).click();
  await expect(page).toHaveURL(/#chat$/);
  await expect(page.getByRole("heading", { name: "8. Soukromý chat" })).toBeVisible();
});

test("nastavení cookies odkazuje na právní dokumenty a lze odmítnout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.addInitScript(() => localStorage.removeItem("studenthub-consent"));
  await page.goto("/brno");
  const dialog = page.getByTestId("cookie-consent");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Ochrana osobních údajů" })).toHaveAttribute("href", "/soukromi");
  await expect(dialog.getByRole("link", { name: "Podmínky a pravidla" })).toHaveAttribute("href", "/podminky");
  await dialog.getByRole("button", { name: "Odmítnout volitelné" }).click();
  await expect(dialog).toBeHidden();
});

test("cookie opt-in, odmítnutí a odvolání řídí analytické požadavky", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "", facultyId: "", studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
  });
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/analytics/pageview")) analyticsRequests.push(request.url());
  });

  await page.goto("/brno");
  const dialog = page.getByTestId("cookie-consent");
  await expect(dialog).toBeVisible();
  await expect.poll(() => analyticsRequests.length).toBe(0);

  await dialog.getByRole("button", { name: "Odmítnout volitelné" }).click();
  await page.reload();
  await expect(page.getByTestId("cookie-consent")).toBeHidden();
  await expect.poll(() => analyticsRequests.length).toBe(0);

  await page.evaluate(() => localStorage.removeItem("studenthub-consent"));
  await page.reload();
  await page.getByTestId("cookie-consent").getByRole("button", { name: "Přijmout vše" }).click();
  await expect.poll(() => analyticsRequests.length).toBe(1);
  await expect.poll(() => page.context().cookies().then((cookies) => cookies.some((cookie) => cookie.name === "sh_analytics_consent" && cookie.value === "1"))).toBe(true);

  await page.goto("/cookies");
  await page.getByRole("button", { name: "Nastavení cookies" }).first().click();
  const settings = page.getByTestId("cookie-consent");
  await settings.getByRole("checkbox", { name: "Analytické" }).uncheck();
  await settings.getByRole("button", { name: "Uložit nastavení" }).click();
  await expect.poll(() => page.context().cookies().then((cookies) => cookies.some((cookie) => cookie.name === "sh_analytics_consent"))).toBe(false);
  const countAfterRevoke = analyticsRequests.length;
  await page.goto("/podminky");
  await page.waitForTimeout(300);
  expect(analyticsRequests).toHaveLength(countAfterRevoke);
  await context.close();
});

test("právní dokument podporuje tmavý režim, 200% zoom, focus a tisk", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.addInitScript(() => localStorage.setItem("studenthub-theme", "dark"));
  await page.goto("/soukromi");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("article.legal-card")).toBeVisible();
});
