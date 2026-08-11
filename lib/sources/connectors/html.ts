import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import { academicYearFor, inferCategory, parseCzechDateRange, sha256 } from "@/lib/sources/normalize";
import { parseIsAcademicPeriods, parseMendeluPef, parseVutSchedule } from "@/lib/sources/connectors/academic-tables";

function decodeHtml(value: string) { return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&ndash;|&mdash;/gi, "–").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/\s+/g, " ").trim(); }
function candidates(html: string) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => decodeHtml(match[1]));
  const items = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => decodeHtml(match[1]));
  return [...rows, ...items].filter((value) => /\d{1,2}\.\s*(?:\d{1,2}\.|[\p{L}]+)/iu.test(value));
}

export async function parseHtml(context: ConnectorContext): Promise<ConnectorResult> {
  const html = new TextDecoder().decode(context.body); const warnings: string[] = []; const events: NormalizedEvent[] = [];
  if (["muni-is-periods", "jamu-is-periods"].includes(context.source.parserKey)) return parseIsAcademicPeriods(context);
  if (context.source.parserKey === "mendelu-pef-html") return parseMendeluPef(context);
  if (["vut-fit-html", "vut-fsi-html"].includes(context.source.parserKey) && /\bc-schedule__item\b/i.test(html)) return parseVutSchedule(context);
  if (["linked-document-review", "linked-document-auto", "not-found-monitor"].includes(context.source.parserKey)) return { events, warnings: [context.source.monitoringMode === "not_found_monitored" ? "Veřejný harmonogram zatím nebyl nalezen; stránka zůstává monitorovaná." : "Na stránce nebyl nalezen jednoznačný aktuální dokument harmonogramu."] };
  for (const text of candidates(html)) {
    const parsed = parseCzechDateRange(text); if (!parsed) continue;
    const title = text.replace(/^(?:\d{1,2}\.\s*(?:\d{1,2}\.|[\p{L}]+)(?:\s*\d{4})?\s*(?:[-–—]\s*\d{1,2}\.\s*(?:\d{1,2}\.|[\p{L}]+)\s*\d{4})?\s*)/iu, "").replace(/^[-–—|:\s]+/, "").trim();
    if (title.length < 4) continue;
    const category = inferCategory(title); if (category === "Ostatní") continue;
    const externalId = (await sha256(`${context.source.id}|${title}|${parsed.start}`)).slice(0, 32);
    events.push({ externalId, title, description: "Událost načtená z veřejného oficiálního harmonogramu.", startAt: parsed.start, endAt: parsed.end, allDay: parsed.allDay, timezone: "Europe/Prague", category, academicYear: academicYearFor(new Date(parsed.start)), universityId: context.source.universityId, facultyId: context.source.facultyId, sourceId: context.source.id, sourceUrl: context.source.sourceUrl, sourceHash: await sha256(text), confidence: context.source.monitoringMode === "automatic_publish" ? 0.92 : 0.8, status: context.source.monitoringMode === "automatic_publish" ? "approved" : "pending", lastVerifiedAt: context.checkedAt });
  }
  if (!events.length) warnings.push("Parser nenašel žádnou dostatečně jistou událost; dokument čeká na kontrolu.");
  return { events, warnings };
}
