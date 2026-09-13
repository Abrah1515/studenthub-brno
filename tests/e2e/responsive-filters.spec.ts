import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 1, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
  });
});

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test("všechny aktivní veřejné sekce používají na telefonu a tabletu společný filtr", async ({ page }, testInfo) => {
  test.skip((page.viewportSize()?.width || 0) > 860);
  const routes = [
    "/brno/bydleni",
    "/brno/burza",
    "/brno/kalendar",
    "/brno/kalendar?view=community",
    "/brno/mista",
    "/brno/brigady",
    "/brno/komunita",
    "/brno/partak",
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const trigger = page.getByRole("button", { name: /^Filtry/ }).first();
    await expect(trigger, `Chybí mobilní filtr na ${route}`).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Filtry" });
    await expect(dialog).toBeVisible();
    await expect(page.locator('body[data-filter-scroll-locked="true"]')).toHaveCount(1);
    await expect(page.locator(".app-shell")).toHaveCSS("touch-action", "none");
    await expect(dialog.getByRole("button", { name: /Použít filtry|Zobrazit/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await page.goto("/brno/mista", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Filtry/ }).click();
  await page.screenshot({ path: `artifacts/filters-${testInfo.project.name}.png`, fullPage: false });
});

test("filtr drží pozadí, obnoví pozici a zavře se všemi podporovanými cestami", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.goto("/brno/mista", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: /^Filtry/ });
  const triggerBox = await trigger.boundingBox();
  await page.evaluate((target) => window.scrollTo(0, target), Math.max(0, (triggerBox?.y || 0) - 80));
  const before = await page.evaluate(() => window.scrollY);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Filtry" });
  const dialogBody = dialog.locator(".mobile-filter-dialog-body");
  await expect(dialogBody).toHaveCSS("overflow-y", "auto");
  const lockedScroll = await page.evaluate(() => window.scrollY);
  await expect(page.locator("body")).toHaveCSS("top", `-${before}px`);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => window.scrollY)).toBe(lockedScroll);

  const category = dialog.getByText("Kategorie", { exact: true }).locator("..").getByRole("combobox");
  await category.selectOption({ label: "Knihovna" });
  await expect(dialog.getByLabel(/aktivních filtrů/).first()).toBeVisible();
  await dialog.getByRole("button", { name: /Zobrazit .* míst/ }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThanOrEqual(1);

  await trigger.click();
  await dialog.getByRole("button", { name: "Vymazat" }).click();
  await expect(dialog.getByLabel(/aktivních filtrů/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Zavřít filtry" }).click();
  await expect(dialog).toBeHidden();

  await trigger.click();
  await page.locator(".mobile-filter-layer").click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
  await expect(page.locator('body[data-filter-scroll-locked="true"]')).toHaveCount(0);
});

test("focus zůstává uvnitř dialogu a světlý i tmavý motiv používají designové tokeny", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "tablet-768");
  await page.goto("/brno/brigady", { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: /^Filtry/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Filtry" });
  await expect(dialog.getByRole("button", { name: "Zavřít filtry" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  const lightBackground = await dialog.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.keyboard.press("Escape");
  await page.evaluate(() => { localStorage.setItem("studenthub-theme", "dark"); document.documentElement.dataset.theme = "dark"; });
  await trigger.click();
  const darkBackground = await dialog.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  await expectNoHorizontalOverflow(page);
});

test("Burza má na desktopu stejný panel filtrů jako Bydlení", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const readPanelStyle = async () => page.locator(".housing-filters-desktop").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, top: style.top, padding: style.padding, display: style.display, gap: style.gap, borderRadius: style.borderRadius, backgroundColor: style.backgroundColor };
  });

  await page.goto("/brno/bydleni", { waitUntil: "domcontentloaded" });
  const housingStyle = await readPanelStyle();
  await page.goto("/brno/burza", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".marketplace-filter-sidebar").first()).toBeVisible();
  expect(await readPanelStyle()).toEqual(housingStyle);
  await expect(page.getByRole("button", { name: /^Filtry/ })).toBeHidden();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "artifacts/filters-desktop-1440.png", fullPage: false });
});

test("mobilní filtr se vejde na všechny požadované šířky", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/brno/burza", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Filtry/ }).click();
    const box = await page.getByRole("dialog", { name: "Filtry" }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
  }
});
