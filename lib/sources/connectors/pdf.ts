import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import { academicYearFor, inferCategory, parseCzechDateRange, sha256 } from "@/lib/sources/normalize";
import { academicYearFromText } from "@/lib/sources/discovery";
import { currentAcademicYear } from "@/lib/sources/validation";

const pdfMagic = new TextEncoder().encode("%PDF-");
function hasPdfHeader(body: Uint8Array) { return pdfMagic.every((byte, index) => body[index] === byte); }

type PdfParseOptions = { usedOcr?: boolean; documentAcademicYear?: string | null; suppressWarnings?: boolean };

function titleWithoutDates(line: string) {
  const date = /\d{1,2}\.\s*(?:\d{1,2}\.|[\p{L}]+)\s*(?:\d{4})?(?:\s*[-\u2013\u2014]\s*\d{1,2}\.\s*(?:\d{1,2}\.|[\p{L}]+)\s*\d{4})?/giu;
  return line.replace(date, " ").replace(/\b\d{1,2}:\d{2}\b/g, " ").replace(/[|;:\u2013\u2014-]+/g, " ").replace(/\s+/g, " ").trim();
}

function fallsWithinAcademicYear(startAt: string, endAt: string | undefined, academicYear: string) {
  const startYear = Number(academicYear.slice(0, 4));
  if (!Number.isInteger(startYear)) return false;
  const lowerBound = Date.UTC(startYear, 0, 1);
  const upperBound = Date.UTC(startYear + 1, 8, 1);
  const start = new Date(startAt).getTime();
  const end = new Date(endAt || startAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start >= lowerBound && end < upperBound && end >= start;
}

export async function parsePdfExtractedText(
  text: string,
  context: ConnectorContext,
  documentTitle = context.source.sourceDocumentTitle || "Oficiální PDF dokument",
  sourcePage = 1,
  options: PdfParseOptions = {},
): Promise<ConnectorResult> {
  const warnings: string[] = [];
  const normalizedText = text.replace(/\u00ad/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  const candidates = normalizedText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).flatMap((line) => {
    const parsed = parseCzechDateRange(line);
    if (!parsed) return [];
    const category = inferCategory(line);
    if (category === "Ostatní") return [];
    return [{ line, parsed, category, title: titleWithoutDates(line) || category }];
  });
  const inferredYears = new Set(candidates.map((candidate) => academicYearFor(new Date(candidate.parsed.start))));
  const documentAcademicYear = options.documentAcademicYear
    || context.source.academicYear
    || academicYearFromText(`${documentTitle}\n${normalizedText}`)
    || (inferredYears.size === 1 ? [...inferredYears][0] : null);
  const expectedAcademicYear = currentAcademicYear(new Date(context.checkedAt));
  const eligibleCandidates = documentAcademicYear ? candidates.filter((candidate) => fallsWithinAcademicYear(candidate.parsed.start, candidate.parsed.end, documentAcademicYear)) : candidates;
  const automatic = context.source.monitoringMode === "automatic_publish"
    && !options.usedOcr
    && documentAcademicYear === expectedAcademicYear
    && eligibleCandidates.length > 0;

  const events: NormalizedEvent[] = [];
  for (const candidate of eligibleCandidates) {
    const externalId = (await sha256(`${context.source.id}|${candidate.title}|${candidate.parsed.start}`)).slice(0, 32);
    events.push({
      externalId,
      title: candidate.title,
      description: automatic ? "Událost načtená z oficiálního fakultního harmonogramu." : "Návrh získaný z oficiálního PDF; čeká na kontrolu.",
      startAt: candidate.parsed.start,
      endAt: candidate.parsed.end,
      allDay: candidate.parsed.allDay,
      timezone: "Europe/Prague",
      category: candidate.category,
      academicYear: documentAcademicYear || academicYearFor(new Date(candidate.parsed.start)),
      universityId: context.source.universityId,
      facultyId: context.source.facultyId,
      sourceId: context.source.id,
      sourceUrl: context.source.sourceUrl,
      sourceDocumentTitle: documentTitle,
      sourcePage,
      sourceHash: await sha256(`${sourcePage}|${candidate.line}`),
      confidence: automatic ? Math.max(0.95, context.source.confidence || 0) : Math.min(context.source.confidence || 0.78, 0.82),
      status: automatic ? "approved" : "pending",
      lastVerifiedAt: context.checkedAt,
      originalText: candidate.line,
    });
  }

  if (!options.suppressWarnings) {
    if (!events.length) warnings.push("PDF neobsahuje strojově čitelný jistý termín; dokument vyžaduje ruční kontrolu nebo OCR.");
    else if (!automatic) warnings.push("PDF nesplnilo všechny podmínky pro automatické zveřejnění: aktuální rok, textová vrstva a jednoznačné datum.");
  }
  return { events, warnings, sourceText: normalizedText, documentTitle, normalizedHash: await sha256(normalizedText) };
}

type PositionedText = { text: string; x: number; y: number; width: number; hasEol: boolean };
function rowsFromItems(items: PositionedText[]) {
  const rows: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= 2);
    if (row) row.push(item); else rows.push([item]);
  }
  return rows.sort((a, b) => b[0].y - a[0].y).map((row) => row.sort((a, b) => a.x - b.x).map((item, index) => {
    if (!index) return item.text;
    const previous = row[index - 1];
    const gap = item.x - (previous.x + previous.width);
    return `${gap > 8 ? " | " : " "}${item.text}`;
  }).join("").replace(/\s+/g, " ").trim()).filter(Boolean);
}

async function ensurePdfNodeGlobals() {
  const globals = globalThis as unknown as Record<string, unknown>;
  if (globals.DOMMatrix && globals.Path2D && globals.ImageData) return;
  const canvas = await import("@napi-rs/canvas");
  globals.DOMMatrix ||= canvas.DOMMatrix;
  globals.Path2D ||= canvas.Path2D;
  globals.ImageData ||= canvas.ImageData;
}

export async function extractPdfText(body: Uint8Array) {
  await ensurePdfNodeGlobals();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: Uint8Array.from(body), useWorkerFetch: false, useSystemFonts: true, useWasm: false, disableFontFace: true, stopAtErrors: true });
  const document = await loading.promise;
  if (document.numPages > 250) {
    await loading.destroy();
    throw new Error("PDF má více než povolených 250 stran.");
  }
  const pages: Array<{ pageNumber: number; text: string }> = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const positioned: PositionedText[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      positioned.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width, hasEol: item.hasEOL });
    }
    pages.push({ pageNumber, text: rowsFromItems(positioned).join("\n") });
    page.cleanup();
  }
  const metadata = await document.getMetadata().catch(() => null);
  const rawTitle = metadata?.info && "Title" in metadata.info ? metadata.info.Title : undefined;
  await loading.destroy();
  return { pages, text: pages.map((page) => page.text).join("\n\n"), title: typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : undefined };
}

async function extractWithConfiguredOcr(body: Uint8Array) {
  const endpoint = process.env.OCR_ENDPOINT_URL?.trim();
  if (!endpoint) return null;
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("OCR_ENDPOINT_URL musí používat HTTPS.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const headers = new Headers({ "content-type": "application/pdf", accept: "application/json" });
    if (process.env.OCR_API_KEY) headers.set("authorization", `Bearer ${process.env.OCR_API_KEY}`);
    const response = await fetch(url, { method: "POST", headers, body: new Blob([Uint8Array.from(body)], { type: "application/pdf" }), signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`OCR služba odpověděla HTTP ${response.status}.`);
    const payload = await response.json() as { pages?: Array<{ pageNumber?: number; text?: string }> };
    const pages = (payload.pages || []).map((page, index) => ({ pageNumber: Number(page.pageNumber || index + 1), text: String(page.text || "").trim() })).filter((page) => page.text);
    if (!pages.length) throw new Error("OCR služba nevrátila text žádné stránky.");
    return pages;
  } finally { clearTimeout(timer); }
}

export async function parsePdf(context: ConnectorContext): Promise<ConnectorResult> {
  const mime = context.contentType.toLowerCase().split(";", 1)[0].trim();
  if (mime !== "application/pdf" && mime !== "application/octet-stream") throw new Error("Zdroj nevrátil povolený PDF MIME typ.");
  if (!hasPdfHeader(context.body)) throw new Error("Stažený dokument nemá platnou PDF hlavičku.");
  const extracted = await extractPdfText(context.body);
  let pages = extracted.pages;
  let usedOcr = false;
  if (extracted.text.replace(/\s/g, "").length < 80) {
    const ocrPages = await extractWithConfiguredOcr(context.body);
    if (ocrPages) { pages = ocrPages; usedOcr = true; }
  }
  const documentTitle = extracted.title || context.source.sourceDocumentTitle || "Oficiální PDF dokument";
  const documentAcademicYear = context.source.academicYear || academicYearFromText(`${documentTitle}\n${pages.map((page) => page.text).join("\n")}`);
  const effectiveContext: ConnectorContext = { ...context, source: { ...context.source, academicYear: documentAcademicYear } };
  const results = await Promise.all(pages.map((page) => parsePdfExtractedText(page.text, effectiveContext, documentTitle, page.pageNumber, { usedOcr, documentAcademicYear, suppressWarnings: true })));
  const events = results.flatMap((result) => result.events);
  const sourceText = pages.map((page) => `[strana ${page.pageNumber}]\n${page.text}`).join("\n\n");
  const warnings: string[] = [];
  if (usedOcr) warnings.push("Dokument byl zpracován OCR; nalezené termíny vyžadují ruční schválení.");
  else if (!pages.some((page) => page.text.trim())) warnings.push("Skenované PDF nemá textovou vrstvu a OCR služba není nakonfigurovaná; dokument zůstává v ruční frontě.");
  else if (!events.length) warnings.push("PDF neobsahuje žádný jednoznačně rozpoznaný akademický termín.");
  else if (events.some((event) => event.status !== "approved")) warnings.push("PDF nesplnilo všechny podmínky pro automatické zveřejnění: aktuální rok, textová vrstva a jednoznačné datum.");
  return { events, warnings, sourceText, documentTitle, normalizedHash: await sha256(sourceText) };
}
