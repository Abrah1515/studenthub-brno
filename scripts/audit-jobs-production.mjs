import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const text = await readFile(".env.local", "utf8");
const local = Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
const env = { ...local, ...process.env };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Audit vyžaduje lokálně nastavené produkční Supabase údaje.");

const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cities = ["brno", "praha", "olomouc", "ostrava"];
const expectedProvider = (city) => city === "brno" ? "fajn-brigady" : `fajn-brigady-${city}`;

const { data: sources, error: sourceError } = await client.from("content_sources")
  .select("id,city_id,enabled,sync_status,last_success_at,last_checked_at,next_check_at,last_final_url,last_content_type,last_http_status,last_error_message")
  .eq("source_type", "job_feed");
if (sourceError) throw sourceError;

const { data: jobs, error: jobsError } = await client.from("jobs")
  .select("id,city_id,provider_key,external_id,status,is_demo,apply_url,last_seen_at,last_verified_at,missing_from_feed_runs")
  .like("provider_key", "fajn-brigady%");
if (jobsError) throw jobsError;

function safeHost(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}

async function checkPublicDetail(rows) {
  const sample = rows.find((row) => row.status === "approved" && !row.is_demo && safeHost(row.apply_url) === "www.fajn-brigady.cz");
  if (!sample) return { status: "unavailable", reason: "no_approved_sample" };
  try {
    const response = await fetch(sample.apply_url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "StudentHub production audit (studenthubapp.cz)" } });
    return { status: response.ok ? "ok" : "http_error", httpStatus: response.status, finalHost: safeHost(response.url) };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.name : "fetch_failed" };
  }
}

const cityReports = {};
for (const city of cities) {
  const provider = expectedProvider(city);
  const sourceId = `src-fajn-brigady${city === "brno" ? "" : `-${city}`}`;
  const source = (sources || []).find((row) => row.id === sourceId);
  const cityJobs = (jobs || []).filter((row) => row.city_id === city && row.provider_key === provider);
  const approved = cityJobs.filter((row) => row.status === "approved" && !row.is_demo);
  cityReports[city] = {
    source: source ? {
      id: source.id,
      enabled: source.enabled,
      syncStatus: source.sync_status,
      lastSuccessAt: source.last_success_at,
      lastCheckedAt: source.last_checked_at,
      nextCheckAt: source.next_check_at,
      httpStatus: source.last_http_status,
      contentType: source.last_content_type,
      finalHost: safeHost(source.last_final_url),
      hasError: Boolean(source.last_error_message),
    } : null,
    approved: approved.length,
    archived: cityJobs.filter((row) => row.status === "archived").length,
    pendingRemoval: approved.filter((row) => Number(row.missing_from_feed_runs || 0) > 0).length,
    invalidExternalLinks: approved.filter((row) => safeHost(row.apply_url) !== "www.fajn-brigady.cz").length,
    detailCheck: await checkPublicDetail(approved),
  };
}

const misplaced = (jobs || []).filter((row) => cities.includes(row.city_id) && row.provider_key !== expectedProvider(row.city_id));
const duplicateExternalIds = Object.entries(Object.groupBy((jobs || []).filter((row) => row.status === "approved" && !row.is_demo), (row) => `${row.provider_key}:${row.external_id}`))
  .filter(([, rows]) => (rows?.length || 0) > 1)
  .map(([key, rows]) => ({ key, count: rows.length }));

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  cities: cityReports,
  misplacedJobs: misplaced.length,
  duplicateExternalIds,
}, null, 2));
