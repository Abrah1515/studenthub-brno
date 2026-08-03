import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import { academicYearFor, inferCategory, sha256, zonedDateTimeToIso } from "@/lib/sources/normalize";

function unescapeIcs(value: string) { return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\"); }
function property(block: string, name: string) { const line = block.split(/\r?\n/).find((entry) => entry.split(":", 1)[0].split(";", 1)[0] === name); if (!line) return undefined; return { meta: line.slice(0, line.indexOf(":")), value: unescapeIcs(line.slice(line.indexOf(":") + 1)) }; }
function parseIcsDate(entry?: { meta: string; value: string }) {
  if (!entry) return undefined;
  const value = entry.value.trim();
  if (/^\d{8}$/.test(value)) return { iso: zonedDateTimeToIso(Number(value.slice(0, 4)), Number(value.slice(4, 6)), Number(value.slice(6, 8))), allDay: true };
  if (/^\d{8}T\d{6}Z$/.test(value)) return { iso: new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`).toISOString(), allDay: false };
  if (/^\d{8}T\d{6}$/.test(value)) return { iso: zonedDateTimeToIso(Number(value.slice(0, 4)), Number(value.slice(4, 6)), Number(value.slice(6, 8)), Number(value.slice(9, 11)), Number(value.slice(11, 13))), allDay: false };
  return undefined;
}

export async function parseIcs(context: ConnectorContext): Promise<ConnectorResult> {
  const unfolded = new TextDecoder().decode(context.body).replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  const warnings: string[] = [];
  const events: NormalizedEvent[] = [];
  for (const block of blocks) {
    const uid = property(block, "UID")?.value; const title = property(block, "SUMMARY")?.value; const start = parseIcsDate(property(block, "DTSTART")); const end = parseIcsDate(property(block, "DTEND"));
    if (!uid || !title || !start) { warnings.push("Událost bez UID, názvu nebo začátku byla přesunuta ke kontrole."); continue; }
    const normalizedEnd = start.allDay && end?.allDay ? new Date(new Date(end.iso).getTime() - 60_000).toISOString() : end?.iso;
    const sourceHash = await sha256(`${uid}|${title}|${start.iso}|${normalizedEnd || ""}`);
    events.push({ externalId: uid, title, description: property(block, "DESCRIPTION")?.value || "", startAt: start.iso, endAt: normalizedEnd, allDay: start.allDay, timezone: "Europe/Prague", category: inferCategory(title), academicYear: academicYearFor(new Date(start.iso)), universityId: context.source.universityId, facultyId: context.source.facultyId, sourceId: context.source.id, sourceUrl: context.source.sourceUrl, sourceUpdatedAt: property(block, "LAST-MODIFIED")?.value, sourceHash, confidence: 1, status: "approved", lastVerifiedAt: context.checkedAt });
  }
  return { events, warnings };
}
