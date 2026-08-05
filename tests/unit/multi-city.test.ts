import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brnoCity, isCityPublic, type City } from "@/lib/cities";
import { manifestForCity } from "@/lib/pwa-manifest";

const migration = readFileSync("supabase/migrations/202608020004_multi_city_foundation.sql", "utf8");
const privacyMigration = readFileSync("supabase/migrations/202608040009_community_help_and_privacy.sql", "utf8");
const publicData = readFileSync("lib/public-data.ts", "utf8");
const map = readFileSync("components/places-explorer.tsx", "utf8");
const sitemap = readFileSync("app/sitemap.ts", "utf8");
const outbox = migration.slice(migration.indexOf("create table if not exists public.content_publication_events"), migration.indexOf("create index if not exists cities_public_idx"));
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("víceměstský základ", () => {
  it("zakládá pouze produkční Brno a zachovává pořadí bezpečného backfillu", () => { expect(migration).toContain("values ('brno','brno','Brno'"); expect(migration).not.toMatch(/values \('praha'|values \('ostrava'/i); expect(migration.indexOf("insert into public.cities")).toBeLessThan(migration.indexOf("update public.places set city_id = 'brno'")); expect(migration.indexOf("update public.places set city_id = 'brno'")).toBeLessThan(migration.indexOf("alter table public.places alter column city_id set not null")); });
  it("normalizuje města a více měst jedné univerzity a kampusy pouze bezpečně archivuje", () => { expect(migration).toContain("create table if not exists public.cities"); expect(migration).toContain("create table if not exists public.university_cities"); expect(migration).toContain("primary key (university_id, city_id)"); expect(migration).toContain("create table if not exists public.campuses"); expect(migration).toContain("create table if not exists public.offer_cities"); expect(privacyMigration).toContain("deprecated_campus_assignments"); expect(privacyMigration).toContain("update public.campuses set enabled = false"); });
  it("podporuje remote brigádu i bez města a univerzitní událost bez města", () => { expect(migration).toContain("work_location_mode = 'remote' or city_id is not null"); expect(migration).toContain("scope_type = 'university' and university_id is not null"); expect(migration).toContain("scope_type in ('city','university','faculty','national')"); });
  it("izoluje městské editory a veřejné dotazy podle aktivního města", () => { expect(migration).toContain("role in ('city_editor','admin') and city_id = target_city"); expect(migration).toContain("city staff manage places"); expect(migration).toContain("public.can_manage_city(city_id)"); expect(publicData).toContain('.eq("city_id", cityId)'); expect(publicData).toContain('work_location_mode.eq.remote'); expect(publicData).toContain('offer_cities!inner(city_id)'); });
  it("skrývá neaktivní města ze sitemap a veřejné konfigurace", () => { const inactive: City = { ...brnoCity, id: "test-city", slug: "test-city", name: "Test city", enabled: false, publicStatus: "draft" }; expect(isCityPublic(brnoCity)).toBe(true); expect(isCityPublic(inactive)).toBe(false); expect(sitemap).toContain("getPublishedCities"); });
  it("odstranil souřadnice Brna z generické mapové komponenty", () => { expect(map).not.toContain("49.215"); expect(map).not.toContain("16.59"); expect(map).toContain("city.mapBounds"); expect(map).toContain("city.mapZoom"); });
  it("zachoval původní brand assety beze změny", () => { expect(sha("public/icon-192.png")).toBe(sha("public/brand/brno/icon-192.png")); expect(sha("public/icon-512.png")).toBe(sha("public/brand/brno/icon-512.png")); expect(sha("public/og.png")).toBe(sha("public/brand/brno/og.png")); });
  it("generuje instalovatelný PWA manifest podle edice", () => { const manifest = manifestForCity(brnoCity); expect(manifest.name).toBe("StudentHub Brno"); expect(manifest.short_name).toBe("StudentHub"); expect(manifest.start_url).toBe("/brno"); expect(manifest.scope).toBe("/"); expect(manifest.display).toBe("standalone"); expect(manifest.icons?.[0].src).toBe("/brand/brno/icon-192.png"); expect(manifest.icons?.filter((icon) => icon.purpose === "maskable")).toHaveLength(2); });
  it("outbox nemá PII a nevzniká z neveřejných formulářů", () => { expect(outbox).toContain("content_publication_events"); expect(outbox).not.toMatch(/email|phone|submitter_contact|service_requests|description/); expect(outbox).toContain("academic_events_publication_outbox"); expect(outbox).toContain("jobs_publication_outbox"); });
});
