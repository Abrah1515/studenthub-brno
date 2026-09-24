import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { communityEventCategories } from "@/lib/community-event-categories";
import { communityEventSchema } from "@/lib/schemas";

describe("produkční backfill veřejných dat Brna", () => {
  it("používá jediný kanonický seznam kategorií komunitních akcí", () => {
    expect(communityEventCategories).toHaveLength(14);
    expect(new Set(communityEventCategories).size).toBe(communityEventCategories.length);
    expect(communityEventCategories).toContain("Technologie a věda");
    expect(communityEventCategories).toContain("Wellbeing a zdraví");
  });

  it("přijme novou kategorii, ale odmítne odstraněnou historickou hodnotu", () => {
    const base = { title: "Veřejná přednáška", startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: "", venue: "Brno", description: "Ověřená veřejná přednáška s dostatečným popisem.", isFree: true, eventUrl: "https://example.cz/akce", publicVenueConsent: true, company: "", cityId: "brno" };
    expect(communityEventSchema.safeParse({ ...base, category: "Workshop a přednáška" }).success).toBe(true);
    expect(communityEventSchema.safeParse({ ...base, category: "Zábava" }).success).toBe(false);
  });

  it("má idempotentní klíče a neobsahuje tajné údaje", () => {
    const script=readFileSync("scripts/backfill-brno-public-data.mjs","utf8");
    expect(script).toContain("on_conflict=id");
    expect(script).toContain("source_external_id");
    expect(script).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  });
});
