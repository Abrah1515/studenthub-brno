import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brnoCity, cityCatalog, cityHref, isCityModuleEnabled, isCityPublic, olomoucCity, ostravaCity, prahaCity, type City } from "@/lib/cities";
import { manifestForCity } from "@/lib/pwa-manifest";
import { resolvePreferenceForCity } from "@/lib/client-preferences";
import { academicCatalogForCity } from "@/lib/universities";

const migration = readFileSync("supabase/migrations/202608020004_multi_city_foundation.sql", "utf8");
const olomoucMigration = readFileSync("supabase/migrations/202609280001_olomouc_multi_city_readiness.sql", "utf8");
const olomoucSafetyMigration = readFileSync("supabase/migrations/202609280002_deactivate_olomouc_until_launch.sql", "utf8");
const olomoucContentMigration = readFileSync("supabase/migrations/202609280003_olomouc_verified_content.sql", "utf8");
const olomoucLaunchMigration = readFileSync("supabase/migrations/202609280004_publish_olomouc.sql", "utf8");
const prahaMigration = readFileSync("supabase/migrations/202609290001_publish_praha.sql", "utf8");
const ostravaMigration = readFileSync("supabase/migrations/202610040001_publish_ostrava.sql", "utf8");
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
  it("izoluje městské editory a veřejné dotazy podle aktivního města", () => { expect(migration).toContain("role in ('city_editor','admin') and city_id = target_city"); expect(migration).toContain("city staff manage places"); expect(migration).toContain("public.can_manage_city(city_id)"); expect(publicData).toContain('.eq("city_id", cityId)'); expect(publicData).not.toContain('work_location_mode.eq.remote'); expect(publicData).toContain('offer_cities!inner(city_id)'); });
  it("skrývá neaktivní města ze sitemap a veřejné konfigurace", () => { const inactive: City = { ...brnoCity, id: "test-city", slug: "test-city", name: "Test city", enabled: false, publicStatus: "draft" }; expect(isCityPublic(brnoCity)).toBe(true); expect(isCityPublic(inactive)).toBe(false); expect(sitemap).toContain("getPublishedCities"); });
  it("vede města z jednoho katalogu a publikuje připravené edice", () => {
    expect(cityCatalog.map((city) => city.slug)).toEqual(["brno", "praha", "ostrava", "olomouc"]);
    expect(prahaCity).toMatchObject({ id: "praha", slug: "praha", enabled: true, publicStatus: "published", timezone: "Europe/Prague" });
    expect(prahaCity.modules).toMatchObject({ calendar: true, places: true, community: true, buddy: true, marketplace: true, housing: true, chat: true, jobs: true, offers: false });
    expect(prahaCity.selectionLogo.symbol).toBe("/brand/cities/studenthub-praha-symbol-v1.png");
    expect(cityHref(prahaCity, "kalendar")).toBe("/praha/kalendar");
    expect(ostravaCity).toMatchObject({ id: "ostrava", slug: "ostrava", enabled: true, publicStatus: "published", timezone: "Europe/Prague" });
    expect(ostravaCity.modules).toMatchObject({ calendar: true, places: true, community: true, buddy: true, marketplace: true, housing: true, chat: true, jobs: true, offers: false });
    expect(ostravaCity.selectionLogo.symbol).toBe("/brand/cities/studenthub-ostrava-symbol-v1.png");
    expect(cityHref(ostravaCity, "kalendar")).toBe("/ostrava/kalendar");
    expect(olomoucCity).toMatchObject({ id: "olomouc", slug: "olomouc", enabled: true, publicStatus: "published", timezone: "Europe/Prague" });
    expect(olomoucCity.modules).toMatchObject({ calendar: true, places: true, community: true, buddy: true, marketplace: true, housing: true, chat: true, jobs: true, offers: false });
    expect(olomoucCity.selectionLogo.symbol).toBe("/brand/cities/studenthub-olomouc-symbol-v1.png");
    expect(isCityModuleEnabled(olomoucCity, "chat")).toBe(true);
    expect(isCityModuleEnabled(olomoucCity, "jobs")).toBe(true);
    expect(cityHref(olomoucCity, "kalendar")).toBe("/olomouc/kalendar");
  });
  it("odděluje univerzity a fakulty podle města", () => {
    const brno = academicCatalogForCity("brno");
    const praha = academicCatalogForCity("praha");
    const olomouc = academicCatalogForCity("olomouc");
    const ostrava = academicCatalogForCity("ostrava");
    expect(brno.universities.map((item) => item.id)).toEqual(["muni", "vut", "mendelu", "vetuni", "jamu"]);
    expect(brno.faculties).toHaveLength(27);
    expect(praha.universities.map((item) => item.id)).toEqual(["cuni", "cvut", "vse", "czu", "vscht"]);
    expect(praha.faculties).toHaveLength(37);
    expect(praha.faculties.every((item) => praha.universities.some((university) => university.id === item.universityId))).toBe(true);
    expect(olomouc.universities.map((item) => item.id)).toEqual(["upol"]);
    expect(olomouc.faculties).toHaveLength(8);
    expect(olomouc.faculties.every((item) => item.universityId === "upol")).toBe(true);
    expect(ostrava.universities.map((item) => item.id)).toEqual(["vsbtuo", "osu"]);
    expect(ostrava.faculties).toHaveLength(13);
    expect(ostrava.faculties.every((item) => ostrava.universities.some((university) => university.id === item.universityId))).toBe(true);
  });
  it("nepřenáší uloženou školu a fakultu mezi městy", () => {
    const brnoPreference = { cityId: "brno", universityId: "muni", facultyId: "muni-fi" };
    expect(resolvePreferenceForCity(brnoPreference, "ostrava")).toEqual({ universityId: "", facultyId: "" });
    expect(resolvePreferenceForCity(brnoPreference, "brno")).toEqual({ universityId: "muni", facultyId: "muni-fi" });
    expect(resolvePreferenceForCity({ cityId: "ostrava", universityId: "vsbtuo", facultyId: "muni-fi" }, "ostrava")).toEqual({ universityId: "vsbtuo", facultyId: "" });
  });
  it("publikuje Ostravu idempotentně s ověřeným minimem a ostravským feedem", () => {
    expect(ostravaMigration).toContain("'ostrava','ostrava','Ostrava'");
    expect(ostravaMigration).toContain("enabled=true,public_status='published'");
    expect(ostravaMigration).toContain('"jobs":true');
    expect(ostravaMigration).toContain("'vsbtuo','vsbtuo','Vysoká škola báňská – Technická univerzita Ostrava'");
    expect(ostravaMigration).toContain("'osu','osu','Ostravská univerzita'");
    expect(ostravaMigration.match(/\('(?:vsbtuo|osu)-[a-z]+','(?:vsbtuo|osu)'/g)?.length).toBe(13);
    expect(ostravaMigration).toContain("'src-fajn-brigady-ostrava'");
    expect(ostravaMigration).toContain("'2026/2027'");
    expect(ostravaMigration).toContain("'ostrava','Ústřední knihovna VŠB-TUO'");
    expect(ostravaMigration).toContain("'ostrava','Festival ostravských knihoven'");
    expect(ostravaMigration).toContain("on conflict (city_id,source_external_id)");
  });
  it("publikuje Prahu jednou idempotentní migrací s ověřeným minimem", () => {
    expect(prahaMigration).toContain("'praha','praha','Praha'");
    expect(prahaMigration).toContain("enabled=true,public_status='published'");
    expect(prahaMigration).toContain('"jobs":false');
    expect(prahaMigration).toContain("on conflict (university_id,city_id)");
    expect(prahaMigration).toContain("on conflict (city_id,source_external_id)");
    expect(prahaMigration).toContain("'cuni','cuni','Univerzita Karlova'");
    expect(prahaMigration).toContain("'cvut','cvut','České vysoké učení technické v Praze'");
    expect(prahaMigration).toContain("'vse','vse','Vysoká škola ekonomická v Praze'");
    expect(prahaMigration).toContain("'czu','czu','Česká zemědělská univerzita v Praze'");
    expect(prahaMigration).toContain("'vscht','vscht','Vysoká škola chemicko-technologická v Praze'");
    expect(prahaMigration.match(/'c3000000-0000-4000-8000-0000000000\d\d'/g)?.length).toBe(15);
    expect(prahaMigration.match(/'b3000000-0000-4000-8000-00000000000\d'/g)?.length).toBe(4);
    expect(prahaMigration).toContain("'2026/2027'");
    expect(prahaMigration).toContain("'src-praha-cuni'");
    expect(prahaMigration).toContain("'src-praha-vscht'");
  });
  it("přidává jen ověřený olomoucký obsah a město nepublikuje", () => {
    expect(olomoucContentMigration).toContain("Univerzita Palackého v Olomouci");
    expect(olomoucContentMigration.match(/'upol-[a-z]+','upol','upol-[a-z]+'/g)?.length).toBe(8);
    expect(olomoucContentMigration).toContain("'2026/2027'");
    expect(olomoucContentMigration).toContain("'olomouc','Pastiche Filmz: Moonlight'");
    expect(olomoucContentMigration).toContain("'olomouc','Hlavní menza UP'");
    expect(olomoucContentMigration).toContain("enabled=false,public_status='draft'");
    expect(olomoucContentMigration).toContain('"jobs":false');
  });
  it("publikuje Olomouc až po idempotentním doplnění aktivačního minima", () => {
    expect(olomoucLaunchMigration).toContain("upol-speak-dating-2026");
    expect(olomoucLaunchMigration).toContain("upol-dorm-generala-svobody");
    expect(olomoucLaunchMigration).toContain("enabled=true,public_status='published'");
    expect(olomoucLaunchMigration).toContain('"jobs":false');
    expect(olomoucLaunchMigration).toContain("on conflict (city_id,source_external_id)");
    expect(olomoucLaunchMigration.match(/'upol-[a-z0-9-]+-2026'/g)?.length).toBeGreaterThanOrEqual(10);
    expect(olomoucLaunchMigration.match(/'63222222-3333-4333-8333-3333333333\d\d'/g)?.length).toBe(18);
  });
  it("přidává Olomouc idempotentně bez jejího zveřejnění a odstraňuje slepé výchozí Brno", () => {
    expect(olomoucMigration).toContain("'olomouc', 'olomouc', 'Olomouc'");
    expect(olomoucMigration).toContain("false, 'draft'");
    expect(olomoucMigration).toContain("on conflict (id) do update");
    expect(olomoucMigration).not.toMatch(/on conflict[\s\S]*enabled\s*=\s*excluded\.enabled/i);
    for (const table of ["places", "community_profiles", "anonymous_installations", "marketplace_listings", "place_submissions", "housing_listings"]) {
      expect(olomoucMigration).toContain(`alter table public.${table} alter column city_id drop default`);
    }
    expect(olomoucSafetyMigration).toContain("public_status = 'draft'");
    expect(olomoucSafetyMigration).toContain("enabled = false");
    expect(olomoucSafetyMigration).toContain("first-phase-launch-safety");
  });
  it("veřejné RLS politiky vyžadují publikované město", () => {
    expect(olomoucMigration.match(/c\.enabled and c\.public_status = 'published'/g)?.length).toBeGreaterThanOrEqual(5);
    expect(olomoucMigration).toContain('create policy "public reads approved active buddy posts"');
    expect(olomoucMigration).toContain('create policy "public reads active community posts"');
    expect(olomoucMigration).toContain('create policy "public read active housing"');
  });
  it("má společné dynamické routy bez kopií pro jednotlivá města", () => {
    for (const route of ["komunita/page.tsx", "partak/page.tsx", "hlidac/page.tsx", "chat/page.tsx", "nastaveni/page.tsx"]) {
      expect(readFileSync(`app/[city]/${route}`, "utf8")).toContain("getPublishedCityModule");
    }
  });
  it("odstranil souřadnice Brna z generické mapové komponenty", () => { expect(map).not.toContain("49.215"); expect(map).not.toContain("16.59"); expect(map).toContain("city.mapBounds"); expect(map).toContain("city.mapZoom"); });
  it("udržuje kompatibilní veřejné assety ve shodě s novou červenou značkou", () => { expect(sha("public/icon-192.png")).toBe(sha("public/brand/brno/icon-192.png")); expect(sha("public/icon-512.png")).toBe(sha("public/brand/brno/icon-512.png")); expect(sha("public/og.png")).toBe(sha("public/brand/brno/og.png")); expect(sha("public/icon-192.png")).toBe(sha("public/brand/brno/studenthub-icon-v3-192.png")); });
  it("generuje instalovatelný PWA manifest podle edice", () => { const manifest = manifestForCity(brnoCity); expect(manifest.name).toBe("StudentHub Brno"); expect(manifest.short_name).toBe("StudentHub"); expect(manifest.start_url).toBe("/brno"); expect(manifest.scope).toBe("/"); expect(manifest.display).toBe("standalone"); expect(manifest.icons?.[0].src).toBe("/brand/brno/studenthub-icon-v3-192.png"); expect(manifest.icons?.filter((icon) => icon.purpose === "maskable")).toHaveLength(2); });
  it("outbox nemá PII a nevzniká z neveřejných formulářů", () => { expect(outbox).toContain("content_publication_events"); expect(outbox).not.toMatch(/email|phone|submitter_contact|service_requests|description/); expect(outbox).toContain("academic_events_publication_outbox"); expect(outbox).toContain("jobs_publication_outbox"); });
});
