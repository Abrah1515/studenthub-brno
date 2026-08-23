import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
  await page.goto("/brno", { waitUntil: "domcontentloaded" });
});

test("hlavní akce odpovídají telefonu, tabletu a počítači", async ({ page }, testInfo) => {
  const topHelp = page.locator(".topbar-help");
  const topTheme = page.locator(".topbar-theme");
  const buddy = page.locator(".floating-help");
  if (testInfo.project.name === "mobile-390") {
    await expect(topHelp).toBeVisible();
    await expect(topTheme).toBeHidden();
    await expect(buddy).toBeVisible();
    const box = await buddy.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual((page.viewportSize()?.height || 0) - 66);
    return;
  }
  await expect(topTheme).toBeVisible();
  await expect(topHelp).toBeHidden();
  await expect(buddy).toBeHidden();
  if (testInfo.project.name === "desktop-1440") {
    await expect(page.getByRole("navigation", { name: "Hlavní navigace" }).getByRole("link", { name: "Studentská burza" })).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Otevřít nabídku" }).click();
    const menu = page.getByRole("dialog", { name: "Mobilní nabídka" });
    await expect(menu.getByRole("navigation", { name: "Hlavní navigace" }).getByRole("link", { name: "Studentská burza" })).toBeVisible();
    await expect(menu.getByRole("navigation", { name: "Hlavní navigace" }).getByRole("link", { name: "Hledám parťáka" })).toBeVisible();
  }
});

test("hranice 767 a 768 px nikdy nezobrazí obě varianty navigace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.setViewportSize({ width: 767, height: 900 });
  await expect(page.locator(".topbar-help")).toBeVisible();
  await expect(page.locator(".topbar-theme")).toBeHidden();
  await expect(page.locator(".floating-help")).toBeVisible();
  await page.getByRole("button", { name: "Otevřít nabídku" }).click();
  let menu = page.getByRole("dialog", { name: "Mobilní nabídka" });
  await expect(menu.getByRole("navigation", { name: "Doplňkové funkce" })).toBeVisible();
  await expect(menu.getByRole("navigation", { name: "Hlavní navigace" })).toBeHidden();
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator(".topbar-theme")).toBeVisible();
  await expect(page.locator(".topbar-help")).toBeHidden();
  await expect(page.locator(".floating-help")).toBeHidden();
  await page.getByRole("button", { name: "Otevřít nabídku" }).click();
  menu = page.getByRole("dialog", { name: "Mobilní nabídka" });
  await expect(menu.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
  await expect(menu.getByRole("navigation", { name: "Doplňkové funkce" })).toBeHidden();
});

test("telefonní menu obsahuje jen doplňkové funkce v určeném pořadí", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.getByRole("button", { name: "Otevřít nabídku" }).click();
  const menu = page.getByRole("dialog", { name: "Mobilní nabídka" });
  await expect(menu).toBeVisible();
  const labels = await menu.getByRole("navigation", { name: "Doplňkové funkce" }).locator(":scope > *").allTextContents();
  expect(labels.map((value) => value.replace(/\s+/g, " ").trim())).toEqual([
    "Hlídač",
    "Moje škola",
    "Nainstalovat aplikaci",
    "Návod",
    "Nastavení vzhleduPodle zařízeníSvětlý režimTmavý režim",
    "Pro spolky",
    "O projektu",
    "Kontakt",
    "Administrace",
  ]);
  await expect(menu.getByRole("link", { name: "Přehled", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Místa", exact: true })).toHaveCount(0);
});

test("oblíbený a sledovaný termín zůstane v Hlídači i bez registrace", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/brno/kalendar?university=vut&faculty=vut-fit");
  const card = page.locator("article.event-card").filter({ hasText: "Výuka v zimním semestru FIT VUT" }).last();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Oblíbit" }).click();
  await card.getByRole("button", { name: "Sledovat" }).click();
  await expect(card.getByRole("button", { name: "V oblíbených" })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("button", { name: "Sleduji" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/hlidac");
  await expect(page.getByRole("heading", { name: "Výuka v zimním semestru FIT VUT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zapnout push" })).toBeVisible();
  await page.getByRole("button", { name: "Odebrat" }).click();
  await expect(page.getByRole("heading", { name: "Nic tu ještě není" })).toBeVisible();
});

test("ztlumení kategorie se uloží pro anonymní instalaci a zůstane viditelné v nastavení", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const initialLoad = page.waitForResponse((response) => response.url().endsWith("/api/watcher") && response.request().method() === "GET");
  await page.goto("/hlidac");
  await initialLoad;
  const saved = await page.request.patch("/api/watcher", { data: { mutedCategories: ["exam"] } });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).mutedCategories).toEqual(["exam"]);
  await page.reload();
  await page.getByText("Ztlumit běžné kategorie push upozornění").click();
  await expect(page.getByLabel("Zkouškové období")).toBeChecked();
  expect((await (await page.request.get("/api/watcher")).json()).mutedCategories).toEqual(["exam"]);
  expect((await page.request.patch("/api/watcher", { data: { mutedCategories: [] } })).status()).toBe(200);
});

test("živý ICS odběr je stabilní, filtrovaný a lze jej zrušit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const created = await page.request.post("/api/calendar/subscriptions", { data: { cityId: "brno", universityId: "vut", facultyId: "vut-fit" } });
  expect(created.status()).toBe(201);
  const body = await created.json() as { httpsUrl: string };
  const feedUrl = new URL(body.httpsUrl);
  const feed = await page.request.get(`${feedUrl.pathname}${feedUrl.search}`);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toContain("text/calendar");
  const ics = await feed.text();
  expect(ics).toContain("Výuka v zimním semestru FIT VUT");
  expect(ics).not.toContain("FSI VUT");
  expect(ics).toMatch(/UID:[^\r\n]+/);
  expect(ics).toMatch(/SEQUENCE:\d+/);
  expect(ics).toMatch(/LAST-MODIFIED:\d{8}T\d{6}Z/);
  const token = feedUrl.pathname.match(/\/feed\/([^/]+)\.ics$/)?.[1];
  expect(token).toHaveLength(43);
  const revoked = await page.request.delete("/api/calendar/subscriptions", { data: { token } });
  expect(revoked.status()).toBe(200);
  expect((await page.request.get(feedUrl.pathname)).status()).toBe(410);
});

test("archiv technické pomoci už není veřejný ani zapisovatelný", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const created = await page.request.post("/api/service-requests", { data: {} });
  expect(created.status()).toBe(410);
  const archived = await page.request.get("/api/service-requests");
  expect(archived.status()).toBe(410);
  expect((await archived.json()).items).toEqual([]);
});

test("GPS chybu vysvětlí a dvoufázové klepnutí na mapu neposune stránku napoprvé", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError) } });
  });
  await page.goto("/brno/mista");
  await page.getByRole("button", { name: "Použít moji polohu" }).click();
  await expect(page.getByRole("status")).toContainText("Přístup k poloze je zamítnutý");
  const marker = page.locator(".leaflet-interactive").first();
  await expect(marker).toBeVisible();
  await marker.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await marker.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.locator(".leaflet-popup")).toBeVisible();
  await expect(page.locator(".place-card.selected")).toHaveCount(0);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(20);
  await marker.evaluate((element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.locator(".place-card.selected")).toHaveCount(1);
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeGreaterThan(20);
});

test("komunitní zájem se nezapočítá dvakrát a živý stav zůstane nejistý po jednom hlasu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const title = `E2E zájem ${Date.now()}`;
  await page.goto("/brno/kalendar?view=community");
  await page.getByRole("button", { name: "Přidat akci" }).click();
  const dialog = page.getByRole("dialog", { name: "Přidat akci" });
  const localFuture = await page.evaluate(() => { const date = new Date(Date.now() + 3 * 86_400_000); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); });
  await dialog.getByLabel("Název *").fill(title);
  await dialog.getByLabel("Začátek *").fill(localFuture);
  await dialog.getByLabel("Veřejné místo *").fill("Veřejná knihovna v Brně");
  await dialog.getByLabel("Popis *").fill("Veřejná studentská akce pro ověření unikátního projevení zájmu.");
  await dialog.getByLabel("E-mail autora *").fill("e2e-interest@example.cz");
  await dialog.getByText(/Potvrzuji, že uvádím pouze veřejné místo/).click();
  await dialog.getByRole("button", { name: "Zveřejnit akci" }).click();
  const manageUrl = await dialog.getByRole("link", { name: "Otevřít správu akce" }).getAttribute("href");
  await dialog.getByRole("button", { name: "Zavřít formulář" }).click();
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) });
  const interest = card.getByRole("button", { name: /Mám zájem/ });
  await interest.click();
  await expect(interest.getByLabel("1 zájemců")).toBeVisible();
  await interest.click();
  await expect(interest.getByLabel("0 zájemců")).toBeVisible();
  await page.goto(manageUrl!);
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.getByRole("button", { name: "Odstranit akci" }).click();

  await page.goto("/brno/mista?university=muni");
  const place = page.getByRole("article").filter({ hasText: "Menza Vinařská MUNI" });
  await place.getByRole("button").first().click();
  await place.getByRole("button", { name: "Nahlásit stav" }).click();
  await place.getByRole("button", { name: "Krátká fronta" }).click();
  await expect(place.getByText("Aktuální stav zatím neznáme")).toBeVisible();
  await expect(place.getByText(/1 čerstvá nezávislá hlášení/)).toBeVisible();
});
