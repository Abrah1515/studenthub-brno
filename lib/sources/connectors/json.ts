import type { ConnectorContext, ConnectorResult, NormalizedEvent } from "@/lib/sources/types";
import { academicYearFor, inferCategory, sha256 } from "@/lib/sources/normalize";

export async function parseJson(context: ConnectorContext): Promise<ConnectorResult> {
  const parsed = JSON.parse(new TextDecoder().decode(context.body)) as unknown;
  const rows = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed && Array.isArray((parsed as { events?: unknown[] }).events) ? (parsed as { events: unknown[] }).events : [];
  const warnings: string[] = []; const events: NormalizedEvent[] = [];
  for (const raw of rows) {
    const row = raw as Record<string, unknown>; const title = String(row.title || row.name || ""); const startValue = String(row.start_at || row.start || ""); const start = new Date(startValue);
    if (!title || Number.isNaN(start.getTime())) { warnings.push("JSON záznam bez názvu nebo platného data byl přesunut ke kontrole."); continue; }
    const externalId = String(row.external_id || row.id || await sha256(`${title}|${start.toISOString()}`)); const endValue = row.end_at || row.end; const end = endValue ? new Date(String(endValue)) : undefined;
    events.push({ externalId, title, description: String(row.description || ""), startAt: start.toISOString(), endAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : undefined, allDay: Boolean(row.all_day), timezone: "Europe/Prague", category: inferCategory(String(row.category || title)), academicYear: String(row.academic_year || academicYearFor(start)), universityId: context.source.universityId, facultyId: context.source.facultyId, sourceId: context.source.id, sourceUrl: context.source.sourceUrl, sourceUpdatedAt: row.updated_at ? String(row.updated_at) : undefined, sourceModifiedBasis: row.updated_at ? "explicit_school_update" : undefined, sourceHash: await sha256(JSON.stringify(row)), confidence: 0.98, status: "approved", lastVerifiedAt: context.checkedAt });
  }
  return { events, warnings };
}
