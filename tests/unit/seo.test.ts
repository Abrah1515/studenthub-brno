import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { getPublicSiteUrl } from "@/lib/seo";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("SEO a indexace", () => {
  it("publikuje ověřovací soubor Google přesně v dodané podobě", () => {
    expect(readFileSync("public/google60df659d3c8fefaa.html", "utf8").trim()).toBe(
      "google-site-verification: google60df659d3c8fefaa.html",
    );
    expect(readFileSync("app/layout.tsx", "utf8")).toContain(
      'verification: { google: "60df659d3c8fefaa" }',
    );
  });

  it("povoluje veřejný web, ale blokuje procházení neveřejných částí", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://studenthub-brno.vercel.app/";
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(expect.arrayContaining([
      "/admin/",
      "/api/",
      "/ucet/",
      "/partak/moje",
      "/*/burza/novy",
      "/*/burza/overit",
      "/*/burza/sprava",
      "/nastaveni",
    ]));
    expect(result.sitemap).toBe("https://studenthub-brno.vercel.app/sitemap.xml");
  });

  it("nepropíše localhost do veřejné sitemap ani robots.txt", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(getPublicSiteUrl()).toBe("https://studenthub-brno.vercel.app");
  });

  it("definuje důležité veřejné stránky a vynechává soukromé přehledy", () => {
    const source = readFileSync("app/sitemap.ts", "utf8");

    for (const path of ["/kalendar", "/mista", "/brigady", "/burza", "/komunita", "/partak", "/o-projektu", "/kontakt"]) {
      expect(source, path).toContain(`"${path}"`);
    }
    for (const path of ["/admin", "/api", "/ucet", "/nastaveni", "/hlidac", "/partak/moje", "/navrhnout-obsah"]) {
      expect(source, path).not.toContain(`"${path}"`);
    }
    expect(source).toContain("featureFlags.offersEnabled ? [\"/nabidky\"] : []");
  });

  it("posílá noindex v metadatech i HTTP hlavičkách neveřejných stránek", () => {
    for (const path of [
      "app/admin/page.tsx",
      "app/ucet/prihlaseni/page.tsx",
      "app/partak/moje/page.tsx",
      "app/[city]/burza/novy/page.tsx",
      "app/[city]/burza/overit/page.tsx",
      "app/[city]/burza/sprava/page.tsx",
      "app/akce/sprava/page.tsx",
      "app/nastaveni/page.tsx",
      "app/hlidac/page.tsx",
      "app/nabidky/page.tsx",
      "app/[city]/nabidky/page.tsx",
    ]) {
      expect(readFileSync(path, "utf8"), path).toContain("robots: { index: false, follow: false }");
    }

    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('value: "noindex, nofollow"');
    expect(config).toContain('{ source: "/admin/:path*", headers: noIndexHeaders }');
    expect(config).toContain('{ source: "/api/:path*", headers: noIndexHeaders }');
  });
});
