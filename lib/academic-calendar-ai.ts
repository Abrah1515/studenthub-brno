import "server-only";

import { getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { calendarConflictRecommendation, calendarDuplicateGroups, calendarEventDifferences, findCalendarEventMatch } from "@/lib/academic-calendar-ai-logic";
import { type ModificationBasis } from "@/lib/sources/conflict-resolution";
import { runConnector } from "@/lib/sources/connectors";
import { fetchSourcePayload } from "@/lib/sources/payload";
import { sourceById } from "@/lib/sources/registry";
import { sha256 } from "@/lib/sources/normalize";
import { eventFingerprint, normalizedEventToRow } from "@/lib/sources/sync";
import { currentAcademicYear, inspectConnectorResult, SourceBlockedError } from "@/lib/sources/validation";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

// The existing database tables keep their historical names so production data is preserved.
// New findings are separated from legacy AI findings without a destructive migration.
export const CALENDAR_REVIEW_VERSION = "source-comparison-v2";
type RunTrigger = "scheduled" | "manual";
type Row = Record<string, unknown>;
type Candidate = {
  fingerprint: string;
  sourceId: string;
  sourceUrl: string;
  eventId: string | null;
  universityId: string | null;
  facultyId: string | null;
  academicYear: string | null;
  termType: string | null;
  currentValue: Row;
  discoveredValue: Row;
  difference: string;
  confidence: number;
  recommendedAction: string;
  checkedAt: string;
  sourcePublishedAt: string | null;
  status?: "needs_review" | "cannot_verify";
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error || "Neznámá chyba");
}
export function findingFingerprint(sourceId: string, kind: string, externalId: string, value: unknown) {
  return sha256(JSON.stringify([CALENDAR_REVIEW_VERSION, sourceId, kind, externalId, value]));
}
function valueOf(row: Row) {
  return {
    title: row.title, description: row.description, startsAt: row.starts_at, endsAt: row.ends_at || null,
    category: row.category, semester: row.semester, academicYear: row.academic_year,
    studyYears: row.study_years || null, universityId: row.university_id, facultyId: row.faculty_id,
    sourceUrl: row.source_url,
  };
}
function emptyResult(status: "blocked", reason: string) {
  return { status, reason, sourceCount: 0, checkedSourceCount: 0, checkedEventCount: 0, findingCount: 0, unavailableSourceCount: 0, conflictCount: 0 };
}

export async function runAcademicCalendarAiCheck({ trigger, cityId = "brno", actorId = null, targetSourceId = null }: {
  trigger: RunTrigger; cityId?: string; actorId?: string | null; targetSourceId?: string | null;
}) {
  if (cityId !== "brno") return emptyResult("blocked", "Kontrola akademického kalendáře je dostupná pouze pro Brno.");
  if (!isSupabaseConfigured()) return emptyResult("blocked", "Supabase není nakonfigurovaný.");
  const client = createServiceClient();
  await client.from("academic_calendar_ai_runs").update({
    status: "failed", finished_at: new Date().toISOString(),
    error_message: "Předchozí běh se nedokončil v časovém limitu.",
  }).eq("city_id", cityId).eq("status", "running").lt("started_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { data: storedSources, error: sourceError } = await client.from("content_sources")
    .select("*").eq("source_type", "academic_calendar").eq("enabled", true);
  if (sourceError) throw sourceError;
  const universityIds = await getUniversityIdsForPublishedCity(cityId);
  const sources = (storedSources || []).filter((row) =>
    (row.city_id === cityId || (!row.city_id && universityIds.includes(String(row.university_id)))) &&
    (!targetSourceId || row.id === targetSourceId),
  ) as Row[];
  if (targetSourceId && !sources.length) return emptyResult("blocked", "Zvolený aktivní brněnský zdroj nebyl nalezen.");
  const sourceIds = sources.map((row) => String(row.id));
  const insert = await client.from("academic_calendar_ai_runs").insert({
    city_id: cityId, trigger_type: trigger, status: "running", started_at: new Date().toISOString(),
    source_count: sourceIds.length, created_by: actorId, ai_provider: CALENDAR_REVIEW_VERSION, ai_model: null,
  }).select("id").single();
  if (insert.error) {
    if (insert.error.code === "23505") return { ...emptyResult("blocked", "Jiná kontrola již probíhá."), sourceCount: sourceIds.length };
    throw insert.error;
  }
  const runId = String(insert.data.id);
  const finish = async (status: "blocked" | "completed" | "failed", values: Row, reason?: string) => {
    await client.from("academic_calendar_ai_runs").update({
      status, finished_at: new Date().toISOString(), ...values, error_message: reason || null,
    }).eq("id", runId);
    return { status, ...values, sourceCount: sourceIds.length, reason: reason || null };
  };
  const zero = { checked_source_count: 0, checked_event_count: 0, finding_count: 0, unavailable_source_count: 0, conflict_count: 0 };
  if (!sources.length) return finish("blocked", zero, "Nejsou nakonfigurované žádné aktivní akademické zdroje Brna.");

  try {
    // Supabase REST defaults to 1,000 rows. Read every current-year record before
    // considering an event missing; an incomplete DB page must never create findings.
    const currentEvents: Row[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await client.from("academic_events")
        .select("id,external_id,duplicate_fingerprint,title,description,starts_at,ends_at,category,semester,academic_year,study_years,university_id,faculty_id,programme_id,source_id,source_url,source_updated_at,source_modified_at,source_modified_basis,status,is_cancelled")
        .in("source_id", sourceIds).in("status", ["approved", "pending"])
        .eq("academic_year", currentAcademicYear()).order("id").range(offset, offset + 999);
      if (page.error) throw page.error;
      currentEvents.push(...(page.data || []) as Row[]);
      if ((page.data || []).length < 1000) break;
    }
    const candidates: Candidate[] = [];
    const checkedSourceIds = new Set<string>();
    let checkedSourceCount = 0;
    let checkedEventCount = 0;
    let unavailableSourceCount = 0;
    let conflictCount = 0;
    const year = currentAcademicYear();

    const sourceIssue = async (row: Row, kind: string, message: string, sourceUrl: string, discoveredValue: Row = {}) => {
      unavailableSourceCount += 1;
      candidates.push({
        fingerprint: await findingFingerprint(String(row.id), kind, year, null),
        sourceId: String(row.id), sourceUrl, eventId: null,
        universityId: String(row.university_id || "") || null, facultyId: String(row.faculty_id || "") || null,
        academicYear: year, termType: null, currentValue: {}, discoveredValue, difference: message,
        confidence: 0, recommendedAction: "Zdroj otevřít a ověřit ručně; uložené termíny neměnit.",
        checkedAt: new Date().toISOString(), sourcePublishedAt: null, status: "cannot_verify",
      });
    };
    const inspect = async (row: Row) => {
      const id = String(row.id);
      const registered = sourceById(id);
      if (!registered) {
        await sourceIssue(row, "unregistered", "Aktivní zdroj nemá podporovaný konektor.", String(row.source_url));
        return;
      }
      const source = {
        ...registered, sourceUrl: String(row.source_url || registered.sourceUrl), enabled: true,
        academicYear: String(row.academic_year || registered.academicYear || ""),
        confidence: Number(row.confidence || registered.confidence),
        requiresReview: Boolean(row.requires_review ?? registered.requiresReview),
      };
      try {
        const { fetched, effectiveSource } = await fetchSourcePayload(source);
        const result = await runConnector({ source: effectiveSource, body: fetched.body, contentType: fetched.contentType, checkedAt: new Date().toISOString() });
        const issue = inspectConnectorResult(effectiveSource, result);
        const existing = currentEvents.filter((event) => String(event.source_id) === id && event.status === "approved" && !event.is_cancelled);
        const sourceEvents = [...new Map(result.events.filter((event) => event.academicYear === year).map((event) => [event.externalId, event])).values()];
        checkedSourceCount += 1;
        if (issue || !sourceEvents.length || (existing.length >= 4 && sourceEvents.length < Math.ceil(existing.length * 0.6))) {
          await sourceIssue(row, issue?.code || "incomplete-current-year",
            issue?.message || "Aktuální akademický rok nebyl bezpečně ověřen nebo parser vrátil neúplný výsledek.",
            fetched.finalUrl || source.sourceUrl,
            { parsedCurrentYearCount: sourceEvents.length, savedEventCount: existing.length, finalUrl: fetched.finalUrl, contentType: fetched.contentType });
          return;
        }
        checkedSourceIds.add(id);
        const sourcePublishedAt = fetched.lastModified && Number.isFinite(Date.parse(fetched.lastModified))
          ? new Date(fetched.lastModified).toISOString() : null;
        const rows = currentEvents.filter((event) => String(event.source_id) === id && !event.is_cancelled);
        const usedIds = new Set<string>();
        let ambiguous = false;
        for (const event of sourceEvents) {
          const proposed = normalizedEventToRow(event);
          const identityFingerprint = await eventFingerprint(event);
          const match = findCalendarEventMatch(rows, usedIds, {
            externalId: event.externalId, duplicateFingerprint: identityFingerprint,
            title: event.title, category: proposed.category, semester: proposed.semester,
            academicYear: event.academicYear, universityId: event.universityId, facultyId: event.facultyId,
          });
          if (match.ambiguous) { ambiguous = true; continue; }
          const current = match.row;
          if (current) usedIds.add(String(current.id));
          // Pending changes already have a separate review queue; do not duplicate it here.
          if (current?.status === "pending") continue;
          if (!current) {
            // New source terms belong to the existing calendar import/review
            // workflow. This check only audits terms already in our list.
            continue;
          }
          checkedEventCount += 1;
          const discoveredValue = valueOf(proposed);
          const differences = calendarEventDifferences(current, proposed);
          if (!differences.length) continue;
          const { priority, recommendedAction } = calendarConflictRecommendation(
            { modifiedAt: String(current.source_modified_at || current.source_updated_at || "") || null, basis: (current.source_modified_basis || null) as ModificationBasis | null },
            { modifiedAt: event.sourceUpdatedAt || sourcePublishedAt, basis: event.sourceModifiedBasis || (sourcePublishedAt ? "http_last_modified" : "first_detected") },
          );
          candidates.push({
            fingerprint: await findingFingerprint(id, "changed", String(current.id), discoveredValue),
            sourceId: id, sourceUrl: fetched.finalUrl || source.sourceUrl, eventId: String(current.id),
            universityId: event.universityId, facultyId: event.facultyId,
            academicYear: event.academicYear, termType: event.category,
            currentValue: { ...valueOf(current), sourceModifiedAt: current.source_modified_at, sourceModifiedBasis: current.source_modified_basis },
            discoveredValue: { ...discoveredValue, sourceModifiedAt: event.sourceUpdatedAt || sourcePublishedAt, priority },
            difference: `Liší se: ${differences.join(", ")}.`,
            confidence: Math.min(event.confidence, 0.8), recommendedAction,
            checkedAt: new Date().toISOString(), sourcePublishedAt: event.sourceUpdatedAt || sourcePublishedAt,
          });
          conflictCount += 1;
        }
        // If identity matching is ambiguous, never infer missing/removed terms.
        if (ambiguous) {
          checkedSourceIds.delete(id);
          await sourceIssue(row, "ambiguous-identity", "Některé termíny nelze jednoznačně spárovat s kalendářem.", fetched.finalUrl || source.sourceUrl);
          // Even the proposed findings from this source are unsafe in this run.
          for (let index = candidates.length - 1; index >= 0; index--) {
            if (candidates[index].sourceId === id && candidates[index].status !== "cannot_verify") candidates.splice(index, 1);
          }
          return;
        }
        for (const current of existing) {
          if (usedIds.has(String(current.id))) continue;
          checkedEventCount += 1;
          candidates.push({
            fingerprint: await findingFingerprint(id, "removed", String(current.id), valueOf(current)),
            sourceId: id, sourceUrl: fetched.finalUrl || source.sourceUrl, eventId: String(current.id),
            universityId: String(current.university_id || row.university_id), facultyId: String(current.faculty_id || row.faculty_id),
            academicYear: year, termType: String(current.category || ""), currentValue: valueOf(current), discoveredValue: {},
            difference: "Uložený termín nebyl v aktuálním zdroji nalezen.",
            confidence: 0, recommendedAction: "Ručně ověřit zrušení nebo změnu dokumentu; nic automaticky nearchivovat.",
            checkedAt: new Date().toISOString(), sourcePublishedAt,
          });
        }
        const sourceFindingCount = candidates.filter((candidate) => candidate.sourceId === id && candidate.status !== "cannot_verify").length;
        if (existing.length >= 5 && sourceFindingCount > Math.ceil(existing.length * 0.4)) {
          checkedSourceIds.delete(id);
          for (let index = candidates.length - 1; index >= 0; index--) {
            if (candidates[index].sourceId === id && candidates[index].status !== "cannot_verify") candidates.splice(index, 1);
          }
          await sourceIssue(row, "mass-difference", "Zdroj se hromadně liší od uloženého kalendáře; jednotlivé změny vyžadují ruční posouzení.", fetched.finalUrl || source.sourceUrl,
            { savedEventCount: existing.length, differingEventCount: sourceFindingCount });
        }
      } catch (error) {
        const issue = error instanceof SourceBlockedError ? error.issue : null;
        await sourceIssue(row, issue?.code || "unavailable", issue?.message || "Zdroj se nepodařilo bezpečně ověřit.",
          error instanceof SourceBlockedError ? error.metadata.finalUrl || source.sourceUrl : source.sourceUrl,
          { code: issue?.code || "fetch_error", detail: issue?.message || errorMessage(error) });
      }
    };
    const queue = [...sources];
    while (queue.length) await Promise.all(queue.splice(0, 3).map(inspect));
    // A duplicate is relevant only when it is already in the published calendar.
    for (const [key, group] of calendarDuplicateGroups(currentEvents.filter((event) => event.status === "approved"))) {
      const first = group[0];
      if (!checkedSourceIds.has(String(first.source_id))) continue;
      if (!String(first.source_url || "").startsWith("https://")) continue;
      candidates.push({
        fingerprint: await findingFingerprint(String(first.source_id), "cross-source-duplicate", key, group.map((event) => String(event.id)).sort()),
        sourceId: String(first.source_id), sourceUrl: String(first.source_url), eventId: String(first.id),
        universityId: String(first.university_id || ""), facultyId: String(first.faculty_id || ""),
        academicYear: year, termType: String(first.category || ""),
        currentValue: { events: group.map((event) => ({ id: event.id, title: event.title, startsAt: event.starts_at, sourceUrl: event.source_url })) },
        discoveredValue: { duplicateCount: group.length },
        difference: "V kalendáři jsou stejné termíny z více oficiálních zdrojů.",
        confidence: 0.8, recommendedAction: "Porovnat oba zdroje a duplicitu vyřešit ručně.",
        checkedAt: new Date().toISOString(), sourcePublishedAt: null,
      });
      conflictCount += 1;
    }
    const rows = candidates.map((candidate) => ({
      run_id: runId, city_id: cityId, source_id: candidate.sourceId, academic_event_id: candidate.eventId,
      university_id: candidate.universityId, faculty_id: candidate.facultyId,
      academic_year: candidate.academicYear, term_type: candidate.termType,
      current_value: candidate.currentValue, discovered_value: candidate.discoveredValue,
      difference: candidate.difference, source_url: candidate.sourceUrl,
      source_published_at: candidate.sourcePublishedAt, checked_at: candidate.checkedAt,
      confidence: candidate.confidence, recommended_action: candidate.recommendedAction,
      ai_reason: CALENDAR_REVIEW_VERSION, status: candidate.status || "needs_review", fingerprint: candidate.fingerprint,
    }));
    if (rows.length) {
      const write = await client.from("academic_calendar_ai_findings").upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true });
      if (write.error) throw write.error;
      const fingerprints = rows.map((row) => row.fingerprint);
      for (let index = 0; index < fingerprints.length; index += 100) {
        const refreshed = await client.from("academic_calendar_ai_findings")
          .update({ checked_at: new Date().toISOString() })
          .eq("ai_reason", CALENDAR_REVIEW_VERSION)
          .in("fingerprint", fingerprints.slice(index, index + 100))
          .in("status", ["needs_review", "cannot_verify", "new"]);
        if (refreshed.error) throw refreshed.error;
      }
    }
    // Close only findings from sources fully verified in this run. A blocked or
    // partial source must never clear an earlier warning.
    for (const sourceId of checkedSourceIds) {
      const present = new Set(rows.filter((row) => row.source_id === sourceId).map((row) => row.fingerprint));
      const old = await client.from("academic_calendar_ai_findings")
        .select("id,fingerprint").eq("source_id", sourceId).eq("ai_reason", CALENDAR_REVIEW_VERSION)
        .in("status", ["new", "needs_review", "cannot_verify"]);
      if (old.error) throw old.error;
      const resolvedIds = (old.data || []).filter((item) => !present.has(item.fingerprint)).map((item) => item.id);
      if (resolvedIds.length) {
        const resolved = await client.from("academic_calendar_ai_findings").update({
          status: "resolved", resolution_note: "Rozdíl se při další úplné kontrole již nepotvrdil.", resolved_at: new Date().toISOString(),
        }).in("id", resolvedIds);
        if (resolved.error) throw resolved.error;
      }
    }
    return finish(unavailableSourceCount ? "blocked" : "completed", {
      checked_source_count: checkedSourceCount, checked_event_count: checkedEventCount,
      finding_count: rows.length, unavailable_source_count: unavailableSourceCount, conflict_count: conflictCount,
    }, unavailableSourceCount ? `${unavailableSourceCount} zdrojů se nepodařilo bezpečně ověřit.` : undefined);
  } catch (error) {
    return finish("failed", zero, errorMessage(error));
  }
}

export function calendarAiConfiguration() {
  return { enabled: true, configured: true, mode: "porovnání oficiálních zdrojů", intervalHours: 24 };
}
