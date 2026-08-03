import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import { academicYearFor, inferCategory, parseCzechDateRange, sha256 } from "@/lib/sources/normalize";

const pdfMagic = new TextEncoder().encode("%PDF-");
function hasPdfHeader(body: Uint8Array) { return pdfMagic.every((byte, index) => body[index] === byte); }

export async function parsePdfExtractedText(text: string, context: ConnectorContext, documentTitle = context.source.sourceDocumentTitle || "Oficiální PDF dokument"): Promise<ConnectorResult> {
  const events: NormalizedEvent[] = []; const warnings: string[] = [];
  const normalizedText = text.replace(/\u00ad/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  for (const line of normalizedText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const parsed = parseCzechDateRange(line); if (!parsed) continue; const category = inferCategory(line); if (category === "Ostatní") continue;
    const title = line.replace(/^.*?\d{4}\s*/, "").replace(/^[|;:\s–—-]+/, "").trim() || line; const externalId = (await sha256(`${context.source.id}|${title}|${parsed.start}`)).slice(0, 32);
    events.push({ externalId, title, description: "Návrh získaný z textové vrstvy oficiálního PDF; před publikací vyžaduje kontrolu.", startAt: parsed.start, endAt: parsed.end, allDay: parsed.allDay, timezone: "Europe/Prague", category, academicYear: context.source.academicYear || academicYearFor(new Date(parsed.start)), universityId: context.source.universityId, facultyId: context.source.facultyId, sourceId: context.source.id, sourceUrl: context.source.sourceUrl, sourceDocumentTitle: documentTitle, sourceHash: await sha256(line), confidence: Math.min(context.source.confidence || 0.78, 0.82), status: "pending", lastVerifiedAt: context.checkedAt, originalText: line });
  }
  warnings.push(events.length ? "PDF změny se z bezpečnostních důvodů nikdy nepublikují bez schválení editorem." : "PDF neobsahuje strojově čitelný jistý termín; dokument vyžaduje ruční kontrolu nebo OCR s nízkou důvěrou.");
  return { events, warnings, sourceText: normalizedText, documentTitle, normalizedHash: await sha256(normalizedText) };
}

type PositionedText = { text: string; x: number; y: number; width: number; hasEol: boolean };
function rowsFromItems(items: PositionedText[]) {
  const rows: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - item.y) <= 2); if (row) row.push(item); else rows.push([item]);
  }
  return rows.sort((a, b) => b[0].y - a[0].y).map((row) => row.sort((a, b) => a.x - b.x).map((item, index) => {
    if (!index) return item.text; const previous = row[index - 1]; const gap = item.x - (previous.x + previous.width); return `${gap > 8 ? " | " : " "}${item.text}`;
  }).join("").replace(/\s+/g, " ").trim()).filter(Boolean);
}

export async function extractPdfText(body: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: Uint8Array.from(body), useWorkerFetch: false, useSystemFonts: true, useWasm: false, disableFontFace: true, stopAtErrors: true });
  const document = await loading.promise;
  if (document.numPages > 250) { await loading.destroy(); throw new Error("PDF má více než povolených 250 stran."); }
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber); const content = await page.getTextContent(); const positioned: PositionedText[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      positioned.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width, hasEol: item.hasEOL });
    }
    pages.push(rowsFromItems(positioned).join("\n")); page.cleanup();
  }
  const metadata = await document.getMetadata().catch(() => null); const rawTitle = metadata?.info && "Title" in metadata.info ? metadata.info.Title : undefined;
  await loading.destroy();
  return { text: pages.join("\n\n"), title: typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : undefined };
}

export async function parsePdf(context: ConnectorContext): Promise<ConnectorResult> {
  const mime = context.contentType.toLowerCase().split(";", 1)[0].trim();
  if (mime !== "application/pdf" && mime !== "application/octet-stream") throw new Error("Zdroj nevrátil povolený PDF MIME typ.");
  if (!hasPdfHeader(context.body)) throw new Error("Stažený dokument nemá platnou PDF hlavičku.");
  const extracted = await extractPdfText(context.body);
  return parsePdfExtractedText(extracted.text, context, extracted.title || context.source.sourceDocumentTitle);
}
