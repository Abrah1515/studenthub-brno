import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { legalDocuments, minimumUserAge, operator } from "@/lib/legal";

const legalFiles = ["app/soukromi/page.tsx", "app/cookies/page.tsx", "app/podminky/page.tsx"];

describe("veřejné právní dokumenty", () => {
  it("používají jednotného provozovatele, věk a statickou verzi", () => {
    expect(operator).toEqual({ name: "Adam Abrahámek", status: "fyzická osoba nepodnikající", email: "studenthubbrno@gmail.com" });
    expect(minimumUserAge).toBe(15);
    expect(Object.values(legalDocuments).every((document) => document.version === "1.0" && document.effectiveDate === "12. září 2026" && document.updatedDate === "12. září 2026")).toBe(true);
  });

  it("neobsahují redakční instrukce, placeholdery ani localhost", async () => {
    const source = (await Promise.all(legalFiles.map((file) => readFile(file, "utf8")))).join("\n");
    expect(source).not.toMatch(/Pracovní verze|\[DOPLNIT|\[OVĚŘIT|Před zveřejněním doplnit|localhost/i);
  });

  it("neuvádí u provozovatele neexistující firemní identifikátory ani adresu", async () => {
    const privacy = await readFile("app/soukromi/page.tsx", "utf8");
    const operatorSection = privacy.slice(privacy.indexOf('<section id="spravce">'), privacy.indexOf('<section id="pusobnost">'));
    expect(operatorSection).not.toMatch(/IČO|datov[aá] schránka|DPO|pověřenec|sídlo|poštovní adresa/i);
    expect(operator.status).toBe("fyzická osoba nepodnikající");
  });

  it("obsahují všechny kapitoly dodaných dokumentů", async () => {
    const [privacy, cookies, terms] = await Promise.all(legalFiles.map((file) => readFile(file, "utf8")));
    expect((privacy.match(/<section id=/g) || [])).toHaveLength(17);
    expect((cookies.match(/<section id=/g) || [])).toHaveLength(13);
    expect((terms.match(/<section id=/g) || [])).toHaveLength(22);
  });

  it("popisují skutečné technické úložiště a opt-in analytiku", async () => {
    const cookies = await readFile("app/cookies/page.tsx", "utf8");
    for (const key of ["sh_installation", "sh_help_owner", "sh_password_recovery", "studenthub-consent", "studenthub-theme", "studenthub-preference-v4", "studenthub-tutorial-state", "studenthub-static-v8"]) expect(cookies).toContain(key);
    expect(cookies).toContain("sh_analytics_consent");
    expect(cookies).toContain("po vašem souhlasu");
  });

  it("odkazuje z účtů, profilu, formulářů a cookie dialogu", async () => {
    const sources = await Promise.all(["components/site-shell.tsx", "components/city-selector-page.tsx", "components/user-login-form.tsx", "components/admin-login-form.tsx", "components/password-recovery-form.tsx", "components/account-profile-panel.tsx", "components/cookie-consent.tsx", "components/marketplace-listing-form.tsx", "components/housing-listing-form.tsx", "components/contact-form.tsx", "components/community-events-explorer.tsx", "components/community-feed.tsx", "components/place-suggestion-dialog.tsx", "components/place-experiences.tsx", "components/job-explorer.tsx", "components/buddy-explorer.tsx"].map((file) => readFile(file, "utf8")));
    expect(sources.every((source) => /LegalLinks|LegalNotice/.test(source))).toBe(true);
  });

  it("zajišťuje kaskádové odstranění uživatelských návrhů míst a bydlení", async () => {
    const [migration, route] = await Promise.all([readFile("supabase/migrations/202609120038_account_deletion_cascade.sql", "utf8"), readFile("app/api/account/delete/route.ts", "utf8")]);
    expect(migration.match(/on delete cascade/g)?.length).toBeGreaterThanOrEqual(5);
    expect(route).toContain("removeHousingPhotos");
    expect(route).toContain("removePlacePhotos");
  });
});
