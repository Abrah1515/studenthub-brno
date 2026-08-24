import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { parseFajnXml } from "@/lib/job-feed/fajn-parser";

const live = process.env.FAJN_LIVE_TEST === "true";

describe.runIf(live)("veřejné testovací XML Fajn správy", () => {
  it("ověří transport a parser, ale nepublikuje žádný testovací inzerát", async () => {
    const response = await fetch("https://media.fajnsprava.cz/exporty/boxy/vzor_detail.xml", { signal: AbortSignal.timeout(15_000), redirect: "follow" });
    expect(response.status).toBe(200); expect(response.url).toBe("https://media.fajnsprava.cz/exporty/boxy/vzor_detail.xml");
    expect(response.headers.get("content-type") || "").toMatch(/^(text|application)\/xml\b/i);
    const body = new Uint8Array(await response.arrayBuffer()); expect(body.byteLength).toBeLessThanOrEqual(1_000_000);
    const parsed = await parseFajnXml(body); expect(parsed.total).toBe(3); expect(parsed.jobs).toEqual([]); expect(parsed.rejected).toBe(3);
  });

  it("ověří dostupnost specifikace a klíčové oficiální číselníky", async () => {
    const response = await fetch("https://www.fajnsprava.cz/xml-specifikace-v2.html?umisteni=ciselniky", { signal: AbortSignal.timeout(15_000), redirect: "follow" });
    expect(response.status).toBe(200); expect(response.headers.get("content-type") || "").toMatch(/^text\/html\b/i);
    const html = await response.text(); expect(html.length).toBeLessThanOrEqual(500_000);
    expect(html).toContain("[poz_brig]"); expect(html).toContain("Programátor, webmaster, kodér"); expect(html).toContain("[mzdy_typ]"); expect(html).toContain("dobrovolnictví");
  });
});

const productionLive = process.env.FAJN_PRODUCTION_FEED_TEST === "true";

describe.runIf(productionLive)("ostrý smluvní XML feed Fajn-brigády", () => {
  it("provede pouze bezpečný dry-run bez zápisu a bez výpisu obsahu inzerátů", async () => {
    const feedUrl = process.env.FAJN_BRIGADY_FEED_URL;
    expect(feedUrl, "Chybí serverová URL ostrého feedu.").toBeTruthy();
    const configured = new URL(feedUrl!);
    expect(configured).toMatchObject({ protocol: "https:", hostname: "media.fajnsprava.cz" });
    expect(configured.pathname).toMatch(/^\/exporty\/boxy\/(?!vzor_detail\.xml$)[a-z0-9_-]+\.xml$/i);

    const response = await fetch(configured, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
    expect(response.status).toBe(200);
    expect(new URL(response.url).hostname).toBe("media.fajnsprava.cz");
    expect(response.headers.get("content-type") || "").toMatch(/^text\/xml\b/i);
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBeLessThanOrEqual(5_000_000);

    const raw = new XMLParser({ trimValues: true, parseTagValue: false }).parse(new TextDecoder().decode(body)) as {
      inzeraty?: { pridani?: Record<string, unknown> | Array<Record<string, unknown>> };
    };
    const additions = raw.inzeraty?.pridani;
    const items = (Array.isArray(additions) ? additions : additions ? [additions] : []);
    expect(items.length).toBeGreaterThanOrEqual(150);
    expect(items.length).toBeLessThanOrEqual(500);
    expect(items.every((item) => String(item.id_sekce || "") === "1")).toBe(true);
    expect(items.every((item) => String(item.id_statu || "") === "1")).toBe(true);
    expect(items.every((item) => !item.adresa_pracoviste_id_mesta || String(item.adresa_pracoviste_id_mesta) === "582786")).toBe(true);
    expect(items.every((item) => String(item.titulek_cs || "").trim().length >= 3)).toBe(true);
    const ids = items.map((item) => String(item.id_inzeratu || ""));
    expect(new Set(ids).size).toBe(items.length);
    expect(items.every((item) => {
      try { return new URL(String(item.url_detail || "")).hostname === "www.fajn-brigady.cz"; }
      catch { return false; }
    })).toBe(true);

    const parsed = await parseFajnXml(body);
    expect(parsed.total).toBe(items.length);
    expect(parsed.jobs).toHaveLength(items.length);
    expect(parsed.rejected).toBe(0);
    expect(parsed.jobs.every((job) => !/[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.test(job.description))).toBe(true);
    expect(parsed.jobs.every((job) => !/(?:\+?\d[\d\s().-]{7,}\d)/u.test(job.description))).toBe(true);

    const rejectReasons = Object.fromEntries(Object.entries(Object.groupBy(parsed.rejections, (item) => item.code)).map(([key, value]) => [key, value?.length || 0]));
    console.info("FAJN_PRODUCTION_DRY_RUN", JSON.stringify({
      loaded: parsed.total,
      accepted: parsed.jobs.length,
      rejected: parsed.rejected,
      duplicateIds: parsed.rejections.filter((item) => item.code === "duplicate_external_id").length,
      unknownDictionaryWarnings: parsed.warnings.filter((warning) => warning.includes("neznám")).length,
      missingAddress: items.filter((item) => !String(item.adresa_pracoviste_adresa || "").trim()).length,
      missingCompany: parsed.jobs.filter((job) => !job.company).length,
      usableWage: parsed.jobs.filter((job) => job.salaryMin != null && job.salaryCurrency && job.salaryUnit).length,
      warnings: parsed.warnings.length,
      rejectReasons,
    }));
  });
});
