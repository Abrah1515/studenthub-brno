import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]) }));
import { parseHtml } from "@/lib/sources/connectors/html";
import { parseIcs } from "@/lib/sources/connectors/ics";
import { deduplicatePdfEvents, parsePdf, parsePdfExtractedText } from "@/lib/sources/connectors/pdf";
import { runConnector } from "@/lib/sources/connectors";
import { contentSources } from "@/lib/sources/registry";
import { parseCzechDateRange, sha256, zonedDateTimeToIso } from "@/lib/sources/normalize";
import { reconcileEvents } from "@/lib/sources/reconcile";
import { discoverAcademicDocument, discoverPaginationUrls } from "@/lib/sources/discovery";
import type { ConnectorContext, NormalizedEvent } from "@/lib/sources/types";
import { fitCalendarSourceForYear, fsiCalendarSourceForYear, inspectConnectorResult, inspectSourcePayload } from "@/lib/sources/validation";
import { sourceRunMayArchive } from "@/lib/sources/publish-policy";
import { fetchSourcePayload } from "@/lib/sources/payload";
import { fetchRegisteredSource } from "@/lib/sources/fetch-source";
import { robotsAllowsPath } from "@/lib/sources/robots";

afterEach(() => vi.unstubAllGlobals());

const source = { ...contentSources.find((item) => item.id === "src-vut-fit")!, enabled: true };
const context = (body: Uint8Array): ConnectorContext => ({ source, body, contentType: "text/plain", checkedAt: "2026-08-01T10:00:00Z" });
const pdfContext = (body: Uint8Array): ConnectorContext => ({ source: { ...source, format: "pdf", requiresReview: true }, body, contentType: "application/pdf", checkedAt: "2026-08-01T10:00:00Z" });

describe("konektory veřejných zdrojů", () => {
  it("normalizuje ICS včetně exkluzivního celodenního konce", async () => { const body = await readFile("tests/fixtures/calendar.ics"); const result = await parseIcs(context(body)); expect(result.events).toHaveLength(1); expect(result.events[0]).toMatchObject({ externalId: "fit-teaching-2026", allDay: true, category: "Výuka", status: "approved" }); expect(result.events[0].startAt).toBe("2026-09-13T22:00:00.000Z"); expect(result.events[0].endAt).toBe("2026-12-11T22:59:00.000Z"); });
  it("z konzervativního HTML přijme jen známé akademické kategorie", async () => { const body = await readFile("tests/fixtures/calendar.html"); const result = await parseHtml(context(body)); expect(result.events.map((item) => item.category)).toEqual(["Výuka", "Zkouškové období"]); expect(result.events.every((item) => item.confidence >= .9)).toBe(true); });
  it("aktuální textové PDF z automatického zdroje publikuje bez zásahu editora", async () => { const text = await readFile("tests/fixtures/calendar-pdf.txt", "utf8"); const result = await parsePdfExtractedText(text, context(new Uint8Array())); expect(result.events).toHaveLength(2); expect(result.events.every((item) => item.status === "approved" && item.confidence >= .95 && item.academicYear === "2026/2027")).toBe(true); expect(result.warnings).toHaveLength(0); });
  it("OCR a zdroj v kontrolním režimu nikdy automaticky nepublikuje", async () => { const text = await readFile("tests/fixtures/calendar-pdf.txt", "utf8"); const reviewContext = { ...context(new Uint8Array()), source: { ...source, monitoringMode: "automatic_review" as const } }; const [ocr, review] = await Promise.all([parsePdfExtractedText(text, context(new Uint8Array()), "Harmonogram 2026/2027", 1, { usedOcr: true }), parsePdfExtractedText(text, reviewContext)]); expect(ocr.events.every((item) => item.status === "pending")).toBe(true); expect(review.events.every((item) => item.status === "pending")).toBe(true); expect(ocr.warnings).toHaveLength(1); expect(review.warnings).toHaveLength(1); });
  it("PDF zachová skutečné číslo stránky v události i hashi", async () => { const text = await readFile("tests/fixtures/calendar-pdf.txt", "utf8"); const first = await parsePdfExtractedText(text, context(new Uint8Array()), "Harmonogram", 3); const second = await parsePdfExtractedText(text, context(new Uint8Array()), "Harmonogram", 4); expect(first.events.every((item) => item.sourcePage === 3)).toBe(true); expect(first.events[0].sourceHash).not.toBe(second.events[0].sourceHash); });
  it("extrahuje textové PDF a zachová původní řádek", async () => { const result = await parsePdf(pdfContext(await readFile("tests/fixtures/calendar-text.pdf"))); expect(result.events).toHaveLength(2); expect(result.events.every((item) => item.originalText && item.sourceDocumentTitle)).toBe(true); expect(result.normalizedHash).toMatch(/^[a-f0-9]{64}$/); });
  it("doplní serverové PDF globály i bez prohlížečového prostředí", async () => { const globals = globalThis as unknown as Record<string, unknown>; const original = { DOMMatrix: globals.DOMMatrix, Path2D: globals.Path2D, ImageData: globals.ImageData, pdfjsWorker: globals.pdfjsWorker }; for (const key of Object.keys(original)) Reflect.deleteProperty(globals, key); try { const result = await parsePdf(pdfContext(await readFile("tests/fixtures/calendar-text.pdf"))); expect(result.events).toHaveLength(2); expect(typeof globals.DOMMatrix).toBe("function"); expect(typeof globals.Path2D).toBe("function"); expect(typeof globals.ImageData).toBe("function"); expect(globals.pdfjsWorker).toBeTruthy(); } finally { for (const [key, value] of Object.entries(original)) { if (value) globals[key] = value; else Reflect.deleteProperty(globals, key); } } });
  it("spojí buňky tabulkového PDF do čitelného řádku", async () => { const result = await parsePdf(pdfContext(await readFile("tests/fixtures/calendar-table.pdf"))); expect(result.events.map((item) => item.category)).toEqual(["Výuka", "Zkouškové období"]); });
  it("před databázovým zápisem sloučí opakované termíny z více PDF tabulek", () => { const event = { externalId: "same", title: "Výuka", description: "", startAt: "2026-09-14T00:00:00Z", allDay: true, timezone: "Europe/Prague" as const, category: "Výuka" as const, academicYear: "2026/2027", universityId: "vut", facultyId: "vut-fekt", sourceId: "src-vut-fekt", sourceUrl: "https://www.vut.cz/", sourceHash: "a", confidence: 1, status: "approved" as const, lastVerifiedAt: "2026-08-11T00:00:00Z" }; expect(deduplicatePdfEvents([event, { ...event, sourcePage: 2 }])).toEqual([event]); });
  it("skenované PDF bez textové vrstvy nepublikuje", async () => { const result = await parsePdf(pdfContext(await readFile("tests/fixtures/calendar-scanned.pdf"))); expect(result.events).toHaveLength(0); expect(result.warnings[0]).toContain("OCR"); });
  it("MUNI mapuje všech deset fakult podle stabilního kódu sloupce", async () => {
    const body = await readFile("tests/fixtures/muni-periods.html");
    const muni = contentSources.filter((item) => item.universityId === "muni");
    expect(muni).toHaveLength(10);
    for (const facultySource of muni) {
      const result = await parseHtml({ source: facultySource, body, contentType: "text/html", checkedAt: "2026-08-02T10:00:00Z" });
      expect(result.events.length, facultySource.facultyId).toBeGreaterThanOrEqual(2);
      expect(result.events.every((item) => item.facultyId === facultySource.facultyId && item.academicYear === "2026/2027" && item.status === "approved")).toBe(true);
    }
  });
  it("PEF vytvoří z každého řádku samostatnou výuku, zkoušky a registraci", async () => {
    const pef = contentSources.find((item) => item.id === "src-mendelu-pef")!;
    const result = await parseHtml({ source: pef, body: await readFile("tests/fixtures/mendelu-pef.html"), contentType: "text/html", checkedAt: "2026-08-02T10:00:00Z" });
    expect(result.events).toHaveLength(6);
    expect(result.events.map((item) => item.category)).toEqual(["Výuka", "Zkouškové období", "Registrace předmětů", "Výuka", "Zkouškové období", "Registrace předmětů"]);
    expect(result.events.every((item) => item.title !== "zimní semestr" && item.status === "approved")).toBe(true);
  });
  it("FIT a FSI čtou strukturované schedule položky bez dlouhých názvů a duplicit", async () => {
    const body = await readFile("tests/fixtures/vut-schedule.html");
    const fit = contentSources.find((item) => item.id === "src-vut-fit")!; const fsi = contentSources.find((item) => item.id === "src-vut-fsi")!;
    const [fitResult, fsiResult] = await Promise.all([
      parseHtml({ source: { ...fit, academicYear: "2026/2027" }, body, contentType: "text/html", checkedAt: "2026-08-12T00:00:00Z" }),
      parseHtml({ source: { ...fsi, academicYear: "2026/2027" }, body, contentType: "text/html", checkedAt: "2026-08-12T00:00:00Z" }),
    ]);
    expect(fitResult.events).toHaveLength(3); expect(fsiResult.events).toHaveLength(3);
    expect(fitResult.events.every((item) => item.title.length <= 160 && !item.title.startsWith("19:00"))).toBe(true);
    expect(new Set(fsiResult.events.map((item) => item.externalId)).size).toBe(fsiResult.events.length);
    expect(fitResult.events.map((item) => item.category)).toEqual(["Výuka", "Zkouškové období", "Výuka"]);
    expect(fitResult.events.some((item) => item.title.includes("Vánoční prázdniny"))).toBe(false);
  });
  it("veřejný IS JAMU oddělí HF a DIFA", async () => {
    const body = await readFile("tests/fixtures/jamu-periods.html"); const hf = contentSources.find((item) => item.id === "src-jamu-hf")!; const df = contentSources.find((item) => item.id === "src-jamu-df")!;
    const [hfResult, dfResult] = await Promise.all([parseHtml({ source: hf, body, contentType: "text/html", checkedAt: "2026-08-02T10:00:00Z" }), parseHtml({ source: df, body, contentType: "text/html", checkedAt: "2026-08-02T10:00:00Z" })]);
    expect(hfResult.events).toHaveLength(2); expect(dfResult.events).toHaveLength(2); expect(hfResult.events[0].startAt).not.toBe(dfResult.events[0].startAt);
  });
  it("dohledá nejnovější oficiální dokument a odmítne cizí doménu", async () => {
    const html = await readFile("tests/fixtures/academic-document-index.html", "utf8"); const vetuni = contentSources.find((item) => item.id === "src-vetuni-fvl")!;
    const found = discoverAcademicDocument(html, "https://www.vetuni.cz/Rozpis_vyuky_pro_akademicky_rok", vetuni, new Date("2026-08-02T00:00:00Z"));
    expect(found).toMatchObject({ url: "https://www.vetuni.cz/files/harmonogram-2026-27.pdf", academicYear: "2026/2027" });
    expect(found?.url).not.toContain("example.com");
    const rollover = discoverAcademicDocument(html, "https://www.vetuni.cz/Rozpis_vyuky_pro_akademicky_rok", vetuni, new Date("2027-08-02T00:00:00Z"));
    expect(rollover).toMatchObject({ url: "https://www.vetuni.cz/files/harmonogram-2027-28.pdf", academicYear: "2027/2028" });
  });
  it("projde stránkování úřední desky a pozná PDF i bez přípony v URL", () => {
    const fekt = contentSources.find((item) => item.id === "src-vut-fekt")!;
    const pages = discoverPaginationUrls('<a href="?str=2">2</a><a href="?str=3">3</a><a href="/jina-cesta?str=4">4</a>', fekt.sourceUrl, fekt, 3);
    expect(pages).toEqual([`${fekt.sourceUrl}?str=2`, `${fekt.sourceUrl}?str=3`]);
    const detail = '<a href="/uredni-deska/vnitrni-legislativa-fekt/-d301884/rd-40-casovy-plan-akademickeho-roku-2026-27-p311826">pdf RD 40 - Časový plán akademického roku 2026/27</a>';
    expect(discoverAcademicDocument(detail, "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/d301884", fekt, new Date("2026-08-02T00:00:00Z"))).toMatchObject({ academicYear: "2026/2027", isPdfHint: true });
    const fch = contentSources.find((item) => item.id === "src-vut-fch")!;
    const attachments = '<h1>Časový plán akademického roku 2026/2027</h1><a href="/uredni-deska/vnitrni-legislativa-fch/-d344770/rd-10-2026-casovy-plan-p357346">pdfRD_10_2026_Casovy_plan</a><a href="/uredni-deska/vnitrni-legislativa-fch/-d344770/rd-10-2026-priloha-p357347">pdfRD_10_2026_priloha</a>';
    expect(discoverAcademicDocument(attachments, "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fch/d344770", fch, new Date("2026-08-02T00:00:00Z"))?.url).toContain("priloha-p357347");
  });
  it("projde seznam, druhou stránku, detail a neprůhlednou PDF přílohu až k událostem", async () => {
    const fekt = contentSources.find((item) => item.id === "src-vut-fekt")!;
    const pageTwo = `${fekt.sourceUrl}?str=2`;
    const detail = "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/rozhodnuti-c-40-2025-casovy-plan-akademickeho-roku-2026-27-d301884";
    const attachment = "https://www.vut.cz/uredni-deska/vnitrni-legislativa-fekt/-d301884/rd-40-casovy-plan-akademickeho-roku-2026-27-p311826";
    const pdf = await readFile("tests/fixtures/calendar-text.pdf");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /", { status: 200, headers: { "content-type": "text/plain" } });
      if (url.href === fekt.sourceUrl) return new Response(`<a href="?str=2">2</a>`, { status: 200, headers: { "content-type": "text/html" } });
      if (url.href === pageTwo) return new Response(`<a href="${detail}">Rozhodnutí č. 40/2025 - Časový plán akademického roku 2026/2027</a>`, { status: 200, headers: { "content-type": "text/html" } });
      if (url.href === detail) return new Response(`<h1>Časový plán akademického roku 2026/2027</h1><a href="${attachment}">pdf RD 40 časový plán</a>`, { status: 200, headers: { "content-type": "text/html" } });
      if (url.href === attachment) return new Response(Uint8Array.from(pdf), { status: 200, headers: { "content-type": "application/pdf" } });
      return new Response("nenalezeno", { status: 404 });
    }));
    const payload = await fetchSourcePayload(fekt, {}, new Date("2026-08-02T00:00:00Z"));
    expect(payload.effectiveSource).toMatchObject({ format: "pdf", parserKey: "pdf-auto", academicYear: "2026/2027", sourceUrl: attachment });
    const result = await runConnector({ source: payload.effectiveSource, body: payload.fetched.body, contentType: payload.fetched.contentType, checkedAt: "2026-08-02T10:00:00Z" });
    expect(result.events).toHaveLength(2);
    expect(result.events.every((event) => event.status === "approved" && event.confidence >= .95)).toBe(true);
  });
});

describe("robots.txt", () => {
  it("respektuje nejkonkrétnější pravidlo a Allow při stejné nebo delší cestě", () => {
    const rules = "User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: studenthub\nDisallow: /staff\nAllow: /staff/public";
    expect(robotsAllowsPath("/private/document.pdf", rules)).toBe(true);
    expect(robotsAllowsPath("/staff/calendar.pdf", rules)).toBe(false);
    expect(robotsAllowsPath("/staff/public/calendar.pdf", rules)).toBe(true);
    expect(robotsAllowsPath("/anything", rules)).toBe(true);
  });

  it("zakázanou cestu ani při živém běhu nestáhne", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input); requested.push(url);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /study/calendar/", { status: 200 });
      return new Response("nemělo se stáhnout", { status: 200, headers: { "content-type": "text/html" } });
    }));
    await expect(fetchRegisteredSource(source)).rejects.toMatchObject({ issue: { code: "robots_disallowed", status: "blocked" } });
    expect(requested).toEqual(["https://www.fit.vut.cz/robots.txt"]);
  });

  it("při nedostupném robots.txt postupuje konzervativně", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input); requested.push(url);
      return new Response("dočasná chyba", { status: 503 });
    }));
    await expect(fetchRegisteredSource(source)).rejects.toMatchObject({ issue: { code: "robots_unavailable", status: "needs_review" } });
    expect(requested).toEqual(["https://www.fit.vut.cz/robots.txt"]);
  });
});

describe("časová normalizace Europe/Prague", () => {
  it("respektuje letní a zimní čas", () => { expect(zonedDateTimeToIso(2026, 9, 14)).toBe("2026-09-13T22:00:00.000Z"); expect(zonedDateTimeToIso(2027, 1, 4)).toBe("2027-01-03T23:00:00.000Z"); });
  it("čte český rozsah přes hranici roku", () => { expect(parseCzechDateRange("21. 12. 2026 - 5. 2. 2027")).toMatchObject({ start: "2026-12-20T23:00:00.000Z", allDay: true }); });
});

describe("idempotentní reconciliace", () => {
  const event = { externalId: "uid-1", sourceHash: "new", startAt: "2027-01-04T00:00:00Z" } as NormalizedEvent;
  it("rozliší insert, update, beze změny a archivaci", () => {
    expect(reconcileEvents([], [event]).inserts).toHaveLength(1);
    expect(reconcileEvents([{ id: "1", external_id: "uid-1", source_hash: "old", manual_override: false, starts_at: "2027-01-04T00:00:00Z", title: "x", is_cancelled: false }], [event]).updates).toHaveLength(1);
    expect(reconcileEvents([{ id: "1", external_id: "uid-1", source_hash: "new", manual_override: false, starts_at: "2027-01-04T00:00:00Z", title: "x", is_cancelled: false }], [event]).unchanged).toHaveLength(1);
    expect(reconcileEvents([{ id: "2", external_id: "missing", source_hash: "x", manual_override: false, starts_at: "2099-01-04T00:00:00Z", title: "x", is_cancelled: false }], [event]).archived).toHaveLength(1);
  });
  it("pozná nahrazené PDF na stejné URL podle hashe", async () => { const before = await sha256(await readFile("tests/fixtures/calendar-text.pdf")); const after = await sha256(await readFile("tests/fixtures/calendar-table.pdf")); expect(before).not.toBe(after); expect(before).toMatch(/^[a-f0-9]{64}$/); });
  it("přesunutý termín označí ke změně a chybějící budoucí termín ke zrušení", () => { const moved = { ...event, sourceHash: "moved", startAt: "2027-01-05T00:00:00Z" }; const changes = reconcileEvents([{ id: "1", external_id: "uid-1", source_hash: "old", manual_override: false, starts_at: "2027-01-04T00:00:00Z", title: "x", is_cancelled: false }, { id: "2", external_id: "removed", source_hash: "x", manual_override: false, starts_at: "2099-01-04T00:00:00Z", title: "x", is_cancelled: false }], [moved]); expect(changes.updates).toHaveLength(1); expect(changes.archived).toHaveLength(1); });
});

it("registr pokrývá a monitoruje všech 27 fakult", () => { expect(contentSources).toHaveLength(27); expect(new Set(contentSources.map((item) => item.facultyId)).size).toBe(27); expect(contentSources.every((item) => item.enabled)).toBe(true); });
it("odděluje bezpečně automatické a kontrolované zdroje", () => { expect(contentSources.filter((item) => item.monitoringMode === "automatic_publish")).toHaveLength(18); expect(contentSources.filter((item) => item.monitoringMode === "automatic_review")).toHaveLength(9); expect(contentSources.filter((item) => item.monitoringMode === "not_found_monitored")).toHaveLength(0); });
it("každá fakulta má dohledaný aktivní oficiální zdroj", () => { expect(contentSources.every((item) => item.enabled && item.parserKey !== "not-found-monitor" && item.sourceUrl.startsWith("https://"))).toBe(true); });
it("FIT odvodí URL z aktuálního akademického roku bez hardcodování", () => { const fit = fitCalendarSourceForYear(source, new Date("2026-08-02T00:00:00Z")); expect(fit.sourceUrl).toBe("https://www.fit.vut.cz/study/calendar/2026/.cs"); expect(fit.academicYear).toBe("2026/2027"); expect(fitCalendarSourceForYear(source, new Date("2027-02-02T00:00:00Z")).sourceUrl).toContain("/2026/.cs"); });
it("FSI předá aktuální akademický rok explicitně a nebere starý výchozí plán", () => { const fsi = contentSources.find((item) => item.id === "src-vut-fsi")!; expect(fsiCalendarSourceForYear(fsi, new Date("2026-08-02T00:00:00Z"))).toMatchObject({ sourceUrl: "https://www.fme.vutbr.cz/studenti/plan?degree=0&mode=0&year=2026", academicYear: "2026/2027" }); });
it("rozpozná VETUNI Turnstile a HTML vydávané za PDF", () => { const vetuni = contentSources.find((item) => item.id === "src-vetuni-fvl")!; expect(inspectSourcePayload(vetuni, { finalUrl: "https://www.vetuni.cz/turnstile.php?from=x", contentType: "text/html", body: new TextEncoder().encode('<div class="cf-turnstile">Verify you are human</div>') })).toMatchObject({ code: "challenge", status: "blocked" }); const pdf = { ...vetuni, format: "pdf" as const }; expect(inspectSourcePayload(pdf, { finalUrl: "https://www.vetuni.cz/file.pdf", contentType: "text/html", body: new TextEncoder().encode("<html>not pdf</html>") })).toMatchObject({ code: "unexpected_mime" }); });
it("starý nebo neúplný parser zablokuje publikaci i archivaci", () => { const stale = inspectConnectorResult(source, { events: [{ academicYear: "2025/2026" }, { academicYear: "2025/2026" }] as NormalizedEvent[], warnings: [] }, new Date("2026-08-02T00:00:00Z")); expect(stale).toMatchObject({ code: "stale_academic_year", status: "needs_review" }); expect(sourceRunMayArchive("automatic_publish", { publishableCount: 2, reviewCount: 0, warningCount: 0, blocked: true })).toBe(false); expect(sourceRunMayArchive("automatic_publish", { publishableCount: 2, reviewCount: 0, warningCount: 1, blocked: false })).toBe(false); });
