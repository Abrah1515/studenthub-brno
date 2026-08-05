import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseHtml } from "@/lib/sources/connectors/html";
import { parseIcs } from "@/lib/sources/connectors/ics";
import { parsePdf, parsePdfExtractedText } from "@/lib/sources/connectors/pdf";
import { contentSources } from "@/lib/sources/registry";
import { parseCzechDateRange, sha256, zonedDateTimeToIso } from "@/lib/sources/normalize";
import { reconcileEvents } from "@/lib/sources/reconcile";
import { discoverAcademicDocument } from "@/lib/sources/discovery";
import type { ConnectorContext, NormalizedEvent } from "@/lib/sources/types";
import { fitCalendarSourceForYear, fsiCalendarSourceForYear, inspectConnectorResult, inspectSourcePayload } from "@/lib/sources/validation";
import { sourceRunMayArchive } from "@/lib/sources/publish-policy";

const source = { ...contentSources.find((item) => item.id === "src-vut-fit")!, enabled: true };
const context = (body: Uint8Array): ConnectorContext => ({ source, body, contentType: "text/plain", checkedAt: "2026-08-01T10:00:00Z" });
const pdfContext = (body: Uint8Array): ConnectorContext => ({ source: { ...source, format: "pdf", requiresReview: true }, body, contentType: "application/pdf", checkedAt: "2026-08-01T10:00:00Z" });

describe("konektory veřejných zdrojů", () => {
  it("normalizuje ICS včetně exkluzivního celodenního konce", async () => { const body = await readFile("tests/fixtures/calendar.ics"); const result = await parseIcs(context(body)); expect(result.events).toHaveLength(1); expect(result.events[0]).toMatchObject({ externalId: "fit-teaching-2026", allDay: true, category: "Výuka", status: "approved" }); expect(result.events[0].startAt).toBe("2026-09-13T22:00:00.000Z"); expect(result.events[0].endAt).toBe("2026-12-11T22:59:00.000Z"); });
  it("z konzervativního HTML přijme jen známé akademické kategorie", async () => { const body = await readFile("tests/fixtures/calendar.html"); const result = await parseHtml(context(body)); expect(result.events.map((item) => item.category)).toEqual(["Výuka", "Zkouškové období"]); expect(result.events.every((item) => item.confidence >= .9)).toBe(true); });
  it("PDF ponechá vždy ve frontě ruční kontroly", async () => { const text = await readFile("tests/fixtures/calendar-pdf.txt", "utf8"); const result = await parsePdfExtractedText(text, context(new Uint8Array())); expect(result.events).toHaveLength(2); expect(result.events.every((item) => item.status === "pending" && item.confidence < .9)).toBe(true); expect(result.warnings).toHaveLength(1); });
  it("PDF zachová skutečné číslo stránky v události i hashi", async () => { const text = await readFile("tests/fixtures/calendar-pdf.txt", "utf8"); const first = await parsePdfExtractedText(text, context(new Uint8Array()), "Harmonogram", 3); const second = await parsePdfExtractedText(text, context(new Uint8Array()), "Harmonogram", 4); expect(first.events.every((item) => item.sourcePage === 3)).toBe(true); expect(first.events[0].sourceHash).not.toBe(second.events[0].sourceHash); });
  it("extrahuje textové PDF a zachová původní řádek", async () => { const result = await parsePdf(pdfContext(await readFile("tests/fixtures/calendar-text.pdf"))); expect(result.events).toHaveLength(2); expect(result.events.every((item) => item.originalText && item.sourceDocumentTitle)).toBe(true); expect(result.normalizedHash).toMatch(/^[a-f0-9]{64}$/); });
  it("spojí buňky tabulkového PDF do čitelného řádku", async () => { const result = await parsePdf(pdfContext(await readFile("tests/fixtures/calendar-table.pdf"))); expect(result.events.map((item) => item.category)).toEqual(["Výuka", "Zkouškové období"]); });
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
it("odděluje publikační, review a nenalezený monitorovaný režim", () => { expect(contentSources.filter((item) => item.monitoringMode === "automatic_publish")).toHaveLength(15); expect(contentSources.filter((item) => item.monitoringMode === "automatic_review")).toHaveLength(11); expect(contentSources.filter((item) => item.monitoringMode === "not_found_monitored")).toHaveLength(1); });
it("zdroj bez harmonogramu nic nevymýšlí, ale zůstává monitorovaný", () => { const missing = contentSources.find((item) => item.monitoringMode === "not_found_monitored"); expect(missing).toMatchObject({ enabled: true, confidence: 0, requiresReview: true, parserKey: "not-found-monitor" }); });
it("FIT odvodí URL z aktuálního akademického roku bez hardcodování", () => { const fit = fitCalendarSourceForYear(source, new Date("2026-08-02T00:00:00Z")); expect(fit.sourceUrl).toBe("https://www.fit.vut.cz/study/calendar/2026/.cs"); expect(fit.academicYear).toBe("2026/2027"); expect(fitCalendarSourceForYear(source, new Date("2027-02-02T00:00:00Z")).sourceUrl).toContain("/2026/.cs"); });
it("FSI předá aktuální akademický rok explicitně a nebere starý výchozí plán", () => { const fsi = contentSources.find((item) => item.id === "src-vut-fsi")!; expect(fsiCalendarSourceForYear(fsi, new Date("2026-08-02T00:00:00Z"))).toMatchObject({ sourceUrl: "https://www.fme.vutbr.cz/studenti/plan?degree=0&mode=0&year=2026", academicYear: "2026/2027" }); });
it("rozpozná VETUNI Turnstile a HTML vydávané za PDF", () => { const vetuni = contentSources.find((item) => item.id === "src-vetuni-fvl")!; expect(inspectSourcePayload(vetuni, { finalUrl: "https://www.vetuni.cz/turnstile.php?from=x", contentType: "text/html", body: new TextEncoder().encode('<div class="cf-turnstile">Verify you are human</div>') })).toMatchObject({ code: "challenge", status: "blocked" }); const pdf = { ...vetuni, format: "pdf" as const }; expect(inspectSourcePayload(pdf, { finalUrl: "https://www.vetuni.cz/file.pdf", contentType: "text/html", body: new TextEncoder().encode("<html>not pdf</html>") })).toMatchObject({ code: "unexpected_mime" }); });
it("starý nebo neúplný parser zablokuje publikaci i archivaci", () => { const stale = inspectConnectorResult(source, { events: [{ academicYear: "2025/2026" }, { academicYear: "2025/2026" }] as NormalizedEvent[], warnings: [] }, new Date("2026-08-02T00:00:00Z")); expect(stale).toMatchObject({ code: "stale_academic_year", status: "needs_review" }); expect(sourceRunMayArchive("automatic_publish", { publishableCount: 2, reviewCount: 0, warningCount: 0, blocked: true })).toBe(false); expect(sourceRunMayArchive("automatic_publish", { publishableCount: 2, reviewCount: 0, warningCount: 1, blocked: false })).toBe(false); });
