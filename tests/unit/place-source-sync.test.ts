import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractStructuredPlace, sourceMentionsPlace } from "@/lib/place-source-sync";
import { readFileSync } from "node:fs";

describe("monitor veřejných zdrojů míst", () => {
  it("přečte pouze strukturovaný údaj odpovídající očekávanému místu", () => {
    const html = `<script type="application/ld+json">{"@type":"Library","name":"Knihovna JAMU","address":{"streetAddress":"Novobranská 3","postalCode":"602 00","addressLocality":"Brno"},"openingHours":["Mo-We 09:00-18:00","Fr 09:00-15:00"]}</script>`;
    expect(extractStructuredPlace(html, "Knihovna JAMU")).toEqual({ name: "Knihovna JAMU", address: "Novobranská 3, 602 00, Brno", openingHours: "Mo-We 09:00-18:00; Fr 09:00-15:00" });
    expect(extractStructuredPlace(html, "Ústřední knihovna VUT")).toBeNull();
  });
  it("poškozený JSON-LD nepublikuje jako ověřenou změnu", () => expect(extractStructuredPlace('<script type="application/ld+json">{broken}</script>', "Knihovna JAMU")).toBeNull());
  it("pozná oficiální zkrácený název bez institucionálního prefixu", () => {
    expect(sourceMentionsPlace("<h2>Medlánky</h2><p>Kytnerova 1a</p>", "KJM Medlánky")).toBe(true);
    expect(sourceMentionsPlace("<h1>Knihovna FIT</h1>", "Knihovna FIT VUT")).toBe(true);
    expect(sourceMentionsPlace("<h1>Jiná pobočka</h1>", "KJM Medlánky")).toBe(false);
  });
  it("nebere text skrytý ve skriptu za důkaz existence místa", () => {
    expect(sourceMentionsPlace('<script>window.payload="KJM Medlánky"</script><h1>Adresář</h1>', "KJM Medlánky")).toBe(false);
  });
  it("kontroluje místa nejvýše týdně a používá podmíněné HTTP požadavky", () => {
    const source = readFileSync("lib/place-source-sync.ts", "utf8");
    expect(source).toContain('sourceType: "place_directory"');
    expect(source).toContain("refreshIntervalHours: 168");
    expect(source).toContain("7 * 24 * 60 * 60 * 1000");
    expect(source).toContain('row.origin === "official"');
    expect(source).toContain("source_etag");
    expect(source).toContain("fetched.status === 304");
  });
});
