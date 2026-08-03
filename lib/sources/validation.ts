import type { ConnectorResult, ContentSource } from "@/lib/sources/types";
import { academicYearFromText } from "@/lib/sources/discovery";

export type SourceIssueCode = "challenge" | "login_page" | "unexpected_mime" | "invalid_document" | "stale_academic_year" | "incomplete_result";
export type SourceIssue = { code: SourceIssueCode; status: "blocked" | "needs_review"; message: string };

export class SourceBlockedError extends Error {
  constructor(public readonly issue: SourceIssue, public readonly metadata: { finalUrl?: string; contentType?: string } = {}) {
    super(issue.message);
    this.name = "SourceBlockedError";
  }
}

export function currentAcademicStartYear(now = new Date()) {
  return now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function currentAcademicYear(now = new Date()) {
  const start = currentAcademicStartYear(now);
  return `${start}/${start + 1}`;
}

export function fitCalendarSourceForYear(source: ContentSource, now = new Date()): ContentSource {
  const year = currentAcademicStartYear(now); const url = new URL(source.sourceUrl);
  url.pathname = `/study/calendar/${year}/.cs`; url.search = ""; url.hash = "";
  return { ...source, sourceUrl: url.href, academicYear: `${year}/${year + 1}` };
}

export function fsiCalendarSourceForYear(source: ContentSource, now = new Date()): ContentSource {
  const year = currentAcademicStartYear(now); const url = new URL(source.sourceUrl);
  url.searchParams.set("degree", url.searchParams.get("degree") || "0");
  url.searchParams.set("mode", url.searchParams.get("mode") || "0");
  url.searchParams.set("year", String(year));
  url.hash = "";
  return { ...source, sourceUrl: url.href, academicYear: `${year}/${year + 1}` };
}

export function academicYearStart(value?: string | null) {
  const match = value?.match(/(20\d{2})\s*[\/_-]\s*(?:20)?\d{2}/);
  return match ? Number(match[1]) : null;
}

function normalizedMime(contentType: string) {
  return contentType.toLowerCase().split(";", 1)[0].trim();
}

export function expectedMimeFor(source: ContentSource) {
  if (source.format === "pdf") return "application/pdf";
  if (source.format === "ics") return "text/calendar";
  if (source.format === "json" || source.format === "api") return "application/json";
  if (source.format === "xml") return "application/xml";
  return "text/html";
}

export function inspectSourcePayload(source: ContentSource, payload: { finalUrl: string; contentType: string; body: Uint8Array }): SourceIssue | null {
  const mime = normalizedMime(payload.contentType);
  const expected = expectedMimeFor(source);
  const text = mime.includes("html") || mime.includes("text") ? new TextDecoder().decode(payload.body.slice(0, 256_000)) : "";
  const folded = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/\/turnstile\.php(?:\?|$)/i.test(payload.finalUrl) || /cf-turnstile|challenges\.cloudflare\.com|captcha-container|verify you are human|overte, ze nejste robot/i.test(folded)) {
    return { code: "challenge", status: "blocked", message: "Oficiální zdroj vrátil ochrannou challenge. Ochranu neobcházíme; změna vyžaduje ruční kontrolu." };
  }
  if (/<input\b[^>]*type=["']password["']/i.test(text) || /(?:prihlaste se|sign in).{0,120}(?:heslo|password)/i.test(folded)) {
    return { code: "login_page", status: "blocked", message: "Zdroj vrátil přihlašovací stránku místo veřejného akademického dokumentu." };
  }
  const mimeMatches = expected === "text/html" ? ["text/html", "application/xhtml+xml"].includes(mime)
    : expected === "application/xml" ? ["application/xml", "text/xml"].includes(mime)
      : expected === "application/json" ? mime === "application/json" || mime.endsWith("+json")
        : expected === "application/pdf" ? ["application/pdf", "application/octet-stream"].includes(mime)
          : mime === expected || (expected === "text/calendar" && mime === "text/plain");
  if (!mimeMatches) return { code: "unexpected_mime", status: "blocked", message: `Zdroj vrátil MIME ${mime || "neuvedeno"}, očekává se ${expected}.` };
  if (source.format === "pdf" && new TextDecoder().decode(payload.body.slice(0, 5)) !== "%PDF-") {
    return { code: "invalid_document", status: "blocked", message: "Odpověď nemá platnou PDF hlavičku." };
  }
  return null;
}

export function inspectConnectorResult(source: ContentSource, result: ConnectorResult, now = new Date()): SourceIssue | null {
  const minimum = source.parserKey === "mendelu-pef-html" ? 6 : source.parserKey === "vut-fit-html" ? 2 : 1;
  if (result.events.length < minimum || result.warnings.length) {
    return { code: "incomplete_result", status: "needs_review", message: result.warnings[0] || `Parser získal pouze ${result.events.length} z očekávaných alespoň ${minimum} událostí.` };
  }
  const detectedYears = result.events.map((event) => academicYearStart(event.academicYear)).filter((year): year is number => year !== null);
  const documentYear = academicYearStart(source.academicYear) ?? academicYearStart(academicYearFromText(`${source.sourceUrl} ${result.documentTitle || ""}`));
  if (documentYear !== null) detectedYears.push(documentYear);
  const newestYear = detectedYears.length ? Math.max(...detectedYears) : null;
  const expectedYear = currentAcademicStartYear(now);
  if (newestYear !== null && newestYear < expectedYear) {
    return { code: "stale_academic_year", status: "needs_review", message: `Parser získal akademický rok ${newestYear}/${newestYear + 1}; očekává se alespoň ${expectedYear}/${expectedYear + 1}.` };
  }
  return null;
}
