import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { resolutionForReviewReason } from "./source-review-resolution.mjs";

async function loadEnv(path) {
  try {
    for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch { /* Proměnné mohou přijít z CI. */ }
}

await loadEnv(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Chybí serverové údaje Supabase.");
const apply = process.argv.includes("--apply");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.from("source_review_queue").select("id,source_id,reason,status").eq("status", "pending").order("created_at");
if (error) throw error;
const plan = (data || []).map((row) => ({ ...row, resolution: resolutionForReviewReason(row.reason) }));
const unsupported = plan.filter((row) => !row.resolution);
if (unsupported.length) throw new Error(`Bez bezpečného pravidla zůstává ${unsupported.length} položek.`);
const summary = plan.reduce((result, row) => {
  const key = `${row.resolution.status}:${row.resolution.code}`;
  result[key] = (result[key] || 0) + 1;
  return result;
}, {});
if (!apply) {
  console.log(JSON.stringify({ mode: "plan", total: plan.length, summary }, null, 2));
  process.exit(0);
}
for (const row of plan) {
  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await client.from("source_review_queue").update({
    status: row.resolution.status,
    resolution_code: row.resolution.code,
    review_note: row.resolution.note,
    reviewed_at: reviewedAt,
    updated_at: reviewedAt,
  }).eq("id", row.id).eq("status", "pending");
  if (updateError) throw updateError;
  if (row.resolution.status === "technical_closed") {
    const { error: sourceError } = await client.from("content_sources").update({
      requires_review: true,
      sync_status: "manual_review",
      last_block_reason: row.resolution.note,
    }).eq("id", row.source_id);
    if (sourceError) throw sourceError;
  }
}
console.log(JSON.stringify({ mode: "apply", total: plan.length, summary }, null, 2));
