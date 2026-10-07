import { XMLParser } from "fast-xml-parser";
import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import { academicYearFor, inferCategory, sha256 } from "@/lib/sources/normalize";

type XmlRecord = Record<string, unknown>;

function records(value: unknown): XmlRecord[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter((item): item is XmlRecord => Boolean(item) && typeof item === "object");
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return "";
  const record = value as XmlRecord;
  return text(record["#text"] ?? record.href ?? record.url ?? record.value);
}

function first(record: XmlRecord, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeEntryUrl(value: string, context: ConnectorContext) {
  try {
    const url = new URL(value);
    const allowed = [context.source.officialDomain, ...(context.source.allowedDomains || [])].map((host) => host.toLowerCase());
    return url.protocol === "https:" && allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : context.source.sourceUrl;
  } catch { return context.source.sourceUrl; }
}

export async function parseRssAtom(context: ConnectorContext): Promise<ConnectorResult> {
  const xml = new TextDecoder().decode(context.body);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", trimValues: true, parseTagValue: false });
  let root: XmlRecord;
  try { root = parser.parse(xml) as XmlRecord; }
  catch { return { events: [], warnings: ["XML zdroj není platný RSS nebo Atom dokument."] }; }

  const rssChannel = (root.rss as XmlRecord | undefined)?.channel as XmlRecord | undefined;
  const feed = root.feed as XmlRecord | undefined;
  const entries = rssChannel ? records(rssChannel.item) : records(feed?.entry);
  const events: NormalizedEvent[] = [];
  const warnings: string[] = [];

  for (const entry of entries) {
    const title = first(entry, ["title"]);
    const startValue = first(entry, ["dtstart", "start", "event:start", "pubDate", "published", "updated"]);
    const start = validDate(startValue);
    if (!title || !start) { warnings.push("Položka bez názvu nebo platného data byla přesunuta ke kontrole."); continue; }
    const endValue = first(entry, ["dtend", "end", "event:end"]);
    const end = validDate(endValue);
    const link = first(entry, ["link", "guid", "id"]);
    const description = first(entry, ["description", "summary", "content"]);
    const externalId = first(entry, ["guid", "id"]) || (await sha256(`${context.source.id}|${title}|${start.toISOString()}|${link}`)).slice(0, 40);
    const sourceHash = await sha256(`${externalId}|${title}|${start.toISOString()}|${end?.toISOString() || ""}|${description}`);
    events.push({
      externalId,
      title,
      description,
      startAt: start.toISOString(),
      endAt: end?.toISOString(),
      allDay: /^\d{4}-\d{2}-\d{2}$/.test(startValue),
      timezone: "Europe/Prague",
      category: inferCategory(`${title} ${description}`),
      academicYear: academicYearFor(start),
      universityId: context.source.universityId,
      facultyId: context.source.facultyId,
      sourceId: context.source.id,
      sourceUrl: safeEntryUrl(link, context),
      sourceUpdatedAt: first(entry, ["updated", "pubDate"]) || undefined,
      sourceModifiedBasis: first(entry, ["updated"]) ? "document_revision" : undefined,
      sourceHash,
      confidence: context.source.requiresReview ? 0.8 : 0.98,
      status: context.source.requiresReview ? "pending" : "approved",
      lastVerifiedAt: context.checkedAt,
      cityId: context.source.cityId,
    });
  }
  if (!events.length && !warnings.length) warnings.push("RSS/Atom zdroj neobsahoval žádnou událost.");
  return { events, warnings, sourceText: xml, extractionMethod: "structured" };
}
