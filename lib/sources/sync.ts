import "server-only";
import type { NormalizedEvent } from "@/lib/sources/types";
import { runConnector } from "@/lib/sources/connectors";
import { sha256 } from "@/lib/sources/normalize";
import { contentSources, sourceById } from "@/lib/sources/registry";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { reconcileEvents, type ExistingEvent } from "@/lib/sources/reconcile";
import { getPublishedCity, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { partitionEventsForMonitoring, sourceRunMayArchive } from "@/lib/sources/publish-policy";
import { fetchSourcePayload } from "@/lib/sources/payload";
import { inspectConnectorResult, SourceBlockedError } from "@/lib/sources/validation";
import { decideSourceConflict, type ModificationBasis } from "@/lib/sources/conflict-resolution";
import { foldSearchText } from "@/lib/search";

function semesterFor(event: NormalizedEvent) { const month = new Date(event.startAt).getMonth() + 1; return month >= 8 ? "autumn" : month <= 2 ? "autumn" : "spring"; }
function syncErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const details = ["message", "details", "hint", "code"].map((key) => typeof value[key] === "string" && value[key] ? `${key}: ${value[key]}` : "").filter(Boolean);
    if (details.length) return details.join("; ");
  }
  return "Neznámá chyba synchronizace.";
}
export const normalizedEventToRow = (event: NormalizedEvent, approved = event.status === "approved") => ({ external_id: event.externalId, title: event.title, description: event.description, starts_at: event.startAt, ends_at: event.endAt || null, all_day: event.allDay, timezone: event.timezone, category: categoryCode(event.category), academic_year: event.academicYear, semester: semesterFor(event), university_id: event.universityId, faculty_id: event.facultyId, programme_id: event.programmeId || null, scope_type: event.programmeId ? "programme" : "faculty", school: event.universityId.toUpperCase(), faculty: event.facultyId, source_id: event.sourceId, source_name: "Oficiální veřejný zdroj", source_url: event.sourceUrl, source_document_title: event.sourceDocumentTitle || null, source_page: event.sourcePage || null, source_updated_at: event.sourceUpdatedAt || null, source_modified_at: event.sourceUpdatedAt || null, source_modified_basis: event.sourceModifiedBasis || (event.sourceUpdatedAt ? "explicit_school_update" : "first_detected"), source_hash: event.sourceHash, confidence: event.confidence, status: approved ? "approved" : "pending", verification_status: approved ? "verified" : "needs_review", last_verified_at: event.lastVerifiedAt, is_demo: false, is_cancelled: false, change_state: "unchanged" });
function categoryCode(category: NormalizedEvent["category"]) { const map: Record<NormalizedEvent["category"], string> = { "Začátek semestru": "semester_start", "Konec semestru": "semester_end", "Výuka": "teaching", "Registrace předmětů": "course_registration", "Zápis předmětů": "course_enrollment", "Změny zápisu": "enrollment_changes", "Zveřejnění rozvrhu": "timetable_release", "Zkouškové období": "exam", "Prázdniny": "holiday", "Státní závěrečné zkoušky": "final_exam", "Odevzdání závěrečných prací": "thesis_deadline", "Imatrikulace": "matriculation", "Promoce": "graduation", "Praxe": "internship", "Fakultní akce": "faculty_event", "Ostatní": "other" }; return map[category]; }
async function eventFingerprint(event: NormalizedEvent) { return sha256([event.universityId, event.facultyId, event.academicYear, semesterFor(event), event.category, foldSearchText(event.title)].join("|")); }
async function screenCrossSourceConflicts(client: ReturnType<typeof createServiceClient>, events: NormalizedEvent[], httpModifiedAt: string | null) {
  if (!events.length) return { publishable: events, review: [] as NormalizedEvent[] };
  const proposed = await Promise.all(events.map(async (event) => ({ event, fingerprint: await eventFingerprint(event), row: normalizedEventToRow(event), modifiedAt: event.sourceUpdatedAt || httpModifiedAt, basis: (event.sourceModifiedBasis || (httpModifiedAt ? "http_last_modified" : "first_detected")) as ModificationBasis })));
  const { data, error } = await client.from("academic_events").select("id,source_id,source_modified_at,source_modified_basis,starts_at,ends_at,academic_year,duplicate_fingerprint,title").in("duplicate_fingerprint", proposed.map((item) => item.fingerprint)).neq("status", "archived");
  if (error) throw error;
  const publishable: NormalizedEvent[] = []; const review: NormalizedEvent[] = [];
  for (const item of proposed) {
    const competing = (data || []).find((row) => row.source_id !== item.event.sourceId && row.academic_year === item.event.academicYear && row.duplicate_fingerprint === item.fingerprint);
    if (!competing) { publishable.push(item.event); continue; }
    const sameSchedule = String(competing.starts_at) === item.event.startAt && String(competing.ends_at || "") === String(item.event.endAt || "");
    if (sameSchedule) continue;
    const decision = decideSourceConflict({ modifiedAt: competing.source_modified_at, basis: competing.source_modified_basis as ModificationBasis | null }, { modifiedAt: item.modifiedAt, basis: item.basis });
    if (decision === "proposed") {
      const { error: updateError } = await client.from("academic_events").update({ ...item.row, duplicate_fingerprint: item.fingerprint, source_modified_at: item.modifiedAt, source_modified_basis: item.basis }).eq("id", competing.id); if (updateError) throw updateError;
      publishable.push(item.event); continue;
    }
    if (decision === "needs_review") {
      const { error: conflictError } = await client.from("academic_event_conflicts").insert({ event_id: competing.id, source_id: item.event.sourceId, competing_source_id: competing.source_id, academic_year: item.event.academicYear, fingerprint: item.fingerprint, existing_payload: competing, proposed_payload: item.event, existing_modified_at: competing.source_modified_at, proposed_modified_at: item.modifiedAt, decision_basis: item.basis, reason: "Zdroje uvádějí rozdílný termín bez jednoznačně prokazatelné novější revize.", status: "open" });
      if (conflictError && conflictError.code !== "23505") throw conflictError;
      review.push(item.event);
    }
  }
  return { publishable, review };
}
// A 20-minute dispatcher plus a nine-hour due time keeps temporary backlogs below 10 hours.
const nextCheckAt = (finishedAt: string, hours = 9) => new Date(new Date(finishedAt).getTime() + hours * 60 * 60 * 1000).toISOString();
const retryAt = (finishedAt: string, failures: number) => new Date(new Date(finishedAt).getTime() + Math.min(6 * 60, 15 * 2 ** Math.min(failures - 1, 5)) * 60 * 1000).toISOString();

async function markPublishedEventsVerified(client: ReturnType<typeof createServiceClient>, sourceId: string, verifiedAt: string) {
  const { error } = await client.from("academic_events").update({ last_verified_at: verifiedAt })
    .eq("source_id", sourceId).eq("status", "approved").eq("is_cancelled", false);
  if (error) throw error;
}

export async function syncSource(sourceId: string, cityId?: string, options: { claimed?: boolean } = {}) {
  if (!isSupabaseConfigured()) throw new Error("Synchronizace vyžaduje nakonfigurovaný Supabase projekt.");
  const source = sourceById(sourceId); if (!source) throw new Error("Neznámý datový zdroj."); if (!source.enabled) throw new Error("Monitoring zdroje je administrátorem vypnutý.");
  if (cityId && !await getPublishedCity(cityId)) throw new Error("Synchronizace pro neaktivní město je zakázaná.");
  if (cityId && source.cityId && source.cityId !== cityId) throw new Error("Zdroj nepatří do vybraného města.");
  const client = createServiceClient();
  if (!options.claimed) { const { data: claimed, error: claimError } = await client.rpc("claim_content_source", { source_key: source.id }); if (claimError) throw claimError; if (!claimed) return { sourceId, status: "busy" as const }; }
  const startedAt = new Date().toISOString(); const { data: run, error: runError } = await client.from("source_sync_runs").insert({ source_id: source.id, city_id: source.cityId || cityId || null, status: "running", started_at: startedAt }).select("id").single(); if (runError) throw runError;
  try {
    const { data: storedSource } = await client.from("content_sources").select("etag,last_modified,content_hash,normalized_hash,last_document_url").eq("id", source.id).single();
    const { fetched, effectiveSource, discovered } = await fetchSourcePayload(source, { etag: storedSource?.etag, lastModified: storedSource?.last_modified });
    if (fetched.status === 304) { const finishedAt = new Date().toISOString(); await markPublishedEventsVerified(client, source.id, finishedAt); await client.from("content_sources").update({ last_checked_at: finishedAt, last_success_at: finishedAt, last_http_status: 304, consecutive_failures: 0, sync_status: "not_modified", next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_message: null }).eq("id", source.id); await client.from("source_sync_runs").update({ status: "not_modified", finished_at: finishedAt, http_status: 304 }).eq("id", run.id); return { sourceId, status: "not_modified" as const }; }
    const contentHash = await sha256(fetched.body); if (contentHash === storedSource?.content_hash) { const finishedAt = new Date().toISOString(); await markPublishedEventsVerified(client, source.id, finishedAt); await client.from("content_sources").update({ last_checked_at: finishedAt, last_success_at: finishedAt, last_http_status: fetched.status, etag: fetched.etag, last_modified: fetched.lastModified, consecutive_failures: 0, sync_status: "not_modified", next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_message: null }).eq("id", source.id); await client.from("source_sync_runs").update({ status: "not_modified", finished_at: finishedAt, http_status: fetched.status, content_hash: contentHash }).eq("id", run.id); return { sourceId, status: "not_modified" as const }; }
    const result = await runConnector({ source: effectiveSource, body: fetched.body, contentType: fetched.contentType, checkedAt: new Date().toISOString() });
    const connectorIssue = inspectConnectorResult(effectiveSource, result);
    const normalizedHash = result.normalizedHash || await sha256(JSON.stringify(result.events.map((event) => ({ externalId: event.externalId, sourceHash: event.sourceHash }))));
    await client.from("source_snapshots").insert({ source_id: source.id, sync_run_id: run.id, content_hash: contentHash, normalized_hash: normalizedHash, content_type: fetched.contentType, document_title: result.documentTitle || source.sourceDocumentTitle || null, extracted_text: result.sourceText || null, content: `\\x${Buffer.from(fetched.body).toString("hex")}` });
    const { data: existingRows, error: existingError } = await client.from("academic_events").select("id,external_id,source_hash,manual_override,starts_at,ends_at,title,is_cancelled,academic_year").eq("source_id", source.id); if (existingError) throw existingError;
    const partition = partitionEventsForMonitoring(source.monitoringMode, result.events);
    let certain = connectorIssue ? [] : partition.publishable;
    let uncertain = connectorIssue ? result.events : partition.review;
    let reviewWarnings = connectorIssue ? [...result.warnings, connectorIssue.message] : result.warnings;
    const httpModifiedAt = fetched.lastModified && Number.isFinite(new Date(fetched.lastModified).getTime()) ? new Date(fetched.lastModified).toISOString() : null;
    if (!connectorIssue && certain.length) { const screened = await screenCrossSourceConflicts(client, certain, httpModifiedAt); certain = screened.publishable; uncertain = [...uncertain, ...screened.review]; if (screened.review.length) reviewWarnings = [...reviewWarnings, "Konflikt více oficiálních zdrojů vyžaduje ruční rozhodnutí."]; }
    const observedYears = new Set(certain.map((event) => event.academicYear));
    const comparableExisting = (existingRows || []).filter((row) => observedYears.has(String(row.academic_year)));
    const changes = reconcileEvents(comparableExisting as ExistingEvent[], certain);
    if (certain.length) { const changedIds = new Set(changes.updates.map((event) => event.externalId)); const rows = await Promise.all(certain.map(async (event) => ({ ...normalizedEventToRow(event), duplicate_fingerprint: await eventFingerprint(event), source_modified_at: event.sourceUpdatedAt || httpModifiedAt, source_modified_basis: event.sourceModifiedBasis || (httpModifiedAt ? "http_last_modified" : "first_detected"), change_state: changedIds.has(event.externalId) ? "changed" : "unchanged" }))); const { error } = await client.from("academic_events").upsert(rows, { onConflict: "source_id,external_id" }); if (error) throw error; }
    if (uncertain.length || reviewWarnings.length) await client.from("source_review_queue").insert({ source_id: source.id, sync_run_id: run.id, proposed_payload: { events: uncertain, warnings: reviewWarnings }, source_text: result.sourceText || uncertain.map((event) => event.originalText).filter(Boolean).join("\n") || null, confidence: uncertain.length ? Math.max(...uncertain.map((event) => event.confidence)) : source.confidence, source_document_title: result.documentTitle || source.sourceDocumentTitle || null, source_page: uncertain.length && new Set(uncertain.map((event) => event.sourcePage).filter(Boolean)).size === 1 ? uncertain[0].sourcePage : null, reason: connectorIssue?.code || (uncertain.length ? "low_confidence" : "parser_warning"), status: "pending" });
    const now = Date.now();
    const oldEnded = (existingRows || []).filter((row) => !observedYears.has(String(row.academic_year)) && !row.manual_override && !row.is_cancelled && new Date(row.ends_at || row.starts_at).getTime() < now);
    const mayArchive = sourceRunMayArchive(source.monitoringMode, { publishableCount: certain.length, reviewCount: uncertain.length, warningCount: reviewWarnings.length, blocked: Boolean(connectorIssue) });
    const archived = mayArchive ? [...changes.archived, ...oldEnded] : [];
    if (archived.length) await client.from("academic_events").update({ status: "archived", archived_at: new Date().toISOString(), change_state: "cancelled", is_cancelled: true }).in("id", archived.map((event) => event.id));
    await client.from("source_change_audits").insert({ source_id: source.id, sync_run_id: run.id, previous_content_hash: storedSource?.content_hash || null, content_hash: contentHash, previous_normalized_hash: storedSource?.normalized_hash || null, normalized_hash: normalizedHash, inserted_count: changes.inserts.length, changed_count: changes.updates.length, cancelled_count: archived.length, requires_review: Boolean(uncertain.length || reviewWarnings.length) });
    const needsReview = source.monitoringMode !== "automatic_publish" || Boolean(uncertain.length || reviewWarnings.length);
    const finishedAt = new Date().toISOString(); await client.from("content_sources").update({ last_checked_at: finishedAt, last_changed_at: finishedAt, last_success_at: finishedAt, last_http_status: fetched.status, etag: fetched.etag, last_modified: fetched.lastModified, source_modified_at: httpModifiedAt, source_modified_basis: httpModifiedAt ? "http_last_modified" : "first_detected", content_hash: contentHash, normalized_hash: normalizedHash, confidence: result.events.length ? Math.min(...result.events.map((event) => event.confidence)) : source.confidence, requires_review: needsReview, last_document_url: discovered?.url || effectiveSource.sourceUrl, last_final_url: fetched.finalUrl, last_content_type: fetched.contentType, last_block_reason: connectorIssue?.message || null, academic_year: discovered?.academicYear || effectiveSource.academicYear || result.events[0]?.academicYear, consecutive_failures: 0, sync_status: needsReview ? "manual_review" : "success", next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_message: null }).eq("id", source.id);
    await client.from("source_sync_runs").update({ status: needsReview ? "review" : "success", finished_at: finishedAt, http_status: fetched.status, content_hash: contentHash, discovered_count: result.events.length, published_count: certain.length, review_count: uncertain.length, error_message: connectorIssue?.message || null }).eq("id", run.id);
    return { sourceId, status: needsReview ? "review" as const : "success" as const, published: certain.length, review: uncertain.length };
  } catch (error) {
    const message = syncErrorMessage(error); const finishedAt = new Date().toISOString();
    if (error instanceof SourceBlockedError) {
      await client.from("source_review_queue").insert({ source_id: source.id, sync_run_id: run.id, proposed_payload: { events: [], warnings: [message], issue: error.issue.code }, source_text: null, confidence: 0, source_document_title: source.sourceDocumentTitle || null, reason: error.issue.code, status: "pending" });
      await client.from("source_sync_runs").update({ status: "review", finished_at: finishedAt, error_message: message }).eq("id", run.id);
      await client.from("content_sources").update({ last_checked_at: finishedAt, requires_review: true, sync_status: "manual_review", consecutive_failures: 0, last_block_reason: message, last_final_url: error.metadata.finalUrl || source.sourceUrl, last_content_type: error.metadata.contentType || null, next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_at: finishedAt, last_error_message: message }).eq("id", source.id);
      return { sourceId, status: error.issue.status, published: 0, review: 0 } as const;
    }
    await client.from("source_sync_runs").update({ status: "failed", finished_at: finishedAt, error_message: message }).eq("id", run.id);
    const { data: current } = await client.from("content_sources").select("consecutive_failures").eq("id", source.id).single(); const failures = Number(current?.consecutive_failures || 0) + 1;
    await client.from("content_sources").update({ last_checked_at: finishedAt, consecutive_failures: failures, sync_status: failures >= 3 ? "stale" : "failed", next_check_at: nextCheckAt(finishedAt), next_retry_at: retryAt(finishedAt, failures), last_error_at: finishedAt, last_error_message: message }).eq("id", source.id); throw error instanceof Error ? error : new Error(message, { cause: error });
  }
}

export async function syncEnabledSources(filters: { cityId?: string; universityId?: string } = {}) {
  const cityUniversities = filters.cityId ? await getUniversityIdsForPublishedCity(filters.cityId) : [];
  const selected = contentSources.filter((source) => source.enabled && (!filters.universityId || source.universityId === filters.universityId) && (!filters.cityId || source.cityId === filters.cityId || (!source.cityId && cityUniversities.includes(source.universityId)))); const results: PromiseSettledResult<Awaited<ReturnType<typeof syncSource>>>[] = [];
  for (let index = 0; index < selected.length; index += 3) results.push(...await Promise.allSettled(selected.slice(index, index + 3).map((source) => syncSource(source.id, filters.cityId))));
  return results;
}

export async function syncDueSources(filters: { cityId?: string; universityId?: string; batchSize?: number } = {}) {
  if (!isSupabaseConfigured()) throw new Error("Synchronizace vyžaduje nakonfigurovaný Supabase projekt.");
  const client = createServiceClient();
  const { data, error } = await client.rpc("claim_due_content_sources", { batch_size: filters.batchSize || 3 });
  if (error) throw error;
  const allowedUniversities = filters.cityId ? await getUniversityIdsForPublishedCity(filters.cityId) : null;
  const ids = ((data || []) as { source_id: string }[]).map((row) => row.source_id).filter((id) => { const source = sourceById(id); return Boolean(source && (!filters.universityId || source.universityId === filters.universityId) && (!allowedUniversities || source.cityId === filters.cityId || allowedUniversities.includes(source.universityId))); });
  return Promise.allSettled(ids.map((id) => syncSource(id, filters.cityId, { claimed: true })));
}
