import { expect, test } from "@playwright/test";

const title = "E2E učebnice lineární algebry";
const sellerEmail = "seller-marketplace-e2e@example.cz";
const listingForm = (overrides: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {}) => ({
  cityId: "brno", listingType: "offer", category: "textbook", title, shortDescription: "Zachovalá fyzická učebnice pro první ročník.", description: "Prodávám vlastní fyzický výtisk učebnice v dobrém stavu a bez chybějících stran.", priceMode: "fixed", priceAmount: "250", priceScope: "item", universityId: "vut", facultyId: "vut-fekt", studyProgram: "Elektrotechnika", subjectName: "Matematika", subjectCode: "BMA1", teacherName: "", recommendedYear: "1", semester: "winter", academicYear: "2026/2027", materialFormat: "printed", itemCondition: "used", handoffMethod: "in_person", handoffLocation: "Technická", publicAlias: "E2E student", sellerEmail, copyrightConfirmed: "true", ownNotesConfirmed: "false", privacyConsent: "true", company: "", ...overrides,
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 1, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
});

test("vytvoření, ověření, soukromí, správa, hlášení a moderace inzerátu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const created = await page.request.post("/api/marketplace/listings", { multipart: listingForm() });
  expect(created.status()).toBe(201);
  const createdPayload = await created.json() as { id: string; verifyUrl: string };
  expect(createdPayload.id).toMatch(/^[a-f0-9-]{36}$/);
  expect(createdPayload.verifyUrl).toContain("#verification=");

  const beforeVerification = await page.request.get("/api/marketplace/listings?city=brno");
  expect(JSON.stringify(await beforeVerification.json())).not.toContain(title);

  const verificationUrl = new URL(createdPayload.verifyUrl);
  await page.goto(`${verificationUrl.pathname}${verificationUrl.search}${verificationUrl.hash}`);
  await expect(page.getByRole("heading", { name: "Inzerát je zveřejněný" })).toBeVisible();
  await expect(page).not.toHaveURL(/verification=|management=/);
  const manageHref = await page.getByRole("link", { name: "Spravovat inzerát" }).getAttribute("href");
  expect(manageHref).toContain("/brno/burza/sprava?id=");

  const publicResponse = await page.request.get(`/api/marketplace/listings/${createdPayload.id}`);
  expect(publicResponse.status()).toBe(200);
  const serializedPublic = JSON.stringify(await publicResponse.json());
  expect(serializedPublic).toContain(title);
  expect(serializedPublic).not.toContain(sellerEmail);
  expect(serializedPublic).not.toMatch(/seller_email|buyer_email|management_token|verification_token|moderation_note/);
  const conditionFiltered = await page.request.get("/api/marketplace/listings?city=brno&condition=used&faculty=vut-fekt");
  expect(JSON.stringify(await conditionFiltered.json())).toContain(title);

  await page.goto("/brno/burza");
  const listingCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(listingCard).toContainText("VUT · FEKT");
  await expect(listingCard).toContainText("1. ročník");
  await expect(listingCard).toContainText("Tištěné · Použité · Technická");
  await expect(listingCard).toContainText("Zveřejněno");

  await page.goto(`/brno/burza/${createdPayload.id}`);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByRole("button", { name: "Uloženo" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Váš e-mail").fill("buyer-marketplace-e2e@example.cz");
  await page.getByLabel("Zpráva").fill("Mám o učebnici zájem, je ještě možné osobní předání?");
  await page.getByText("Souhlasím s předáním e-mailu a zprávy prodávajícímu.").click();
  await page.getByRole("button", { name: "Kontaktovat prodávajícího" }).click();
  await expect(page.getByText(/V demo režimu není e-mailový relay zapnutý/)).toBeVisible();

  const report = await page.request.post(`/api/marketplace/listings/${createdPayload.id}/report`, { data: { reason: "copyright", detail: "Regresní test hlášení.", company: "" } });
  expect(report.status()).toBe(201);
  expect((await page.request.post(`/api/marketplace/listings/${createdPayload.id}/report`, { data: { reason: "copyright", detail: "Duplicitní hlášení.", company: "" } })).status()).toBe(409);

  await page.goto("/admin/prihlaseni");
  const adminDataResponse = page.waitForResponse((response) => response.url().endsWith("/api/admin/data") && response.request().method() === "GET");
  await page.getByLabel("E-mail").fill("audit@example.cz"); await page.getByLabel("Heslo").fill("local-test-password-2026"); await page.getByRole("button", { name: "Přihlásit se" }).click(); await page.waitForURL((url) => url.pathname === "/admin");
  const adminResponse = await adminDataResponse;
  expect(adminResponse.status()).toBe(200);
  const adminData = await adminResponse.json();
  const adminMarketplace = JSON.stringify(adminData.marketplace_listings);
  expect(adminMarketplace).toContain(title); expect(adminMarketplace).not.toContain(sellerEmail); expect(adminMarketplace).not.toMatch(/seller_email|management_token|verification_token|request_fingerprint/);
  const adminFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => page.evaluate(async ({ url, init }) => (await fetch(url, init)).status, { url, init });
  expect(await adminFetch(`/api/admin/marketplace/${createdPayload.id}/sensitive`)).toBe(403);
  const reportId = String((adminData.marketplace_reports as Array<{ id: string; listing_id: string }>).find((value) => value.listing_id === createdPayload.id)?.id);
  expect(reportId).not.toBe("undefined");
  expect(await adminFetch("/api/admin/marketplace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: createdPayload.id, reportId, action: "resolve_report", reason: "E2E vyřešení hlášení" }) })).toBe(200);
  expect(await adminFetch("/api/admin/marketplace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: createdPayload.id, action: "hide", reason: "E2E kontrola moderace" }) })).toBe(200);
  expect((await page.request.get(`/api/marketplace/listings/${createdPayload.id}`)).status()).toBe(404);
  expect(await adminFetch("/api/admin/marketplace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: createdPayload.id, action: "restore", reason: "E2E obnova po kontrole" }) })).toBe(200);
  expect(await adminFetch("/api/admin/marketplace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: createdPayload.id, action: "block_abuse", reason: "E2E blokace opakovaného zneužití" }) })).toBe(200);
  expect(await adminFetch("/api/admin/marketplace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: createdPayload.id, action: "restore", reason: "E2E obnova testovaného inzerátu" }) })).toBe(200);
  await page.getByRole("button", { name: "Odhlásit" }).click();

  await page.goto(manageHref!);
  await expect(page.getByRole("heading", { name: "Správa inzerátu" })).toBeVisible();
  await page.getByRole("button", { name: "Rezervováno" }).click(); await expect(page.getByRole("status")).toContainText("Změna byla uložena");
  await page.getByRole("button", { name: "Prodáno" }).click(); await expect(page.getByRole("status")).toContainText("Změna byla uložena");
  await page.getByRole("button", { name: "Znovu aktivovat" }).click(); await expect(page.getByRole("status")).toContainText("Změna byla uložena");
  await page.getByRole("button", { name: "Prodloužit o 30 dní" }).click(); await expect(page.getByRole("status")).toContainText("prodloužen");
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Odstranit" }).click(); await expect(page.getByRole("heading", { name: "Inzerát byl odstraněn" })).toBeVisible();
  expect((await page.request.get(`/api/marketplace/listings/${createdPayload.id}`)).status()).toBe(404);
});

test("formulář odmítne nevalidní data, zakázaný soubor a po limitu vrátí 429", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const invalid = await page.request.post("/api/marketplace/listings", { multipart: { company: "robot" } });
  expect(invalid.status()).toBe(422);
  const unsafe = await page.request.post("/api/marketplace/listings", { multipart: listingForm({ title: "E2E učebnice s SVG", sellerEmail: "svg-marketplace-e2e@example.cz", photos: { name: "attack.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg><script>alert(1)</script></svg>") } }) });
  expect(unsafe.status()).toBe(422); expect((await unsafe.json()).message).toMatch(/JPEG|PNG|WebP|SVG|dokumenty/);
  const limited = await page.request.post("/api/marketplace/listings", { multipart: listingForm({ title: "Další inzerát po limitu", sellerEmail: "rate-marketplace-e2e@example.cz" }) });
  expect(limited.status()).toBe(429);
});

test("burza a filtry jsou responzivní na telefonu, tabletu i počítači", async ({ page }, testInfo) => {
  await page.goto("/brno/burza");
  await expect(page.getByRole("heading", { name: "Studentská burza" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const filters = page.locator("details.marketplace-filters");
  if (testInfo.project.name === "mobile-390") { await expect(filters).not.toHaveAttribute("open", ""); await filters.getByText(/Filtrovat/).click(); await expect(filters).toHaveAttribute("open", ""); }
  else await expect(filters).toHaveAttribute("open", "");
  await page.goto("/brno/burza/novy");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('select[name="universityId"]')).toHaveValue("vut");
  await expect(page.locator('select[name="facultyId"]')).toHaveValue("vut-fekt");
});
