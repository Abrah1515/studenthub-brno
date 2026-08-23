import { describe, expect, it } from "vitest";
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
