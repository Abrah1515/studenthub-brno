import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const text = await readFile(".env.local", "utf8");
const local = Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
const env = { ...local, ...process.env };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Audit vyžaduje lokálně nastavené produkční Supabase údaje.");
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const cityUniversities = {
  brno: ["muni", "vut", "mendelu", "vetuni", "jamu"],
  praha: ["cuni", "cvut", "vse", "czu", "vscht"],
  olomouc: ["upol"],
  ostrava: ["vsbtuo", "osu"],
};
const from = new Date();
const to = new Date(from.getTime() + 180 * 24 * 60 * 60 * 1000);

async function rows(table, select = "*") {
  const { data, error } = await client.from(table).select(select);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function sourceRows() {
  const full = await client.from("content_sources").select("id,city_id,university_id,faculty_id,source_type,enabled,sync_status,coverage_status,last_success_at,next_check_at,last_error_message");
  if (!full.error) return full.data || [];
  if (full.error.code !== "42703") throw new Error(`content_sources: ${full.error.message}`);
  const legacy = await client.from("content_sources").select("id,city_id,university_id,faculty_id,source_type,enabled,sync_status,last_success_at,next_check_at,last_error_message");
  if (legacy.error) throw new Error(`content_sources: ${legacy.error.message}`);
  return (legacy.data || []).map((row) => ({ ...row, coverage_status: null }));
}

const [sources, events, community, runs, findings, queue] = await Promise.all([
  sourceRows(),
  rows("academic_events", "id,university_id,faculty_id,source_id,academic_year,status,verification_status,is_cancelled,starts_at,manual_override,category"),
  rows("community_events", "id,city_id,status,starts_at,source_url"),
  rows("source_sync_runs", "id,source_id,city_id,status,started_at,finished_at,error_message"),
  rows("academic_calendar_ai_findings", "id,city_id,status,source_id"),
  rows("source_review_queue", "id,source_id,status,reason"),
]);

const summary = {};
for (const [city, universityIds] of Object.entries(cityUniversities)) {
  const citySources = sources.filter((row) => row.source_type === "academic_calendar" && row.enabled && (row.city_id === city || (!row.city_id && universityIds.includes(row.university_id))));
  const cityEvents = events.filter((row) => universityIds.includes(row.university_id) && row.academic_year === "2026/2027" && row.status === "approved" && row.verification_status === "verified" && !row.is_cancelled);
  const futureCommunity = community.filter((row) => row.city_id === city && row.status === "published" && new Date(row.starts_at) >= from && new Date(row.starts_at) <= to);
  summary[city] = {
    sources: citySources.length,
    dueSources: citySources.filter((row) => !row.next_check_at || new Date(row.next_check_at).getTime() <= from.getTime()).length,
    nextScheduledCheck: citySources.map((row) => row.next_check_at).filter(Boolean).sort().at(0) || null,
    latestSuccessfulCheck: citySources.map((row) => row.last_success_at).filter(Boolean).sort().at(-1) || null,
    sourcesByUniversity: Object.fromEntries(universityIds.map((id) => [id, citySources.filter((row) => row.university_id === id).length])),
    coverage: Object.fromEntries(["complete", "covered_by_central", "partial", "needs_review", "blocked", "unavailable", "stale"].map((status) => [status, citySources.filter((row) => row.coverage_status === status).length])),
    academicEvents: cityEvents.length,
    individualExams: cityEvents.filter((row) => ["final_exam", "exam"].includes(row.category)).length,
    communityNext180Days: futureCommunity.length,
    latestCommunityEvent: futureCommunity.map((row) => row.starts_at).sort().at(-1) || null,
    openFindings: findings.filter((row) => row.city_id === city && ["new", "needs_review", "cannot_verify"].includes(row.status)).length,
  };
}

const staleCutoff = Date.now() - 30 * 60 * 1000;
console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary,
  stuckRuns: runs.filter((row) => row.status === "running" && new Date(row.started_at).getTime() < staleCutoff),
  openReviewQueue: queue.filter((row) => row.status === "pending").length,
  latestRuns: runs.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, 12),
}, null, 2));
