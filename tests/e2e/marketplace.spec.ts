import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 1, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
});

test("anonymní uživatel může Burzu číst, ale nemůže publikovat ani kontaktovat", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const feed = await request.get("/api/marketplace/listings?city=brno");
  expect(feed.status()).toBe(200);
  const serialized = JSON.stringify(await feed.json());
  expect(serialized).not.toMatch(/seller_email|buyer_email|management_token|verification_token|author_id/);

  const publish = await request.post("/api/marketplace/listings", { multipart: { company: "" } });
  expect([401, 503]).toContain(publish.status());
  expect((await publish.json()).message).toMatch(/přihlaste|Supabase Auth/i);

  await page.goto("/brno/burza/novy");
  await expect(page.getByRole("heading", { name: "Přihlásit se e-mailem" })).toBeVisible();
  await expect(page.getByText(/Pro vložení inzerátu se přihlaste/i)).toBeVisible();
  await expect(page.locator('input[name="sellerEmail"]')).toHaveCount(0);
});

test("odstraněné per-inzerátové ověření není veřejným obchvatem účtu", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const oldOtp = await request.post("/api/auth/otp", { data: { email: "legacy@example.cz" } });
  expect(oldOtp.status()).toBe(410);
  const invalid = await request.post("/api/marketplace/listings", { multipart: { company: "robot" } });
  expect([401, 503]).toContain(invalid.status());
});

test("burza, filtry a přihlašovací brána jsou responzivní na telefonu, tabletu i počítači", async ({ page }, testInfo) => {
  await page.goto("/brno/burza");
  await expect(page.getByRole("heading", { name: "Studentská burza" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const filters = page.locator("details.marketplace-filters");
  if (testInfo.project.name === "mobile-390") { await expect(filters).not.toHaveAttribute("open", ""); await filters.getByText(/Filtrovat/).click(); await expect(filters).toHaveAttribute("open", ""); }
  else await expect(filters).toHaveAttribute("open", "");
  await page.goto("/brno/burza/novy");
  await expect(page.getByRole("heading", { name: "Přihlásit se e-mailem" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator(".auth-card").getByRole("button", { name: "Přihlásit se e-mailem" }).last()).toBeVisible();
});
