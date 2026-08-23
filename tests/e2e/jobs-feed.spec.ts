import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const createdIds: string[] = [];
const storePath = path.join(process.cwd(), ".data", "e2e-test-store.json");
async function readStore() { try { return JSON.parse(await readFile(storePath, "utf8")) as { jobs: Array<Record<string, unknown>> }; } catch { return { jobs: [] }; } }

async function dismissOverlays(page: Page) {
  const consent = page.getByTestId("cookie-consent"); if (await consent.isVisible()) await consent.getByRole("button", { name: "Odmítnout volitelné" }).click();
  const picker = page.getByTestId("first-run-picker"); if (await picker.isVisible()) await picker.getByRole("button", { name: /Pokračovat vědomě/ }).click();
}

test.beforeAll(async () => {
  const store = await readStore();
  const common = { provider_key: "fajn-brigady", city_id: "brno", work_type: "Brigáda", work_location_mode: "onsite", location: "Brno", status: "approved", verification_status: "verified", is_featured: false, is_demo: false, last_verified_at: "2026-08-23T10:00:00.000Z", created_at: "2026-08-23T10:00:00.000Z" };
  const jobs = [
    { ...common, id: randomUUID(), external_id: "990001", title: "E2E technická podpora", company_name: "Testovací tým", field: "IT", reward_min: 220, reward_max: 250, reward_currency: "CZK", reward_period: "hour", workload: "Zkrácený úvazek", description: "Bezpečně připravený integrační záznam s delším popisem pro kontrolu karty a detailu nabídky.", apply_url: "https://www.fajn-brigady.cz/brigady/brno/990001-e2e/", source_url: "https://www.fajn-brigady.cz/brigady/brno/990001-e2e/", position_label: "Programátor, webmaster, kodér", positions_count: 2, benefit_codes: ["3"], suitability_codes: ["3"], minimum_education_external_id: "3" },
    { ...common, id: randomUUID(), external_id: "990002", title: "E2E pomoc v kuchyni", company_name: "Testovací provoz", field: "Gastro", workload: "Plný úvazek", description: "Připravený záznam bez uvedené odměny.", apply_url: "https://www.fajn-brigady.cz/brigady/brno/990002-e2e/", source_url: "https://www.fajn-brigady.cz/brigady/brno/990002-e2e/", benefit_codes: [], suitability_codes: [] },
    { ...common, id: randomUUID(), external_id: "990003", title: "E2E administrativní výpomoc", field: "Administrativa", reward_min: 30000, reward_currency: "CZK", reward_period: "month", workload: "Neuvedeno", description: "Připravený záznam s měsíční odměnou.", apply_url: "https://www.fajn-brigady.cz/brigady/brno/990003-e2e/", source_url: "https://www.fajn-brigady.cz/brigady/brno/990003-e2e/", benefit_codes: [], suitability_codes: [] },
  ];
  createdIds.push(...jobs.map((row) => String(row.id))); store.jobs.push(...jobs);
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
});

test.afterAll(async () => {
  const store = await readStore();
  store.jobs = store.jobs.filter((row) => !createdIds.includes(String(row.id))); createdIds.splice(0);
  await writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
  await page.goto("/brno/brigady"); await dismissOverlays(page);
});

test("vykreslí bezpečné karty feedu a přesné odchozí CTA bez overflow", async ({ page }) => {
  await expect(page.locator('[data-job-provider="fajn-brigady"]')).toHaveCount(3);
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "E2E technická podpora" }) });
  await expect(card.getByText("Fajn-brigády.cz")).toBeVisible(); await expect(card.getByText("Práce z domova")).toBeVisible(); await expect(card.getByText("2").last()).toBeVisible();
  const cta = card.getByRole("link", { name: "Zobrazit nabídku a odpovědět" }); await expect(cta).toHaveAttribute("target", "_blank"); await expect(cta).toHaveAttribute("href", /^https:\/\/www\.fajn-brigady\.cz\//);
  await expect(page.locator("body")).not.toContainText(/testovací XML|vzor_detail\.xml/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("filtruje vyhledávání, obor, rozsah a pouze hodinovou minimální odměnu", async ({ page }) => {
  const filterButton = page.getByRole("button", { name: /^Filtry/ }); if (await filterButton.isVisible()) await filterButton.click();
  await page.getByPlaceholder("Pozice, firma, lokalita…").fill("kuchyni"); await expect(page.locator('[data-job-provider="fajn-brigady"]')).toHaveCount(1); await page.getByPlaceholder("Pozice, firma, lokalita…").fill("");
  await page.getByLabel("Obor").selectOption("IT"); await expect(page.locator('[data-job-provider="fajn-brigady"]')).toHaveCount(1); await page.getByLabel("Obor").selectOption("Všechny");
  await page.getByLabel("Rozsah práce").selectOption("Plný úvazek"); await expect(page.locator('[data-job-provider="fajn-brigady"]')).toHaveCount(1); await page.getByLabel("Rozsah práce").selectOption("Všechny");
  await page.getByLabel("Minimální hodinová odměna").fill("230"); await expect(page.getByRole("heading", { name: "E2E technická podpora" })).toHaveCount(0); await expect(page.locator('[data-job-provider="fajn-brigady"]')).toHaveCount(2);
  await page.getByRole("checkbox", { name: /bez srovnatelné hodinové sazby/ }).uncheck(); await expect(page.locator('[data-job-provider="fajn-brigady"]')).toHaveCount(0);
});

test("administrace ukáže bezpečný stav konektoru bez neveřejné URL", async ({ page }) => {
  await page.goto("/admin/prihlaseni"); await page.getByLabel("E-mail").fill("e2e-admin@studenthub.local"); await page.getByLabel("Heslo").fill("local-test-password-2026"); await page.getByRole("button", { name: "Přihlásit se" }).click(); await page.waitForURL(/\/admin(?:\?|$)/);
  await page.goto("/admin?section=content_sources"); await expect(page.getByRole("heading", { name: "Pokrytí datových zdrojů" })).toBeVisible(); await expect(page.getByText("Čeká na ostrý XML feed.").last()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/vzor_detail\.xml|production-secret\.xml/i); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
