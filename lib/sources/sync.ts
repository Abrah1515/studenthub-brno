import "server-only";
import type { NormalizedEvent } from "@/lib/sources/types";
import { runConnector } from "@/lib/sources/connectors";
import { semanticEventHash, sha256 } from "@/lib/sources/normalize";
import { contentSources, sourceById } from "@/lib/sources/registry";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { reconcileEvents, type ExistingEvent } from "@/lib/sources/reconcile";
import { getPublishedCity, getUniversityIdsForPublishedCity } from "@/lib/city-data";
import { evaluateSourcePublishPolicy, isSuspiciousMassChange, isTechnicalSourceIssueCode, semanticDocumentHash, SOURCE_PUBLISH_POLICY_VERSION, sourceRunMayArchive } from "@/lib/sources/publish-policy";
import { fetchSourcePayload } from "@/lib/sources/payload";
import { inspectConnectorResult, SourceBlockedError } from "@/lib/sources/validation";
import { foldSearchText } from "@/lib/search";
import { inferStudyYears } from "@/lib/study-years";
import { fajnFeedConfig } from "@/lib/job-feed/config";
import { releaseDisabledFajnSource, syncFajnJobFeed } from "@/lib/job-feed/sync";

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
export const normalizedEventToRow = (event: NormalizedEvent, approved = event.status === "approved") => ({ external_id: event.externalId, title: event.title, description: event.description, starts_at: event.startAt, ends_at: event.endAt || null, all_day: event.allDay, timezone: event.timezone, category: categoryCode(event.category), academic_year: event.academicYear, study_years: event.studyYears || inferStudyYears(event.originalText) || null, semester: semesterFor(event), university_id: event.universityId, faculty_id: event.facultyId, programme_id: event.programmeId || null, scope_type: event.programmeId ? "programme" : "faculty", school: event.universityId.toUpperCase(), faculty: event.facultyId, source_id: event.sourceId, source_name: "Oficiální veřejný zdroj", source_url: event.sourceUrl, source_document_title: event.sourceDocumentTitle || null, source_page: event.sourcePage || null, source_updated_at: event.sourceUpdatedAt || null, source_modified_at: event.sourceUpdatedAt || null, source_modified_basis: event.sourceModifiedBasis || (event.sourceUpdatedAt ? "explicit_school_update" : "first_detected"), source_hash: event.sourceHash, confidence: event.confidence, status: approved ? "approved" : "pending", verification_status: approved ? "verified" : "needs_review", last_verified_at: event.lastVerifiedAt, is_demo: false, is_cancelled: false, change_state: "unchanged" });
function categoryCode(category: NormalizedEvent["category"]) { const map: Record<NormalizedEvent["category"], string> = { "Začátek semestru": "semester_start", "Konec semestru": "semester_end", "Výuka": "teaching", "Registrace předmětů": "course_registration", "Zápis předmětů": "course_enrollment", "Zápis do seminárních skupin": "seminar_enrollment", "Změny zápisu": "enrollment_changes", "Zveřejnění rozvrhu": "timetable_release", "Zkouškové období": "exam", "Přihlášky ke státním zkouškám": "final_exam_application", "Prázdniny": "holiday", "Děkanské a rektorské volno": "dean_rector_leave", "Státní závěrečné zkoušky": "final_exam", "Odevzdání závěrečných prací": "thesis_deadline", "Imatrikulace": "matriculation", "Promoce": "graduation", "Praxe": "internship", "Fakultní akce": "faculty_event", "Ostatní": "other" }; return map[category]; }
async function eventFingerprint(event: NormalizedEvent) { return sha256([event.universityId, event.facultyId, event.academicYear, semesterFor(event), event.category, foldSearchText(event.title)].join("|")); }
async function screenCrossSourceConflicts(client: ReturnType<typeof createServiceClient>, events: NormalizedEvent[], httpModifiedAt: string | null) {
  if (!events.length) return { publishable: events, review: [] as NormalizedEvent[] };
  const proposed = await Promise.all(events.map(async (event) => ({ event, fingerprint: await eventFingerprint(event), modifiedAt: event.sourceUpdatedAt || httpModifiedAt, basis: event.sourceModifiedBasis || (httpModifiedAt ? "http_last_modified" : "first_detected") })));
  const { data, error } = await client.from("academic_events").select("id,source_id,source_modified_at,source_modified_basis,starts_at,ends_at,academic_year,duplicate_fingerprint,title").in("duplicate_fingerprint", proposed.map((item) => item.fingerprint)).neq("status", "archived");
  if (error) throw error;
  const publishable: NormalizedEvent[] = []; const review: NormalizedEvent[] = [];
  for (const item of proposed) {
    const competing = (data || []).find((row) => row.source_id !== item.event.sourceId && row.academic_year === item.event.academicYear && row.duplicate_fingerprint === item.fingerprint);
    if (!competing) { publishable.push(item.event); continue; }
    const sameSchedule = String(competing.starts_at) === item.event.startAt && String(competing.ends_at || "") === String(item.event.endAt || "");
    if (sameSchedule) continue;
    const { error: conflictError } = await client.from("academic_event_conflicts").insert({ event_id: competing.id, source_id: item.event.sourceId, competing_source_id: competing.source_id, academic_year: item.event.academicYear, fingerprint: item.fingerprint, existing_payload: competing, proposed_payload: item.event, existing_modified_at: competing.source_modified_at, proposed_modified_at: item.modifiedAt, decision_basis: item.basis, reason: "Zdroje uvádějí rozdílný termín; automatická politika konflikt nikdy sama nerozhodne.", status: "open" });
    if (conflictError && conflictError.code !== "23505") throw conflictError;
    review.push(item.event);
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
  if (source.sourceType === "job_feed" && !fajnFeedConfig().enabled) return releaseDisabledFajnSource(client, source);
  const startedAt = new Date().toISOString(); const { data: run, error: runError } = await client.from("source_sync_runs").insert({ source_id: source.id, city_id: source.cityId || cityId || null, status: "running", started_at: startedAt }).select("id").single(); if (runError) throw runError;
  try {
    if (source.sourceType === "job_feed") return await syncFajnJobFeed(client, source, run.id);
    const { data: storedSource } = await client.from("content_sources").select("etag,last_modified,content_hash,normalized_hash,last_document_url,requires_review,sync_status,enabled").eq("id", source.id).single();
    const { fetched, effectiveSource, discovered } = await fetchSourcePayload(source, { etag: storedSource?.etag, lastModified: storedSource?.last_modified });
    if (fetched.status === 304) { const finishedAt = new Date().toISOString(); if (!storedSource?.requires_review) await markPublishedEventsVerified(client, source.id, finishedAt); await client.from("content_sources").update({ last_checked_at: finishedAt, last_success_at: finishedAt, last_http_status: 304, consecutive_failures: 0, sync_status: storedSource?.requires_review ? "manual_review" : "not_modified", next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_message: null }).eq("id", source.id); await client.from("source_sync_runs").update({ status: "not_modified", finished_at: finishedAt, http_status: 304 }).eq("id", run.id); return { sourceId, status: "not_modified" as const }; }
    const contentHash = await sha256(fetched.body); if (contentHash === storedSource?.content_hash) { const finishedAt = new Date().toISOString(); if (!storedSource?.requires_review) await markPublishedEventsVerified(client, source.id, finishedAt); await client.from("content_sources").update({ last_checked_at: finishedAt, last_success_at: finishedAt, last_http_status: fetched.status, etag: fetched.etag, last_modified: fetched.lastModified, consecutive_failures: 0, sync_status: storedSource?.requires_review ? "manual_review" : "not_modified", next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_message: null }).eq("id", source.id); await client.from("source_sync_runs").update({ status: "not_modified", finished_at: finishedAt, http_status: fetched.status, content_hash: contentHash }).eq("id", run.id); return { sourceId, status: "not_modified" as const }; }
    const connectorResult = await runConnector({ source: effectiveSource, body: fetched.body, contentType: fetched.contentType, checkedAt: new Date().toISOString() });
    const deduplicatedEvents = [...new Map(connectorResult.events.map((event) => [event.externalId, event])).values()];
    const result = { ...connectorResult, events: await Promise.all(deduplicatedEvents.map(async (event) => ({ ...event, sourceHash: await semanticEventHash(event) }))) };
    const connectorIssue = inspectConnectorResult(effectiveSource, result);
    const normalizedHash = await semanticDocumentHash(result.events);
    const { error: snapshotError } = await client.from("source_snapshots").upsert({ source_id: source.id, sync_run_id: run.id, content_hash: contentHash, normalized_hash: normalizedHash, content_type: fetched.contentType, document_title: result.documentTitle || source.sourceDocumentTitle || null, extracted_text: result.sourceText || null, content: `\\x${Buffer.from(fetched.body).toString("hex")}` }, { onConflict: "source_id,content_hash" });
    if (snapshotError) throw snapshotError;
    if (normalizedHash === storedSource?.normalized_hash) {
      const finishedAt = new Date().toISOString();
      if (!storedSource.requires_review) await markPublishedEventsVerified(client, source.id, finishedAt);
      await client.from("source_change_audits").insert({ source_id: source.id, sync_run_id: run.id, previous_content_hash: storedSource.content_hash || null, content_hash: contentHash, previous_normalized_hash: normalizedHash, normalized_hash: normalizedHash, inserted_count: 0, changed_count: 0, cancelled_count: 0, archived_count: 0, requires_review: Boolean(storedSource.requires_review), policy_version: SOURCE_PUBLISH_POLICY_VERSION, decision: "not_modified", decision_reason: "Stejný sémantický hash termínů; fronta se znovu nevytváří." });
      await client.from("content_sources").update({ last_checked_at: finishedAt, last_success_at: finishedAt, last_http_status: fetched.status, etag: fetched.etag, last_modified: fetched.lastModified, content_hash: contentHash, last_document_url: discovered?.url || effectiveSource.sourceUrl, last_final_url: fetched.finalUrl, last_content_type: fetched.contentType, sync_status: storedSource.requires_review ? "manual_review" : "not_modified", next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_message: null }).eq("id", source.id);
      await client.from("source_sync_runs").update({ status: "not_modified", finished_at: finishedAt, http_status: fetched.status, content_hash: contentHash, discovered_count: result.events.length }).eq("id", run.id);
      return { sourceId, status: "not_modified" as const };
    }
    const { data: existingRows, error: existingError } = await client.from("academic_events").select("id,external_id,source_hash,manual_override,starts_at,ends_at,title,description,is_cancelled,academic_year,duplicate_fingerprint").eq("source_id", source.id); if (existingError) throw existingError;
    const policyInput = { sourceId: source.id, sourceEnabled: storedSource?.enabled === true, sourceRegistered: Boolean(sourceById(source.id)), monitoringMode: source.monitoringMode, format: effectiveSource.format, officialDomain: source.officialDomain, allowedDomains: source.allowedDomains || [], finalUrl: fetched.finalUrl, contentType: fetched.contentType, extractionMethod: result.extractionMethod, sourceText: result.sourceText, universityId: source.universityId, facultyId: source.facultyId, events: result.events, warnings: result.warnings, issue: connectorIssue, now: new Date(startedAt) };
    let policy = evaluateSourcePublishPolicy(policyInput);
    let certain = policy.publishable;
    let uncertain = policy.review;
    let reviewWarnings = connectorIssue ? [...new Set([...result.warnings, connectorIssue.message])] : result.warnings;
    const httpModifiedAt = fetched.lastModified && Number.isFinite(new Date(fetched.lastModified).getTime()) ? new Date(fetched.lastModified).toISOString() : null;
    if (!connectorIssue && certain.length) {
      const screened = await screenCrossSourceConflicts(client, certain, httpModifiedAt);
      if (screened.review.length) {
        policy = evaluateSourcePublishPolicy({ ...policyInput, hasCrossSourceConflict: true });
        certain = []; uncertain = result.events;
        reviewWarnings = [...reviewWarnings, "Konflikt více oficiálních zdrojů vyžaduje ruční rozhodnutí."];
      } else certain = screened.publishable;
    }
    // Older connectors included the date in external_id. Preserve that deployed
    // identity once by matching the semantic fingerprint, then all future moves
    // are ordinary updates with version history and notifications.
    for (const event of certain) {
      if ((existingRows || []).some((row) => row.external_id === event.externalId)) continue;
      const fingerprint = await eventFingerprint(event); const legacy = (existingRows || []).find((row) => row.duplicate_fingerprint === fingerprint && row.external_id);
      if (legacy) event.externalId = String(legacy.external_id);
    }
    let observedYears = new Set(certain.map((event) => event.academicYear));
    let comparableExisting = (existingRows || []).filter((row) => observedYears.has(String(row.academic_year)));
    let changes = reconcileEvents(comparableExisting as ExistingEvent[], certain);
    const movedCount = changes.updates.filter((event) => { const existing = comparableExisting.find((row) => row.external_id === event.externalId); return Boolean(existing && (String(existing.starts_at) !== event.startAt || String(existing.ends_at || "") !== String(event.endAt || ""))); }).length;
    const suspiciousMassChange = isSuspiciousMassChange({ existingCount: comparableExisting.length, archivedCount: changes.archived.length, movedCount });
    if (suspiciousMassChange) {
      policy = evaluateSourcePublishPolicy({ ...policyInput, suspiciousMassChange: true });
      certain = []; uncertain = result.events;
      reviewWarnings = [...reviewWarnings, "Podezřele rozsáhlé přesuny nebo rušení nebudou automaticky aplikovány."];
      observedYears = new Set(); comparableExisting = []; changes = reconcileEvents([], []);
    }
    if (certain.length) { const changedIds = new Set(changes.updates.map((event) => event.externalId)); const rows = await Promise.all(certain.map(async (event) => ({ ...normalizedEventToRow(event), duplicate_fingerprint: await eventFingerprint(event), source_modified_at: event.sourceUpdatedAt || httpModifiedAt, source_modified_basis: event.sourceModifiedBasis || (httpModifiedAt ? "http_last_modified" : "first_detected"), change_state: changedIds.has(event.externalId) ? "changed" : "unchanged" }))); const { error } = await client.from("academic_events").upsert(rows, { onConflict: "source_id,external_id" }); if (error) throw error; }
    if (policy.decision === "manual_review") {
      const { error: queueError } = await client.rpc("enqueue_source_review", { p_source_id: source.id, p_sync_run_id: run.id, p_proposed_payload: { events: uncertain, warnings: reviewWarnings, policy: { version: policy.policyVersion, reasons: policy.reasons, reasonMessages: policy.reasonMessages } }, p_source_text: result.sourceText || uncertain.map((event) => event.originalText).filter(Boolean).join("\n") || null, p_confidence: policy.minimumConfidence || source.confidence, p_source_document_title: result.documentTitle || source.sourceDocumentTitle || null, p_source_page: uncertain.length && new Set(uncertain.map((event) => event.sourcePage).filter(Boolean)).size === 1 ? uncertain[0].sourcePage : null, p_reason: policy.reasons[0] || connectorIssue?.code || "parser_warning", p_normalized_hash: normalizedHash, p_policy_version: policy.policyVersion });
      if (queueError) throw queueError;
    } else {
      const { error: closeError } = await client.from("source_review_queue").update({ status: "superseded", resolution_code: "newer_auto_published", reviewed_at: new Date().toISOString(), review_note: "Nahrazeno novější verzí, která splnila automatickou publikační politiku." }).eq("source_id", source.id).eq("status", "pending");
      if (closeError) throw closeError;
    }
    const now = Date.now();
    const oldEnded = (existingRows || []).filter((row) => !observedYears.has(String(row.academic_year)) && !row.manual_override && !row.is_cancelled && new Date(row.ends_at || row.starts_at).getTime() < now);
    const mayArchive = sourceRunMayArchive(source.monitoringMode, { publishableCount: certain.length, reviewCount: uncertain.length, warningCount: reviewWarnings.length, blocked: Boolean(connectorIssue), suspiciousMassChange });
    const archived = mayArchive ? [...changes.archived, ...oldEnded] : [];
    if (archived.length) await client.from("academic_events").update({ status: "archived", archived_at: new Date().toISOString(), change_state: "cancelled", is_cancelled: true }).in("id", archived.map((event) => event.id));
    const needsReview = policy.decision === "manual_review";
    await client.from("source_change_audits").insert({ source_id: source.id, sync_run_id: run.id, previous_content_hash: storedSource?.content_hash || null, content_hash: contentHash, previous_normalized_hash: storedSource?.normalized_hash || null, normalized_hash: normalizedHash, inserted_count: needsReview ? 0 : changes.inserts.length, changed_count: needsReview ? 0 : changes.updates.length, cancelled_count: archived.length, archived_count: archived.length, requires_review: needsReview, policy_version: policy.policyVersion, decision: policy.decision, decision_reason: needsReview ? policy.reasonMessages.join(" ") : "Aktuální strojově čitelný oficiální dokument splnil všechna pravidla automatického zveřejnění." });
    const finishedAt = new Date().toISOString(); await client.from("content_sources").update({ last_checked_at: finishedAt, last_changed_at: finishedAt, last_success_at: finishedAt, last_http_status: fetched.status, etag: fetched.etag, last_modified: fetched.lastModified, source_modified_at: httpModifiedAt, source_modified_basis: httpModifiedAt ? "http_last_modified" : "first_detected", content_hash: contentHash, normalized_hash: normalizedHash, confidence: result.events.length ? Math.min(...result.events.map((event) => event.confidence)) : source.confidence, requires_review: needsReview, last_document_url: discovered?.url || effectiveSource.sourceUrl, last_final_url: fetched.finalUrl, last_content_type: fetched.contentType, last_block_reason: connectorIssue?.message || null, academic_year: discovered?.academicYear || effectiveSource.academicYear || result.events[0]?.academicYear, consecutive_failures: 0, sync_status: needsReview ? "manual_review" : "success", next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_message: null }).eq("id", source.id);
    await client.from("source_sync_runs").update({ status: needsReview ? "review" : "success", finished_at: finishedAt, http_status: fetched.status, content_hash: contentHash, discovered_count: result.events.length, published_count: certain.length, review_count: uncertain.length, error_message: connectorIssue?.message || null }).eq("id", run.id);
    return { sourceId, status: needsReview ? "review" as const : "success" as const, published: certain.length, review: uncertain.length };
  } catch (error) {
    const message = syncErrorMessage(error); const finishedAt = new Date().toISOString();
    if (error instanceof SourceBlockedError) {
      const technical = isTechnicalSourceIssueCode(error.issue.code);
      if (!technical) {
        const { error: queueError } = await client.rpc("enqueue_source_review", { p_source_id: source.id, p_sync_run_id: run.id, p_proposed_payload: { events: [], warnings: [message], policy: { version: SOURCE_PUBLISH_POLICY_VERSION, reasons: [error.issue.code], reasonMessages: [message] } }, p_source_text: null, p_confidence: 0, p_source_document_title: source.sourceDocumentTitle || null, p_source_page: null, p_reason: error.issue.code, p_normalized_hash: null, p_policy_version: SOURCE_PUBLISH_POLICY_VERSION });
        if (queueError) throw queueError;
      }
      await client.from("source_sync_runs").update({ status: technical ? "failed" : "review", finished_at: finishedAt, error_message: message }).eq("id", run.id);
      await client.from("content_sources").update({ last_checked_at: finishedAt, ...(technical ? {} : { requires_review: true }), sync_status: technical ? error.issue.code : "manual_review", consecutive_failures: 0, last_block_reason: message, last_final_url: error.metadata.finalUrl || source.sourceUrl, last_content_type: error.metadata.contentType || null, next_check_at: nextCheckAt(finishedAt), next_retry_at: null, last_error_at: finishedAt, last_error_message: message }).eq("id", source.id);
      return { sourceId, status: error.issue.status, published: 0, review: 0 } as const;
    }
    await client.from("source_sync_runs").update({ status: "failed", finished_at: finishedAt, error_message: message }).eq("id", run.id);
    const { data: current } = await client.from("content_sources").select("consecutive_failures").eq("id", source.id).single(); const failures = Number(current?.consecutive_failures || 0) + 1;
    await client.from("content_sources").update({ last_checked_at: finishedAt, consecutive_failures: failures, sync_status: failures >= 3 ? "stale" : "failed", next_check_at: nextCheckAt(finishedAt), next_retry_at: retryAt(finishedAt, failures), last_error_at: finishedAt, last_error_message: message }).eq("id", source.id); throw error instanceof Error ? error : new Error(message, { cause: error });
  }
}

export async function syncEnabledSources(filters: { cityId?: string; universityId?: string } = {}) {
  const cityUniversities = filters.cityId ? await getUniversityIdsForPublishedCity(filters.cityId) : [];
  const selected = contentSources.filter((source) => source.enabled && (!filters.universityId || source.universityId === filters.universityId) && (!filters.cityId || source.cityId === filters.cityId || (!source.cityId && Boolean(source.universityId) && cityUniversities.includes(source.universityId!)))); const results: PromiseSettledResult<Awaited<ReturnType<typeof syncSource>>>[] = [];
  for (let index = 0; index < selected.length; index += 3) results.push(...await Promise.allSettled(selected.slice(index, index + 3).map((source) => syncSource(source.id, filters.cityId))));
  return results;
}

export async function syncDueSources(filters: { cityId?: string; universityId?: string; batchSize?: number } = {}) {
  if (!isSupabaseConfigured()) throw new Error("Synchronizace vyžaduje nakonfigurovaný Supabase projekt.");
  const client = createServiceClient();
  const { data, error } = await client.rpc("claim_due_content_sources", { batch_size: filters.batchSize || 3 });
  if (error) throw error;
  const allowedUniversities = filters.cityId ? await getUniversityIdsForPublishedCity(filters.cityId) : null;
  const ids = ((data || []) as { source_id: string }[]).map((row) => row.source_id).filter((id) => { const source = sourceById(id); return Boolean(source && (!filters.universityId || source.universityId === filters.universityId) && (!allowedUniversities || source.cityId === filters.cityId || (Boolean(source.universityId) && allowedUniversities.includes(source.universityId!)))); });
  return Promise.allSettled(ids.map((id) => syncSource(id, filters.cityId, { claimed: true })));
}
