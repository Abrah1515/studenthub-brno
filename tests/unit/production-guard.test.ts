import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { productionConfigurationErrors } from "@/lib/runtime-config";

const publicFiles = ["app/page.tsx", "app/kalendar/page.tsx", "app/mista/page.tsx", "app/nabidky/page.tsx", "app/brigady/page.tsx", "components/site-shell.tsx", "components/event-explorer.tsx", "components/places-explorer.tsx", "components/offers-explorer.tsx", "components/job-explorer.tsx"];
describe("produkční ochrana proti falešnému obsahu", () => {
  it("veřejné UI neodkazuje na demo kolekce ani zástupné domény", async () => { const source = (await Promise.all(publicFiles.map((file) => readFile(file, "utf8")))).join("\n"); expect(source).not.toMatch(/demo-data|DEMO DATA|ukázkový termín|example\.com/i); });
  it("produkční fallback musí být výslovně povolen", async () => { const source = await readFile("lib/public-data.ts", "utf8"); expect(source).toContain('ALLOW_VERIFIED_FALLBACK === "true"'); const store = await readFile("lib/data-store.ts", "utf8"); expect(store).toContain('DEMO_MODE === "true" && process.env.ALLOW_LOCAL_FILE_STORE === "true"'); });
  it("nejistý nebo neúplný běh nikdy sám nezruší dříve publikované termíny", async () => {
    const [sync, policy] = await Promise.all([readFile("lib/sources/sync.ts", "utf8"), readFile("lib/sources/publish-policy.ts", "utf8")]);
    expect(sync).toContain("sourceRunMayArchive(source.monitoringMode");
    expect(policy).toContain("!values.blocked");
    expect(policy).toContain("values.reviewCount === 0");
    expect(policy).toContain("values.warningCount === 0");
  });
  it("produkční start odmítne fallback a chybějící Supabase tajemství", () => { const errors = productionConfigurationErrors({ APP_ENV: "production", DEMO_MODE: "true", ALLOW_LOCAL_FILE_STORE: "true", ALLOW_VERIFIED_FALLBACK: "true" }); expect(errors).toEqual(expect.arrayContaining([expect.stringContaining("NEXT_PUBLIC_SUPABASE_URL"), expect.stringContaining("NEXT_PUBLIC_SUPABASE_ANON_KEY"), expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"), expect.stringContaining("CRON_SECRET"), expect.stringContaining("ADMIN_COOKIE_SECRET"), expect.stringContaining("RATE_LIMIT_SALT"), expect.stringContaining("DEMO_MODE=true"), expect.stringContaining("ALLOW_LOCAL_FILE_STORE=true"), expect.stringContaining("ALLOW_VERIFIED_FALLBACK=true")])); });
  it("platná produkční konfigurace projde", () => { expect(productionConfigurationErrors({ APP_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", CRON_SECRET: "cron", ADMIN_COOKIE_SECRET: "cookie", RATE_LIMIT_SALT: "salt", DEMO_MODE: "false", ALLOW_LOCAL_FILE_STORE: "false", ALLOW_VERIFIED_FALLBACK: "false" })).toEqual([]); });
  it("administrátorská session porovnává Auth metadata s RLS profilem", async () => { const source = await readFile("lib/admin-auth.ts", "utf8"); expect(source).toContain('.from("profiles")'); expect(source).toContain("profile.role !== claimedRole"); expect(source).toContain("profile.city_id"); expect(source).toContain("profile.faculty_id"); });
  it("HTTPS CSP se nevynucuje na lokálním produkčním buildu", async () => { const source = await readFile("next.config.ts", "utf8"); expect(source).toContain('process.env.APP_ENV === "production" || process.env.VERCEL_ENV === "production"'); expect(source).toContain('enforceHttps ? ["upgrade-insecure-requests"] : []'); });
});
