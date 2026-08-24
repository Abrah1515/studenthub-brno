import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
});

test("účet není nutný k prohlížení a veřejný adresář neodhaluje soukromé údaje", async ({ page, request }) => {
  await page.goto("/profily");
  await expect(page.getByRole("heading", { name: "Studentské profily" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Žádný odpovídající veřejný profil" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect((await request.get("/api/profiles")).status()).toBe(200);
  expect(JSON.stringify(await (await request.get("/api/profiles")).json())).not.toMatch(/email|phone|role|suspension_reason/i);
});

test("nastavení nabízí jen dokončený e-mailový účet s heslem a obnovou", async ({ page }) => {
  await page.goto("/nastaveni");
  await expect(page.getByRole("heading", { name: "Moje škola a profil" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Můj profil" })).toBeVisible();
  await expect(page.locator(".auth-card").getByRole("button", { name: "Přihlásit se e-mailem" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /Google/i })).toHaveCount(0);
  await expect(page.getByText(/Google přihlášení/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Vytvořit účet e-mailem" }).click();
  await expect(page.getByLabel("Heslo")).toHaveAttribute("autocomplete", "new-password");
  await page.getByRole("button", { name: "Zapomenuté heslo?" }).click();
  await expect(page.getByRole("heading", { name: "Obnovit heslo" })).toBeVisible();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
});

test("dokončený profil zobrazuje jen vlastní bezpečné ovládání a drží layout", async ({ page }) => {
  await page.route("**/api/profile", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profile: { email: "owner@example.cz", username: "audit_student", displayName: "Audit Student", accountStatus: "active", cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyProgram: "Elektrotechnika", studyYear: 2, bio: "Student v Brně", interests: ["technika"], avatarUrl: null, profileVisibility: "public", showFaculty: true, showStudyProgram: true, showStudyYear: true, communityRulesAccepted: true, complete: true } }) }));
  await page.goto("/nastaveni#profil");
  await expect(page.getByText("owner@example.cz")).toBeVisible();
  await expect(page.getByLabel("Uživatelské jméno *")).toHaveValue("audit_student");
  await expect(page.getByRole("link", { name: "Zobrazit veřejný profil" })).toHaveAttribute("href", "/profil/audit_student");
  await expect(page.getByText(/service.role|SUPABASE_SERVICE_ROLE_KEY/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("auth endpointy validují vstup a starý jednorázový obsahový OTP je vypnutý", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  expect((await request.post("/api/auth/signup", { data: { email: "neni-email", password: "kratke" } })).status()).toBe(422);
  expect((await request.post("/api/auth/password", { data: { email: "neni-email", password: "kratke" } })).status()).toBe(422);
  expect((await request.post("/api/auth/google", { data: { next: "/nastaveni" } })).status()).toBe(404);
  expect((await request.post("/api/auth/otp", { data: { email: "legacy@example.cz" } })).status()).toBe(410);
});
