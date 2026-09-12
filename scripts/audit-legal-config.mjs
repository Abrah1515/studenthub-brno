import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadEnv(path) {
  try {
    const source = await readFile(path, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch { /* CI může dodat proměnné přímo. */ }
}

await loadEnv(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Audit vyžaduje lokálně nastavené produkční Supabase údaje.");
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function count(table, configure = (query) => query) {
  const { count: value, error } = await configure(client.from(table).select("*", { count: "exact", head: true }));
  return error ? { unavailable: error.code || "query_failed" } : value ?? 0;
}

const { data: fajnSource, error: sourceError } = await client.from("content_sources")
  .select("id,enabled,sync_status,last_success_at,last_checked_at,last_final_url,last_content_type,next_check_at")
  .eq("id", "src-fajn-brigady")
  .maybeSingle();

const safeFeed = fajnSource ? {
  id: fajnSource.id,
  enabled: fajnSource.enabled,
  syncStatus: fajnSource.sync_status,
  lastSuccessAt: fajnSource.last_success_at,
  lastCheckedAt: fajnSource.last_checked_at,
  contentType: fajnSource.last_content_type,
  nextCheckAt: fajnSource.next_check_at,
  sourceHost: (() => { try { return new URL(fajnSource.last_final_url).hostname; } catch { return null; } })(),
} : null;

const report = {
  generatedAt: new Date().toISOString(),
  fajnFeed: sourceError ? { unavailable: sourceError.code } : safeFeed,
  counts: {
    fajnApprovedJobs: await count("jobs", (query) => query.eq("provider_key", "fajn-brigady").eq("status", "approved")),
    contactMessages: await count("contact_messages"),
    pageViews: await count("page_views"),
    pushSubscriptions: await count("push_subscriptions"),
    chatMessages: await count("chat_messages"),
    housingListings: await count("housing_listings"),
    placeSubmissions: await count("place_submissions"),
  },
};

console.log(JSON.stringify(report, null, 2));
