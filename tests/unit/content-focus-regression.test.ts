import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("produkční zaměření obsahu", () => {
  it("řídí nabídky jediným typovaným příznakem a výchozí stav je vypnutý", async () => {
    const previous = process.env.NEXT_PUBLIC_OFFERS_ENABLED;
    delete process.env.NEXT_PUBLIC_OFFERS_ENABLED;
    const { featureFlags } = await import("@/lib/feature-flags");
    expect(featureFlags.offersEnabled).toBe(false);
    if (previous) process.env.NEXT_PUBLIC_OFFERS_ENABLED = previous;
  });

  it("skrývá prázdný dashboardový blok nabídek a ponechá místa přes celou šířku", () => {
    const source = read("components/city-dashboard-content.tsx");
    expect(source).toContain("featureFlags.offersEnabled && personalized.offers.length > 0");
    expect(source).toContain('featureFlags.offersEnabled && personalized.offers.length ? "two-column-grid" : undefined');
  });

  it("odstraňuje nabídky ze sitemap a veřejná trasa při vypnutí přesměruje", () => {
    expect(read("app/sitemap.ts")).toContain("featureFlags.offersEnabled");
    expect(read("app/[city]/nabidky/page.tsx")).toContain("redirect(`/${city.slug}`)");
  });
});
