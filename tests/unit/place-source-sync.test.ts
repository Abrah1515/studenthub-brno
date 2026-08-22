import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractStructuredPlace } from "@/lib/place-source-sync";

describe("monitor veřejných zdrojů míst", () => {
  it("přečte pouze strukturovaný údaj odpovídající očekávanému místu", () => {
    const html = `<script type="application/ld+json">{"@type":"Library","name":"Knihovna JAMU","address":{"streetAddress":"Novobranská 3","postalCode":"602 00","addressLocality":"Brno"},"openingHours":["Mo-We 09:00-18:00","Fr 09:00-15:00"]}</script>`;
    expect(extractStructuredPlace(html, "Knihovna JAMU")).toEqual({ name: "Knihovna JAMU", address: "Novobranská 3, 602 00, Brno", openingHours: "Mo-We 09:00-18:00; Fr 09:00-15:00" });
    expect(extractStructuredPlace(html, "Ústřední knihovna VUT")).toBeNull();
  });
  it("poškozený JSON-LD nepublikuje jako ověřenou změnu", () => expect(extractStructuredPlace('<script type="application/ld+json">{broken}</script>', "Knihovna JAMU")).toBeNull());
});
