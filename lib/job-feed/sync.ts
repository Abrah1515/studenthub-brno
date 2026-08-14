import "server-only";
import type { ContentSource } from "@/lib/sources/types";
import { createServiceClient } from "@/lib/supabase-server";
import { fetchRegisteredSource } from "@/lib/sources/fetch-source";
import { sha256 } from "@/lib/sources/normalize";
import { fajnFeedConfig } from "@/lib/job-feed/config";
import { parseFajnXml, type ParsedFajnJob } from "@/lib/job-feed/fajn-parser";
import { planFajnImport, type ExistingFajnJob } from "@/lib/job-feed/reconcile";

type Client = ReturnType<typeof createServiceClient>;
const providerKey = "fajn-brigady";

function nextCheckAt(finishedAt: string, hours: number) { return new Date(new Date(finishedAt).getTime() + hours * 3_600_000).toISOString(); }
function xmlMime(value: string) { const mime = value.toLowerCase().split(";", 1)[0].trim(); return mime === "text/xml" || mime === "application/xml" || /^application\/[a-z0-9.+-]+\+xml$/.test(mime); }
function expiresAt(job: ParsedFajnJob, checkedAt: string) { return job.durationDays ? new Date(new Date(checkedAt).getTime() + job.durationDays * 86_400_000).toISOString() : null; }
function legacyRewardUnit(job: ParsedFajnJob) { return job.salaryUnit === "hour" ? "hour" : job.salaryUnit === "month" ? "month" : "fixed"; }
function jobRow(job: ParsedFajnJob, checkedAt: string) {
  return {
    provider_key: providerKey, external_id: job.externalId, title: job.title, company_name: job.company || null,
    field: job.field, work_type: job.workType, location: job.location, workplace_address: job.location === "Brno" ? null : job.location,
    reward_amount: job.salaryMin == null ? null : Math.floor(job.salaryMin), reward_unit: legacyRewardUnit(job), reward_min: job.salaryMin || null,
    reward_max: job.salaryMax || null, reward_currency: job.salaryCurrency || null, reward_period: job.salaryUnit || null,
    workload: job.workload, workload_codes: job.workloadCodes, benefit_codes: job.benefitCodes, description: job.description,
    contact_public: null, apply_url: job.applyUrl, source_url: job.applyUrl, country_external_id: job.countryExternalId || null,
    city_external_id: job.cityExternalId || null, position_external_id: job.positionExternalId || null,
    positions_count: job.positionsCount || null, duration_days: job.durationDays || null, source_hash: job.sourceHash,
    last_seen_at: checkedAt, last_verified_at: checkedAt, expires_at: expiresAt(job, checkedAt), city_id: "brno",
    work_location_mode: "onsite", status: "approved", verification_status: "verified", is_featured: false, is_demo: false,
  };
}

export async function releaseDisabledFajnSource(client: Client, source: ContentSource) {
  const config = fajnFeedConfig(); const checkedAt = new Date().toISOString();
  const { error } = await client.from("content_sources").update({ sync_status: "idle", last_checked_at: checkedAt, next_check_at: nextCheckAt(checkedAt, config.intervalHours), next_retry_at: null, last_error_message: config.statusReason }).eq("id", source.id);
  if (error) throw error;
  return { sourceId: source.id, status: "disabled" as const, reason: config.statusReason };
}

export async function syncFajnJobFeed(client: Client, source: ContentSource, runId: string) {
  const config = fajnFeedConfig(); if (!config.enabled || !config.feedUrl) throw new Error(config.statusReason);
  const { data: storedSource, error: storedError } = await client.from("content_sources").select("etag,last_modified,content_hash,normalized_hash").eq("id", source.id).single(); if (storedError) throw storedError;
  const feedSource: ContentSource = { ...source, sourceUrl: config.feedUrl, officialDomain: "media.fajnsprava.cz", allowedDomains: ["media.fajnsprava.cz"] };
  const fetched = await fetchRegisteredSource(feedSource, { etag: storedSource?.etag, lastModified: storedSource?.last_modified }); const checkedAt = new Date().toISOString();
  if (fetched.status !== 304 && !xmlMime(fetched.contentType)) throw new Error(`XML feed vrátil neočekávaný MIME typ ${fetched.contentType || "bez MIME"}.`);
  if (fetched.status === 304) {
    const { error: seenError } = await client.from("jobs").update({ last_seen_at: checkedAt, last_verified_at: checkedAt }).eq("provider_key", providerKey).eq("status", "approved"); if (seenError) throw seenError;
    await client.from("content_sources").update({ last_checked_at: checkedAt, last_success_at: checkedAt, last_http_status: 304, consecutive_failures: 0, sync_status: "not_modified", next_check_at: nextCheckAt(checkedAt, config.intervalHours), next_retry_at: null, last_error_message: null }).eq("id", source.id);
    await client.from("source_sync_runs").update({ status: "not_modified", finished_at: checkedAt, http_status: 304 }).eq("id", runId);
    return { sourceId: source.id, status: "not_modified" as const };
  }
  const contentHash = await sha256(fetched.body);
  if (contentHash === storedSource?.content_hash) {
    const { error: seenError } = await client.from("jobs").update({ last_seen_at: checkedAt, last_verified_at: checkedAt }).eq("provider_key", providerKey).eq("status", "approved"); if (seenError) throw seenError;
    await client.from("content_sources").update({ last_checked_at: checkedAt, last_success_at: checkedAt, last_http_status: fetched.status, etag: fetched.etag, last_modified: fetched.lastModified, consecutive_failures: 0, sync_status: "not_modified", next_check_at: nextCheckAt(checkedAt, config.intervalHours), next_retry_at: null, last_error_message: null }).eq("id", source.id);
    await client.from("source_sync_runs").update({ status: "not_modified", finished_at: checkedAt, http_status: fetched.status, content_hash: contentHash }).eq("id", runId);
    return { sourceId: source.id, status: "not_modified" as const };
  }
  const parsed = await parseFajnXml(fetched.body); if (!parsed.jobs.length) throw new Error("XML feed neobsahuje žádný bezpečně publikovatelný inzerát; poslední platná data zůstala beze změny.");
  const normalizedHash = await sha256(JSON.stringify(parsed.jobs.map(({ externalId, sourceHash }) => ({ externalId, sourceHash }))));
  const { error: snapshotError } = await client.from("source_snapshots").upsert({ source_id: source.id, sync_run_id: runId, content_hash: contentHash, normalized_hash: normalizedHash, content_type: fetched.contentType, document_title: "Smluvní XML feed pracovních nabídek", extracted_text: null, content: `\\x${Buffer.from(fetched.body).toString("hex")}` }, { onConflict: "source_id,content_hash" }); if (snapshotError) throw snapshotError;
  const { data: existingRows, error: existingError } = await client.from("jobs").select("id,external_id,source_hash,status").eq("provider_key", providerKey).not("external_id", "is", null); if (existingError) throw existingError;
  const plan = planFajnImport((existingRows || []) as ExistingFajnJob[], parsed.jobs, config.mode);
  const changedJobs = [...plan.inserts, ...plan.updates];
  if (changedJobs.length) { const { error: upsertError } = await client.from("jobs").upsert(changedJobs.map((job) => jobRow(job, checkedAt)), { onConflict: "provider_key,external_id" }); if (upsertError) throw upsertError; }
  if (plan.unchanged.length) { const { error: seenError } = await client.from("jobs").update({ last_seen_at: checkedAt, last_verified_at: checkedAt }).eq("provider_key", providerKey).in("external_id", plan.unchanged.map((job) => job.externalId)); if (seenError) throw seenError; }
  if (plan.archiveIds.length) { const { error } = await client.from("jobs").update({ status: "archived" }).in("id", plan.archiveIds); if (error) throw error; }
  await client.from("content_sources").update({ last_checked_at: checkedAt, last_changed_at: checkedAt, last_success_at: checkedAt, last_http_status: fetched.status, etag: fetched.etag, last_modified: fetched.lastModified, content_hash: contentHash, normalized_hash: normalizedHash, confidence: 1, requires_review: false, last_final_url: fetched.finalUrl, last_content_type: fetched.contentType, consecutive_failures: 0, sync_status: "success", next_check_at: nextCheckAt(checkedAt, config.intervalHours), next_retry_at: null, last_error_message: null }).eq("id", source.id);
  await client.from("source_sync_runs").update({ status: "success", finished_at: checkedAt, http_status: fetched.status, content_hash: contentHash, discovered_count: parsed.jobs.length + parsed.rejected, published_count: plan.inserts.length + plan.updates.length, review_count: 0, loaded_count: parsed.jobs.length + parsed.rejected, inserted_count: plan.inserts.length, updated_count: plan.updates.length, archived_count: plan.archiveIds.length, rejected_count: parsed.rejected, error_message: parsed.warnings.length ? parsed.warnings.join(" ").slice(0, 2000) : null }).eq("id", runId);
  return { sourceId: source.id, status: "success" as const, loaded: parsed.jobs.length + parsed.rejected, inserted: plan.inserts.length, updated: plan.updates.length, archived: plan.archiveIds.length, rejected: parsed.rejected };
}
