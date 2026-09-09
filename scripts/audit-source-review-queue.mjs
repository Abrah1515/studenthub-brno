import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const text = await readFile(".env.local", "utf8");
const local = Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
const env = { ...local, ...process.env };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Audit vyžaduje lokálně nastavené produkční Supabase údaje.");
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.from("source_review_queue").select("id,source_id,status,reason,created_at");
if (error) throw error;
const rows = data || [];
const pending = rows.filter((row) => row.status === "pending");
const by = (items, key) => Object.fromEntries([...new Set(items.map((item) => String(item[key])))].sort().map((value) => [value, items.filter((item) => String(item[key]) === value).length]));
const technicalReasons = new Set(["challenge", "robots_disallowed", "robots_unavailable", "login_page", "unexpected_mime", "invalid_document"]);
console.log(JSON.stringify({ total: rows.length, pending: pending.length, actionablePending: pending.filter((row) => !technicalReasons.has(row.reason)).length, technicalPending: pending.filter((row) => technicalReasons.has(row.reason)).length, sourcesWithMultiplePending: Object.values(by(pending, "source_id")).filter((count) => count > 1).length, byStatus: by(rows, "status"), pendingByReason: by(pending, "reason"), pendingBySource: by(pending, "source_id") }));
