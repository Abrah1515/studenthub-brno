import { expect, test } from "@playwright/test";

test.describe("SEO a serverové HTML", () => {
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
    for (const path of ["/admin/", "/api/", "/ucet/", "/partak/moje"]) {
      expect(robotsText).toContain(`Disallow: ${path}`);
    }
    expect(robotsText).toContain("Sitemap: https://studenthub-brno.vercel.app/sitemap.xml");

    const sitemap = await request.get("/sitemap.xml");
    const sitemapText = await sitemap.text();
    expect(sitemap.status()).toBe(200);
    for (const path of ["/brno", "/brno/kalendar", "/brno/mista", "/komunita", "/brno/brigady", "/pomoc", "/partak", "/o-projektu", "/kontakt"]) {
      expect(sitemapText).toContain(`https://studenthub-brno.vercel.app${path}`);
    }
    expect(sitemapText).not.toMatch(/\/(admin|api|ucet|nastaveni|hlidac)(\/|&lt;)/);
    expect(sitemapText).not.toContain("/nabidky");
  });

  test("hlavní veřejný obsah je už v serverové HTTP odpovědi", async ({ request }) => {
    const pages = [
      ["/brno", "StudentHub Brno"],
      ["/brno/kalendar", "Kalendář"],
      ["/brno/mista", "Užitečná místa"],
      ["/komunita", "Studentská komunita"],
      ["/brno/brigady", "Brigády · Brno"],
      ["/pomoc", "Lokální technická pomoc"],
      ["/partak", "Hledám parťáka"],
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
    for (const path of ["/nastaveni", "/hlidac", "/partak/moje", "/pomoc/moje"]) {
      const response = await request.get(path);
      const html = await response.text();
      expect(response.headers()["x-robots-tag"], path).toContain("noindex");
      expect(html, path).toMatch(/<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/);
    }
  });
});
