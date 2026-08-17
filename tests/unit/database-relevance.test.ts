import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve("supabase/migrations/202608170020_event_relevance_places_buddy.sql"), "utf8");

describe("databázová relevance míst a bezpečnost parťáka", () => {
  it("deduplikuje veřejná místa podle stabilního nebo obsahového klíče", () => { expect(migration).toContain("places_public_dedupe_unique"); expect(migration).toContain("source_external_id"); expect(migration).toContain("normalized_place_key"); });
  it("skrývá parťáka až po třech nezávislých hlášeních", () => { expect(migration).toContain("hide_reported_buddy_post"); expect(migration).toContain("report_total >= 3"); });
});
