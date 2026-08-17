import { expect, test } from "@playwright/test";

async function dismissOverlays(page: import("@playwright/test").Page) {
  const consent = page.getByTestId("cookie-consent"); if (await consent.isVisible()) { await consent.getByRole("button", { name: "Odmítnout volitelné" }).click(); await expect(consent).toBeHidden(); }
  const picker = page.getByTestId("first-run-picker"); if (await picker.isVisible()) await picker.getByRole("button", { name: "Pokračovat vědomě bez výběru školy pro celé město Brno" }).click();
}
async function openDirectoryFilters(page: import("@playwright/test").Page) {
  const button = page.locator("#hlavni-obsah").getByRole("button", { name: /^Filtry/ }).first();
  if (await button.isVisible() && await button.getAttribute("aria-expanded") === "false") await button.click();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("studenthub-e2e-overlays") === "manual") return;
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    if (!localStorage.getItem("studenthub-preference-v4")) localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "community-calendar-v1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" }); await dismissOverlays(page);
});

test("načte použitelný dashboard bez veřejných demo dat", async ({ page }) => { await expect(page.getByRole("heading", { name: "StudentHub Brno" })).toBeVisible(); await expect(page.locator("#hlavni-obsah").getByRole("link", { name: "Potřebuji technickou pomoc", exact: true })).toBeVisible(); await expect(page.getByText("DEMO DATA")).toHaveCount(0); await expect(page.getByText(/Nezávislý projekt\. Není oficiálně spojený/)).toHaveCount(1); await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/brno$/); });

test("filtruje ověřené akademické události", async ({ page }) => {
  await page.goto("/brno/kalendar"); await openDirectoryFilters(page);
  await page.getByLabel("Kategorie").last().selectOption("Zkouškové období");
  await expect(page.getByText(/\d+ ověřených událostí/)).toBeVisible();
  const fitEvent = page.getByRole("article").filter({ has: page.getByRole("heading", { name: /Zkouškové období zimního semestru FIT VUT/ }) }).last();
  await expect(fitEvent).toBeVisible();
  await expect(fitEvent.getByRole("link", { name: "Oficiální zdroj" })).toHaveAttribute("href", /^https:\/\//);
});

test("komunitní kalendář zveřejní, nahlásí a přes soukromý odkaz upraví i odstraní akci", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const title = `E2E komunitní akce ${Date.now()}`; const updatedTitle = `${title} upravena`;
  await page.goto("/brno/kalendar?view=community"); await expect(page.getByRole("tab", { name: "Co se děje" })).toHaveAttribute("aria-selected", "true"); await expect(page.getByText("Komunitní akce, StudentHub obsah neověřuje.").first()).toBeVisible();
  await page.getByRole("button", { name: "Přidat akci" }).click(); const dialog = page.getByRole("dialog", { name: "Přidat akci" }); await expect(dialog).toBeVisible();
  const localFuture = await page.evaluate(() => { const date = new Date(Date.now() + 2 * 86_400_000); const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return shifted.toISOString().slice(0, 16); });
  await dialog.getByLabel("Název *").fill(title); await dialog.getByLabel("Začátek *").fill(localFuture); await dialog.getByLabel("Veřejné místo *").fill("Veřejná knihovna v Brně"); await dialog.getByLabel("Popis *").fill("Veřejná studentská akce vytvořená koncovým regresním testem."); await dialog.getByLabel("E-mail autora *").fill("e2e@example.cz"); await dialog.getByText(/Potvrzuji, že uvádím pouze veřejné místo/).click(); await dialog.getByRole("button", { name: "Zveřejnit akci" }).click();
  await expect(dialog.getByRole("heading", { name: "Akce je zveřejněná" })).toBeVisible(); const manageUrl = await dialog.getByRole("link", { name: "Otevřít správu akce" }).getAttribute("href"); expect(manageUrl).toContain("/akce/sprava?id="); expect(manageUrl).toContain("#token="); await dialog.getByRole("button", { name: "Zavřít formulář" }).click();
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title }) }); await expect(card).toBeVisible(); await card.getByRole("button", { name: "Nahlásit" }).click(); await card.getByRole("button", { name: "Odeslat hlášení" }).click(); await expect(page.getByText("Děkujeme. Hlášení jsme přijali k posouzení.")).toBeVisible();
  await page.goto(manageUrl!); await expect(page.getByRole("heading", { name: "Správa komunitní akce" })).toBeVisible(); await expect(page).not.toHaveURL(/token=/); await page.getByLabel("Název").fill(updatedTitle); await page.getByRole("button", { name: "Uložit změny" }).click(); await expect(page.getByText("Akce byla upravena.")).toBeVisible(); page.once("dialog", (confirmation) => confirmation.accept()); await page.getByRole("button", { name: "Odstranit akci" }).click(); await expect(page.getByRole("heading", { name: "Akce byla odstraněna" })).toBeVisible();
});

test("filtruje místa a nabídky mají poctivý prázdný stav", async ({ page }) => { await page.goto("/brno/mista"); await openDirectoryFilters(page); await page.getByRole("region", { name: "Filtry míst" }).getByLabel("Kategorie").selectOption("Knihovna"); await expect(page.getByText("Ústřední knihovna VUT")).toBeVisible(); await expect(page.getByText("DEMO")).toHaveCount(0); await page.goto("/brno/nabidky?q=neexistujici-nabidka"); await expect(page.getByRole("heading", { name: "Žádná nabídka neodpovídá filtrům" })).toBeVisible(); await expect(page.getByText(/ISIC feed zůstává bez písemného souhlasu vypnutý/)).toBeVisible(); await page.getByRole("button", { name: "Resetovat filtry" }).first().click(); await expect(page.getByLabel("Hledat nabídku")).toHaveValue(""); });

test("migruje starou preferenci a resetuje ji na Brno", async ({ page }) => { await page.evaluate(() => { sessionStorage.setItem("studenthub-e2e-overlays", "manual"); localStorage.removeItem("studenthub-preference-v4"); localStorage.setItem("studenthub-preference-v1", JSON.stringify({ universityId: "muni", facultyId: "muni-fi", completed: true })); }); await page.reload(); await dismissOverlays(page); await expect(page.getByRole("heading", { name: "Přehled pro FI" })).toBeVisible(); const migrated = await page.evaluate(() => localStorage.getItem("studenthub-preference-v4")); expect(migrated).toContain('"version":4'); expect(migrated).toContain('"cityId":"brno"'); await page.goto("/nastaveni"); await page.getByRole("button", { name: "Resetovat město, školu a ročník" }).click(); await expect(page.getByRole("button", { name: "Výběr byl resetován" })).toBeVisible(); expect(await page.evaluate(() => localStorage.getItem("studenthub-preference-v4"))).toContain('"completed":false'); });

test("výběr fakulty funguje pro všech pět univerzit a kontext se mění bez reloadu", async ({ page }, testInfo) => {
  const samples = [["muni", "muni-fi", "MUNI · FI"], ["vut", "vut-fit", "VUT · FIT"], ["mendelu", "mendelu-pef", "MENDELU · PEF"], ["vetuni", "vetuni-fvl", "VETUNI · FVL"], ["jamu", "jamu-hf", "JAMU · HF"]] as const;
  for (const [university, faculty, context] of samples) {
    await page.goto("/nastaveni"); await page.getByLabel("Moje škola").selectOption(university); const facultySelect = page.getByLabel("Moje fakulta"); await expect(facultySelect.locator(`option[value="${faculty}"]`)).toHaveCount(1); await facultySelect.selectOption(faculty); await page.getByRole("button", { name: "Uložit výběr" }).click();
    if (testInfo.project.name !== "desktop-1440") await page.getByRole("button", { name: "Otevřít nabídku" }).click();
    await expect(page.getByTestId("selected-study-context")).toContainText(context);
    if (testInfo.project.name !== "desktop-1440") await page.getByRole("dialog", { name: "Mobilní nabídka" }).getByRole("button", { name: "Zavřít nabídku" }).click();
    await page.reload(); await dismissOverlays(page); expect(await page.evaluate(() => localStorage.getItem("studenthub-preference-v4"))).toContain(`"facultyId":"${faculty}"`);
    await page.goto(`/brno/kalendar?university=${university}&faculty=${faculty}`); await expect(page).toHaveURL(new RegExp(`university=${university}.*faculty=${faculty}`)); await expect(page.getByLabel("Fakulta", { exact: true }).last()).toHaveValue(faculty);
  }
  await page.getByRole("group", { name: "Barevný režim" }).getByRole("button", { name: "Tmavý režim" }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("kalendář opraví neplatnou kombinaci URL a neukáže jinou fakultu", async ({ page }) => { await page.goto("/brno/kalendar?university=muni&faculty=vut-fit"); await expect(page).toHaveURL(/university=muni/); await expect(page).not.toHaveURL(/faculty=vut-fit/); await expect(page.getByRole("heading", { name: /FIT VUT/ })).toHaveCount(0); await page.getByRole("button", { name: "Resetovat filtry" }).click(); await expect(page).toHaveURL(/\/brno\/kalendar$/); });

test("explicitní MUNI FI scope má přednost a dashboard nepropustí VUT", async ({ page }) => { await page.evaluate(() => localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fit", studyYear: 1, studyYearCycleStart: 2026, completed: true }))); await page.goto("/brno?university=muni&faculty=muni-fi"); await expect(page.getByRole("heading", { name: "Přehled pro FI" })).toBeVisible(); await expect(page.getByText(/FIT VUT|FSI VUT/)).toHaveCount(0); await expect(page.getByRole("heading", { name: "Začátek podzimního semestru 2026", exact: true }).first()).toBeVisible(); });

test("uložená preference MUNI FI filtruje KPI, termíny i místa bez URL parametrů", async ({ page }) => { await page.evaluate(() => localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "muni", facultyId: "muni-fi", studyYear: null, studyYearCycleStart: null, completed: true }))); await page.goto("/brno"); await expect(page.getByRole("heading", { name: "Přehled pro FI" })).toBeVisible(); await expect(page.getByText(/FIT VUT|FSI VUT/)).toHaveCount(0); await expect(page.getByText("Další zkouškové období")).toHaveCount(0); await expect(page.getByRole("heading", { name: "Menza Vinařská MUNI", exact: true })).toBeVisible(); await expect(page.getByRole("heading", { name: "Ústřední knihovna VUT", exact: true })).toHaveCount(0); });

test("každé otevření kalendáře obnoví Moji fakultu, dočasný filtr ji nepřepíše", async ({ page }, testInfo) => {
  await page.evaluate(() => localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 2, studyYearCycleStart: 2026, completed: true })));
  await page.goto("/brno/kalendar?university=muni&faculty=muni-fi"); await openDirectoryFilters(page);
  await expect(page.getByLabel("Fakulta", { exact: true }).last()).toHaveValue("muni-fi");
  await expect(page.getByLabel("Ročník", { exact: true }).last()).toHaveValue("");
  await page.getByRole("button", { name: "Moje nastavení" }).click();
  await expect(page).toHaveURL(/university=vut.*faculty=vut-fekt/);
  await expect(page).toHaveURL(/year=2/);
  await expect(page.getByLabel("Ročník", { exact: true }).last()).toHaveValue("2");
  await page.getByLabel("Univerzita").last().selectOption("muni");
  await page.getByLabel("Fakulta", { exact: true }).last().selectOption("muni-fi");
  await page.getByLabel("Ročník", { exact: true }).last().selectOption("3");
  const calendarLink = testInfo.project.name === "desktop-1440"
    ? page.getByRole("navigation", { name: "Hlavní navigace" }).getByRole("link", { name: "Kalendář" })
    : page.getByRole("navigation", { name: "Mobilní navigace" }).getByRole("link", { name: "Termíny" });
  await calendarLink.click();
  await expect(page).toHaveURL(/university=vut.*faculty=vut-fekt/);
  await expect(page).toHaveURL(/year=2/);
  await expect(page.getByLabel("Fakulta", { exact: true }).last()).toHaveValue("vut-fekt");
  await expect(page.getByLabel("Ročník", { exact: true }).last()).toHaveValue("2");
  expect(await page.evaluate(() => localStorage.getItem("studenthub-preference-v4"))).toContain('"facultyId":"vut-fekt"');
  expect(await page.evaluate(() => localStorage.getItem("studenthub-preference-v4"))).toContain('"studyYear":2');
});

test("filtr míst respektuje MUNI bez kampusového parametru", async ({ page }) => { await page.goto("/brno/mista?university=muni"); await expect(page.getByText("Knihovna univerzitního kampusu MUNI")).toBeVisible(); await expect(page.getByText("Ústřední knihovna VUT")).toHaveCount(0); await expect(page.getByLabel("Univerzita")).toHaveValue("muni"); await expect(page.getByText("Můj kampus")).toHaveCount(0); });

test("brigády mají bezpečný prázdný stav a nepřetékají", async ({ page }) => { await page.goto("/brno/brigady"); await expect(page.getByRole("heading", { name: "Brigády · Brno" })).toBeVisible(); await expect(page.getByRole("heading", { name: "Zatím nemáme ověřené brigády" })).toBeVisible(); await expect(page.getByRole("button", { name: "Navrhnout brigádu" })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1); });

test("exportuje český celodenní rozsah bez posunu data", async ({ page, request }) => {
  await page.goto("/brno/kalendar?university=vut&faculty=vut-fit");
  const card = page.locator("article.event-card").filter({ hasText: "Výuka v zimním semestru FIT VUT" }).last(); await expect(card).toBeVisible();
  const icsHref = await card.getByRole("link", { name: "Stáhnout .ics" }).getAttribute("href"); expect(icsHref).toBeTruthy();
  const response = await request.get(icsHref!); expect(response.status()).toBe(200); const body = await response.text();
  expect(body).toContain("DTSTART;VALUE=DATE:20260914"); expect(body).toContain("DTEND;VALUE=DATE:20261212");
  const googleHref = await card.getByRole("link", { name: "Google Calendar" }).getAttribute("href"); expect(new URL(googleHref!).searchParams.get("dates")).toBe("20260914/20261212");
  const bulk = await request.get("/api/calendar/all.ics?city=brno&university=vut&faculty=vut-fit&q=Výuka"); expect(bulk.status()).toBe(200); const bulkBody = await bulk.text(); expect(bulkBody).toContain("DTSTART;VALUE=DATE:20260914"); expect(bulkBody).toContain("DTEND;VALUE=DATE:20261212"); expect(bulkBody).not.toContain("Zkouškové období zimního semestru FIT VUT");
});

test("formulář spolku odešle přesný scope VUT + FEKT", async ({ page }, testInfo) => { test.skip(testInfo.project.name !== "desktop-1440"); let payload: Record<string, unknown> | undefined; await page.route("**/api/submissions", async (route) => { payload = route.request().postDataJSON(); await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ message: "Návrh byl uložen." }) }); }); await page.goto("/navrhnout-obsah"); await page.getByLabel("Název spolku / týmu *").fill("FEKT studentský tým"); await page.getByLabel("Univerzita *").selectOption("vut"); await page.getByLabel("Fakulta", { exact: true }).selectOption("vut-fekt"); await page.getByLabel("Kontaktní e-mail *").fill("spolek@example.cz"); await page.getByLabel("Název obsahu *").fill("Veřejná technická přednáška"); await page.getByLabel("Popis a důvod zveřejnění *").fill("Veřejná studentská přednáška s ověřitelným programem a kontaktem na pořadatele."); await page.getByText(/Potvrzuji, že mohu obsah zaslat/).click(); await page.getByRole("button", { name: "Odeslat ke schválení" }).click(); await expect(page.getByRole("heading", { name: "Návrh čeká na schválení" })).toBeVisible(); expect(payload).toMatchObject({ universityId: "vut", facultyId: "vut-fekt" }); });

test("všechny veřejné formuláře odmítnou nevalidní data na serveru", async ({ request }, testInfo) => { test.skip(testInfo.project.name !== "desktop-1440"); for (const endpoint of ["/api/service-requests", "/api/jobs", "/api/submissions", "/api/contact"]) { const response = await request.post(endpoint, { data: { company: "spam" } }); expect(response.status(), endpoint).toBe(422); } const event = await request.post("/api/community-events", { multipart: { company: "spam" } }); expect(event.status()).toBe(422); });

test("kontaktní formulář odešle validní data bez hesla a nevytvoří testovací záznam", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/contact", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ message: "Děkujeme. Zpráva byla odeslána týmu StudentHub Brno." }) });
  });
  await page.goto("/kontakt");
  await page.getByRole("button", { name: "Odeslat zprávu" }).click();
  await expect(page.getByText("Uveďte své jméno.")).toBeVisible();
  await page.getByLabel("Jméno *").fill("Testovací student");
  await page.getByLabel("E-mail *").fill("student@example.cz");
  await page.getByLabel("Předmět *").fill("Oprava údajů");
  await page.getByLabel("Zpráva *").fill("Prosím ověřte otevírací dobu jednoho z uvedených míst v Brně.");
  await page.getByRole("button", { name: "Odeslat zprávu" }).click();
  await expect(page.getByRole("heading", { name: "Zpráva odeslána" })).toBeVisible();
  expect(payload).toEqual({ name: "Testovací student", email: "student@example.cz", subject: "Oprava údajů", message: "Prosím ověřte otevírací dobu jednoho z uvedených míst v Brně.", company: "", cityId: "brno" });
  expect(JSON.stringify(payload)).not.toMatch(/password|heslo/i);
});

test("honeypot formuláře není viditelný ani dostupný čtečce", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/pomoc");
  const honeypot = page.locator("label.honeypot");
  await expect(honeypot).toHaveCount(1);
  await expect(honeypot).toBeHidden();
  await expect(honeypot).toHaveAttribute("aria-hidden", "true");
  await expect(honeypot.locator("input")).toHaveAttribute("tabindex", "-1");
  expect(await honeypot.evaluate((element) => getComputedStyle(element).display)).toBe("none");
});

test("staré URL přesměrují a školní stránky uvádějí nezávislost", async ({ page }) => { await page.goto("/kalendar"); await expect(page).toHaveURL(/\/brno\/kalendar$/); for (const school of ["muni", "vut", "mendelu"]) { await page.goto(`/${school}`); await expect(page).toHaveURL(new RegExp(`/brno/skoly/${school}$`)); await expect(page.getByText(/Nezávislý projekt:/)).toBeVisible(); await expect(page.getByText(/nenahrazuje školní informační systém/)).toBeVisible(); } });

test("validuje a uloží poptávku technické pomoci", async ({ page }, testInfo) => { test.skip(testInfo.project.name !== "desktop-1440"); await page.goto("/pomoc"); await page.getByRole("button", { name: "Odeslat poptávku" }).click(); await expect(page.getByText("Uveďte prosím jméno.")).toBeVisible(); const form = page.getByTestId("service-request-form"); await form.getByLabel("Veřejný název žádosti *").fill("Pomoc s vypínáním notebooku"); await form.getByLabel("Jméno *").fill("Testovací Student"); await form.locator('input[name="email"]').fill("student@example.cz"); await form.getByLabel("Popis problému *").fill("Notebook se při startu vypíná a potřebuji bezpečně zkontrolovat hardware."); await form.getByLabel("Přibližná lokalita *").fill("Brno-střed"); await form.getByLabel("Preferovaný termín *").fill("2026-08-10"); await form.getByText(/Souhlasím se zpracováním uvedených údajů/).click(); await form.getByText(/Souhlasím, aby se po schválení zobrazil název/).click(); await form.getByRole("button", { name: "Odeslat poptávku" }).click(); await expect(page.getByTestId("request-success")).toBeVisible(); });

test("chrání administraci bez přihlášení", async ({ page }) => { await page.goto("/admin"); await expect(page).toHaveURL(/\/admin\/prihlaseni/); await expect(page.getByRole("heading", { name: "Administrace" })).toBeVisible(); await expect(page.locator('input[name="email"]')).toHaveValue(""); });

test("přihlášení se po výpadku odblokuje a obnova účtu nic neprozradí", async ({ page }, testInfo) => { test.skip(testInfo.project.name !== "desktop-1440"); await page.goto("/admin/prihlaseni"); await page.route("**/api/admin/login", (route) => route.abort("failed")); await page.getByLabel("E-mail").fill("audit@example.cz"); await page.getByLabel("Heslo").fill("local-test-password-2026"); await page.getByRole("button", { name: "Přihlásit se" }).click(); await expect(page.getByText("Síťové připojení selhalo. Zkuste to prosím znovu.")).toBeVisible(); await expect(page.getByRole("button", { name: "Přihlásit se" })).toBeEnabled(); await page.unroute("**/api/admin/login"); await page.getByRole("button", { name: "Zapomenuté heslo?" }).click(); await page.getByLabel("E-mail").fill("neznamy@example.cz"); await page.getByRole("button", { name: "Poslat obnovovací odkaz" }).click(); await expect(page.getByRole("status")).toContainText(/Pokud účet existuje/); });

test("cookie souhlas je opt-in a lze jej změnit", async ({ page }) => { await page.evaluate(() => { sessionStorage.setItem("studenthub-e2e-overlays", "manual"); localStorage.clear(); }); await page.reload(); const dialog = page.getByTestId("cookie-consent"); await expect(dialog).toBeVisible(); await dialog.getByRole("button", { name: "Odmítnout volitelné" }).click(); expect(await page.evaluate(() => localStorage.getItem("studenthub-consent"))).toContain('"analytics":false'); const picker = page.getByTestId("first-run-picker"); await expect(picker).toBeVisible(); await picker.getByRole("button", { name: "Pokračovat vědomě bez výběru školy pro celé město Brno" }).click(); await page.getByRole("button", { name: "Nastavení cookies" }).click(); await expect(page.getByText("Analytické")).toBeVisible(); });

test("cookies, onboarding a verzovaný návod se zobrazí postupně po jediném modálu", async ({ page }) => { await page.evaluate(() => { sessionStorage.setItem("studenthub-e2e-overlays", "manual"); localStorage.clear(); }); await page.reload(); const modals = page.locator('[role="dialog"][aria-modal="true"]'); await expect(modals).toHaveCount(1); await expect(page.getByTestId("cookie-consent")).toBeVisible(); await expect(page.getByRole("button", { name: "Přijmout vše" })).toBeFocused(); expect(await page.evaluate(() => document.querySelector(".app-shell")?.hasAttribute("inert"))).toBe(true); await page.keyboard.press("Escape"); const picker = page.getByTestId("first-run-picker"); await expect(picker).toBeVisible(); await expect(modals).toHaveCount(1); await expect(picker.getByLabel("Moje město")).toBeFocused(); await page.keyboard.press("Escape"); await expect(picker).toBeVisible(); await expect(modals).toHaveCount(1); await picker.getByRole("button", { name: "Pokračovat vědomě bez výběru školy pro celé město Brno" }).click(); await expect(page.getByText("Vítejte ve StudentHubu")).toBeVisible(); await expect(modals).toHaveCount(1); await page.getByRole("button", { name: "Rozumím" }).click(); await expect(modals).toHaveCount(0); expect(await page.evaluate(() => localStorage.getItem("studenthub-tutorial-version"))).toBe("community-calendar-v1"); });

test("existující uživatel dostane jednorázový krátký návod a může jej otevřít z menu", async ({ page }, testInfo) => { test.skip(testInfo.project.name !== "desktop-1440"); await page.evaluate(() => { sessionStorage.setItem("studenthub-e2e-overlays", "manual"); localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false })); localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "muni", facultyId: "muni-fi", studyYear: 2, studyYearCycleStart: 2026, completed: true })); localStorage.removeItem("studenthub-tutorial-version"); }); await page.reload(); await expect(page.getByText("Novinka v kalendáři")).toBeVisible(); await expect(page.getByText("Vítejte ve StudentHubu")).toHaveCount(0); await page.getByRole("button", { name: "Rozumím" }).click(); await page.getByRole("navigation", { name: "Doplňkové odkazy" }).getByRole("button", { name: "Návod" }).click(); await expect(page.getByRole("dialog", { name: "Školní termíny a akce jsou oddělené" })).toBeVisible(); await page.getByRole("button", { name: "Zavřít návod" }).click(); });

test("modal brigády a mobilní menu drží focus, inert a historii", async ({ page }, testInfo) => { await page.goto("/brno/brigady"); const proposal = page.getByRole("button", { name: "Navrhnout brigádu" }); await proposal.click(); await expect(page.getByRole("dialog", { name: "Navrhnout brigádu" })).toBeVisible(); await expect(page.getByRole("button", { name: "Zavřít formulář" })).toBeFocused(); await page.keyboard.press("Escape"); await expect(proposal).toBeFocused(); if (testInfo.project.name !== "desktop-1440") { const menu = page.getByRole("button", { name: "Otevřít nabídku" }); await menu.click(); const menuDialog = page.getByRole("dialog", { name: "Mobilní nabídka" }); await expect(menuDialog).toBeVisible(); await expect(menuDialog.getByRole("button", { name: "Zavřít nabídku" })).toBeFocused(); expect(await page.evaluate(() => document.querySelector(".app-shell")?.hasAttribute("inert"))).toBe(true); await page.keyboard.press("Escape"); await expect(menu).toBeFocused(); await menu.click(); await menuDialog.getByRole("link", { name: "O projektu" }).click(); await expect(page).toHaveURL(/\/o-projektu$/); await expect(menuDialog).toHaveCount(0); await page.goBack(); await expect(page).toHaveURL(/\/brno\/brigady$/); await expect(page.getByRole("dialog", { name: "Mobilní nabídka" })).toHaveCount(0); } });

test("motiv podporuje systém, světlo a tmu s perzistencí", async ({ page }) => { const group = page.getByRole("group", { name: "Barevný režim" }); await group.getByRole("button", { name: "Tmavý režim" }).click(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); await page.reload(); await dismissOverlays(page); await expect(group.getByRole("button", { name: "Tmavý režim" })).toHaveAttribute("aria-pressed", "true"); await group.getByRole("button", { name: "Podle zařízení" }).click(); expect(await page.evaluate(() => localStorage.getItem("studenthub-theme"))).toBe("system"); });

test("navigace a layout nepřetékají na všech breakpointech", async ({ page }, testInfo) => { const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(overflow).toBeLessThanOrEqual(1); if (testInfo.project.name === "desktop-1440") await expect(page.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible(); else { const navigation = page.getByRole("navigation", { name: "Mobilní navigace" }); await expect(navigation).toBeVisible(); await navigation.getByRole("link", { name: "Místa", exact: true }).click(); await expect(page).toHaveURL(/\/brno\/mista/); const install = page.locator("#hlavni-obsah").getByRole("button", { name: "Nainstalovat aplikaci" }); await expect(install).toBeVisible(); const fit = await install.evaluate((element) => ({ textOverflow: element.scrollWidth - element.clientWidth, right: element.getBoundingClientRect().right, viewport: document.documentElement.clientWidth })); expect(fit.textOverflow).toBeLessThanOrEqual(1); expect(fit.right).toBeLessThanOrEqual(fit.viewport + 1); } });

test("přihlášená administrace používá hluboké odkazy, historii, stejná data a nepřetéká", async ({ page }, testInfo) => { await page.goto("/admin/prihlaseni"); await page.getByLabel("E-mail").fill("audit@example.cz"); await page.getByLabel("Heslo").fill("local-test-password-2026"); await page.getByRole("button", { name: "Přihlásit se" }).click(); await page.waitForURL("**/admin"); await expect(page.getByText("Lokální ověřený fallback.")).toBeVisible(); await expect(page.getByText("28 zdrojů")).toBeVisible(); if (testInfo.project.name === "desktop-1440") await page.getByRole("navigation", { name: "Sekce administrace" }).getByRole("link", { name: "Návštěvnost" }).click(); else await page.getByLabel("Aktivní sekce").selectOption("analytics"); await expect(page).toHaveURL(/section=analytics/); await expect(page.getByRole("heading", { name: "Návštěvnost se souhlasem", exact: true })).toBeVisible(); if (testInfo.project.name === "desktop-1440") await page.getByRole("navigation", { name: "Sekce administrace" }).getByRole("link", { name: "Kontaktní zprávy" }).click(); else await page.getByLabel("Aktivní sekce").selectOption("contact_messages"); await expect(page.getByRole("heading", { name: "Kontaktní zprávy", exact: true })).toBeVisible(); await page.goBack(); await expect(page).toHaveURL(/section=analytics/); await expect(page.getByRole("heading", { name: "Návštěvnost se souhlasem", exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1); await page.screenshot({ path: `artifacts/admin-${testInfo.project.name}.png`, fullPage: true }); await page.getByRole("button", { name: "Odhlásit" }).click(); await expect(page).toHaveURL(/\/admin\/prihlaseni/); });

test("veřejný dashboard nemá interní síťové ani konzolové chyby a uloží auditní screenshot", async ({ page }, testInfo) => { const consoleErrors: string[] = []; const failedInternal: string[] = []; page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); }); page.on("requestfailed", (request) => { const reason = request.failure()?.errorText || "neznámá chyba"; if (request.url().startsWith(page.url().split("/brno")[0]) && reason !== "net::ERR_ABORTED") failedInternal.push(`${request.method()} ${request.url()} · ${reason}`); }); await page.goto("/brno"); await page.getByRole("heading", { name: /StudentHub Brno|Přehled pro/ }).waitFor(); expect(consoleErrors).toEqual([]); expect(failedInternal).toEqual([]); await page.screenshot({ path: `artifacts/audit-${testInfo.project.name}.png`, fullPage: true }); });

test("neaktivní nebo neznámé město není veřejné", async ({ page }) => { const response = await page.goto("/praha"); expect(response?.status()).toBe(404); await expect(page.getByRole("heading", { name: "Tady nic není" })).toBeVisible(); });

test("PWA manifest, ikony a service worker jsou dostupné a necachují dynamické HTML", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const manifestResponse = await request.get("/manifest.webmanifest"); expect(manifestResponse.status()).toBe(200); expect(manifestResponse.headers()["content-type"]).toContain("manifest+json");
  const manifest = await manifestResponse.json(); expect(manifest).toMatchObject({ name: "StudentHub Brno", short_name: "StudentHub", start_url: "/brno", scope: "/", display: "standalone" }); expect(manifest.icons.filter((icon: { purpose?: string }) => icon.purpose === "maskable")).toHaveLength(2);
  for (const icon of manifest.icons) { const response = await request.get(icon.src); expect(response.status(), icon.src).toBe(200); expect(response.headers()["content-type"]).toContain("image/png"); }
  const workerResponse = await request.get("/sw.js"); expect(workerResponse.status()).toBe(200); expect(workerResponse.headers()["cache-control"]).toMatch(/no-cache|no-store/);
  await page.goto("/brno");
  await page.waitForFunction(() => navigator.serviceWorker?.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cacheAudit = await page.evaluate(async () => ({ keys: await caches.keys(), dynamic: Boolean(await caches.match("/brno")), admin: Boolean(await caches.match("/admin")), api: Boolean(await caches.match("/api/service-requests")) }));
  expect(cacheAudit.keys).toEqual(["studenthub-static-v3"]); expect(cacheAudit.dynamic).toBe(false); expect(cacheAudit.admin).toBe(false); expect(cacheAudit.api).toBe(false);
});

test("instalační nabídka zavře mobilní menu, drží focus a je nad mapou", async ({ page }, testInfo) => {
  await page.goto("/brno/mista");
  await page.evaluate(() => {
    Object.assign(window, { __studenthubPromptCalls: 0 });
    const event = new Event("beforeinstallprompt");
    Object.defineProperties(event, {
      prompt: { value: async () => { (window as typeof window & { __studenthubPromptCalls: number }).__studenthubPromptCalls += 1; } },
      userChoice: { value: Promise.resolve({ outcome: "dismissed", platform: "web" }) },
    });
    window.dispatchEvent(event);
  });
  if (testInfo.project.name === "desktop-1440") await page.locator("#hlavni-obsah").getByRole("button", { name: "Nainstalovat aplikaci" }).click();
  else { await page.getByRole("button", { name: "Otevřít nabídku" }).click(); await page.getByRole("dialog", { name: "Mobilní nabídka" }).getByRole("button", { name: "Nainstalovat aplikaci" }).click(); }
  expect(await page.evaluate(() => (window as typeof window & { __studenthubPromptCalls: number }).__studenthubPromptCalls)).toBe(1);
  const dialog = page.getByRole("dialog", { name: /Nainstalovat StudentHub/ }); await expect(dialog).toBeVisible(); await expect(page.locator('[aria-modal="true"]')).toHaveCount(1); await expect(dialog.getByRole("button", { name: "Zavřít instalační návod" })).toBeFocused();
  expect(await page.evaluate(() => document.querySelector(".app-shell")?.hasAttribute("inert"))).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  if (testInfo.project.name !== "desktop-1440") await expect(page.getByRole("button", { name: "Otevřít nabídku" })).toBeFocused();
});

test("iOS a iPadOS dostanou návod Sdílet a Přidat na plochu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
    Object.defineProperty(navigator, "platform", { configurable: true, get: () => "iPhone" });
  });
  await page.reload(); await dismissOverlays(page); await page.getByRole("button", { name: "Otevřít nabídku" }).click(); await page.getByRole("dialog", { name: "Mobilní nabídka" }).getByRole("button", { name: "Nainstalovat aplikaci" }).click();
  const dialog = page.getByRole("dialog", { name: "Nainstalovat StudentHub na iPhone nebo iPad" }); await expect(dialog).toBeVisible(); await expect(dialog.getByText("Otevři Sdílet a vyber Přidat na plochu.")).toBeVisible(); await page.keyboard.press("Escape");
});

test("v nainstalovaném režimu je instalační položka neaktivní", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => query === "(display-mode: standalone)" ? ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true } as MediaQueryList) : original(query);
  });
  await page.reload(); await dismissOverlays(page); const installed = page.getByRole("button", { name: "Aplikace je nainstalovaná" }); await expect(installed).toBeDisabled();
});

test("offline navigace zobrazí jen bezpečnou offline stránku", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/brno"); await page.waitForFunction(() => navigator.serviceWorker?.ready); await page.reload(); await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try { await page.goto("/brno?offline-audit=1", { waitUntil: "domcontentloaded" }); await expect(page.getByRole("heading", { name: "Teď jste offline" })).toBeVisible(); }
  finally { await context.setOffline(false); }
});
