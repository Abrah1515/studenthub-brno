import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "student-community-v2");
  });
});

test("komunitní feed má bezpečný prázdný stav, filtry a nepřetéká", async ({ page }) => {
  await page.goto("/komunita");
  await expect(page.getByRole("heading", { name: "Studentská komunita", exact: true })).toBeVisible();
  await expect(page.getByText("Komunita zatím čeká na první příspěvek")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nejnovější" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Oblíbené" })).toBeVisible();
  await expect(page.getByLabel("Univerzita", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("formulář příspěvku vyžádá ověřený e-mail a zachová jediný modál", async ({ page }) => {
  await page.goto("/komunita"); const trigger = page.getByRole("button", { name: "Napsat příspěvek" }).first(); await trigger.click();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Ověřit e-mail" })).toBeVisible();
  await expect(page.getByText(/e-mail se nikde veřejně nezobrazí/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Zavřít formulář" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0); await expect(trigger).toBeFocused();
});

test("mobilní navigace má přesně pět požadovaných položek a aktivní komunitu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390"); await page.goto("/komunita"); const nav = page.getByRole("navigation", { name: "Mobilní navigace" });
  await expect(nav.getByRole("link")).toHaveCount(5); await expect(nav.getByRole("link").allTextContents()).resolves.toEqual(["Přehled", "Termíny", "Místa", "Komunita", "Brigády"]);
  await expect(nav.getByRole("link", { name: "Komunita" })).toHaveAttribute("aria-current", "page");
});

test("veřejné API nevrací falešná data a chráněná moderace odmítne anonymní přístup", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440"); const feed = await request.get("/api/community/posts?city=brno&page=1&sort=newest"); expect(feed.status()).toBe(200); const payload = await feed.json(); expect(payload.items).toEqual([]); expect(JSON.stringify(payload)).not.toContain("email");
  const admin = await request.patch("/api/admin/community", { data: { targetType: "settings", targetId: "brno", action: "set_threshold", threshold: 3 } }); expect(admin.status()).toBe(401);
});
