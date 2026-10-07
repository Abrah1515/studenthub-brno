import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202610070003_multicity_verified_places.sql", "utf8");

describe("ověřená místa pro čtyři města", () => {
  it.each([
    ["brno", 10],
    ["praha", 10],
    ["olomouc", 6],
    ["ostrava", 10],
  ])("obsahuje očekávaný počet záznamů pro %s", (city, count) => {
    expect(migration.match(new RegExp(`\\"city\\":\\"${city}\\"`, "g"))?.length).toBe(count);
  });

  it("používá stabilní ID, veřejné zdroje a idempotentní upsert", () => {
    expect(migration.match(/"id":"c[1-4]07\d{4}-0000-4000-8000-\d{12}"/g)).toHaveLength(36);
    expect(migration).toContain("https://www.vut.cz/knihovny/seznam");
    expect(migration).toContain("https://www.knihovna.cvut.cz/o-nas/kontakt/kde-nas-najdete");
    expect(migration).toContain("https://www.knihovna.upol.cz/pobocky/prf/");
    expect(migration).toContain("https://knihovna.osu.cz/studovna-fu/");
    expect(migration).toContain("on conflict (id) do update set");
  });

  it("nemění ruční popisy a archivuje jen dvě potvrzené staré kopie", () => {
    expect(migration).not.toMatch(/description=excluded\.description/);
    expect(migration).toContain("52222222-2222-4222-8222-222222222226");
    expect(migration).toContain("52222222-2222-4222-8222-222222222227");
  });
});
