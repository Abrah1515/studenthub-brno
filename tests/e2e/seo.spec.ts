import { expect, test } from "@playwright/test";

test.describe("SEO a serverové HTML", () => {
  test("staré veřejné cesty přesměrují přímo a zachovají query", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440");
    const response = await request.get("/komunita?post=abc", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/brno/komunita?post=abc");
  });

  test("ověření, robots a sitemap jsou veřejně dostupné a správně filtrované", async ({ request }) => {
    const verification = await request.get("/google60df659d3c8fefaa.html");
    expect(verification.status()).toBe(200);
    expect((await verification.text()).trim()).toBe("google-site-verification: google60df659d3c8fefaa.html");

    const homepage = await request.get("/brno");
    expect(await homepage.text()).toContain('<meta name="google-site-verification" content="60df659d3c8fefaa"');

    const robots = await request.get("/robots.txt");
    const robotsText = await robots.text();
    expect(robots.status()).toBe(200);
    expect(robotsText).toContain("User-Agent: *");
    expect(robotsText).toContain("Allow: /");
    for (const path of ["/admin/", "/api/", "/ucet/", "/brno/partak/moje"]) {
      expect(robotsText).toContain(`Disallow: ${path}`);
    }
    expect(robotsText).toContain("Sitemap: https://studenthubapp.cz/sitemap.xml");

    const sitemap = await request.get("/sitemap.xml");
    const sitemapText = await sitemap.text();
    expect(sitemap.status()).toBe(200);
    for (const path of ["", "/brno", "/brno/kalendar", "/brno/mista", "/brno/komunita", "/brno/brigady", "/brno/burza", "/brno/partak", "/o-projektu", "/kontakt"]) {
      expect(sitemapText).toContain(`https://studenthubapp.cz${path}`);
    }
    expect(sitemapText).not.toMatch(/\/(admin|api|ucet|nastaveni|hlidac)(\/|&lt;)/);
    expect(sitemapText).not.toContain("/nabidky");
  });

  test("hlavní veřejný obsah je už v serverové HTTP odpovědi", async ({ request }) => {
    const pages = [
      ["/brno", "StudentHub Brno"],
      ["/brno/kalendar", "Kalendář"],
      ["/brno/mista", "Užitečná místa"],
      ["/brno/komunita", "Studentská komunita"],
      ["/brno/brigady", "Brigády · Brno"],
      ["/brno/burza", "Studentská burza"],
      ["/brno/partak", "Hledám parťáka"],
      ["/o-projektu", "O StudentHub Brno"],
      ["/kontakt", "Kontakt"],
    ] as const;

    for (const [path, heading] of pages) {
      const response = await request.get(path);
      const html = await response.text();
      expect(response.status(), path).toBe(200);
      expect(html, path).toContain("<h1");
      expect(html, path).toContain(heading);
      expect(html, path).toContain('id="hlavni-obsah"');
    }
  });

  test("soukromé stránky mají noindex na serveru", async ({ request }) => {
    for (const path of ["/brno/nastaveni", "/brno/hlidac", "/brno/partak/moje", "/brno/burza/novy", "/brno/burza/overit", "/brno/burza/sprava"]) {
      const response = await request.get(path);
      const html = await response.text();
      expect(response.headers()["x-robots-tag"], path).toContain("noindex");
      expect(html, path).toMatch(/<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/);
    }
  });
});
