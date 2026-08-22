import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-focus-v3");
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
  await expect(page.getByRole("dialog", { name: "Ověřit e-mail" })).toContainText("e-mail se nikde veřejně nezobrazuje");
  await expect(page.getByRole("button", { name: "Zavřít formulář" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0); await expect(trigger).toBeFocused();
});

test("přihlášený formulář drží layout, validuje obrázek a odešle školní rozsah jen jednou", async ({ page }, testInfo) => {
  let submitted = ""; let postRequests = 0;
  await page.route("**/api/community/posts**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], viewer: { loggedIn: true, nickname: "Audit" }, nextPage: null }) });
    postRequests += 1; submitted = route.request().postData() || "";
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ item: { id: "11111111-1111-4111-8111-111111111111", nickname: "Audit", category: "Studium", body: "Hledám tipy na klidné studium v okolí kampusu.", universityId: "vut", facultyId: "vut-fekt", helpfulCount: 0, commentCount: 0, createdAt: "2026-08-22T10:00:00Z", updatedAt: "2026-08-22T10:00:00Z", owned: true, viewerHelpful: false } }) });
  });
  await page.goto("/komunita"); await page.getByRole("button", { name: "Napsat příspěvek" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Napsat příspěvek" }); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zveřejnit příspěvek" }).click(); await expect(dialog.getByRole("alert").first()).toContainText("Zkontrolujte formulář");
  await dialog.getByLabel("Text příspěvku *").fill("Hledám tipy na klidné studium v okolí kampusu.");
  await dialog.locator('select[name="universityId"]').selectOption("vut"); await dialog.locator('select[name="facultyId"]').selectOption("vut-fekt");
  const input = dialog.locator('input[type="file"]'); await input.setInputFiles({ name: "spatny.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") }); await expect(dialog.getByText(/JPEG, PNG nebo WebP do 5 MB/)).toBeVisible();
  await input.setInputFiles({ name: "kampus.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") }); await expect(dialog.getByAltText("Náhled přiloženého obrázku")).toBeVisible();
  await page.screenshot({ path: `artifacts/community-compose-${testInfo.project.name}.png`, fullPage: false });
  await dialog.getByRole("button", { name: "Odebrat" }).click(); await expect(dialog.getByAltText("Náhled přiloženého obrázku")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Zveřejnit příspěvek" }).click({ clickCount: 2 });
  await expect(dialog.getByRole("status")).toContainText("Příspěvek je zveřejněný"); await expect(page.getByText("Hledám tipy na klidné studium v okolí kampusu.")).toBeVisible();
  expect(submitted).toContain('name="universityId"'); expect(submitted).toContain("vut"); expect(submitted).toContain('name="facultyId"'); expect(submitted).toContain("vut-fekt"); expect(postRequests).toBe(1);
  await expect(dialog).toHaveCount(0, { timeout: 3_000 });
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
