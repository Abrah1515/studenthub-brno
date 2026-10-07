import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const text = await readFile(".env.local", "utf8");
const local = Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
const env = { ...local, ...process.env };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Audit vyžaduje lokálně nastavené produkční Supabase údaje.");
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.from("places").select("id,city_id,name,category,status,is_demo,origin,verification_status,source_sync_status,source_url,latitude,longitude,university_id,faculty_id,subcategory,access_type,study_mode,temporary_status");
if (error) throw error;
const published = (data || []).filter((row) => row.status === "approved" && !row.is_demo);
const countBy = (rows, key) => Object.fromEntries([...new Set(rows.map((row) => String(row[key] || "neuvedeno")))].sort().map((value) => [value, rows.filter((row) => String(row[key] || "neuvedeno") === value).length]));
const utilityCategories = new Set(["public_toilet", "drinking_fountain", "bench"]);
const duplicateGroups = Object.values(Object.groupBy(published.filter((row) => !utilityCategories.has(String(row.category))), (row) => `${row.city_id}:${String(row.name).toLocaleLowerCase("cs-CZ")}:${String(row.address || "").toLocaleLowerCase("cs-CZ")}`)).filter((rows) => (rows?.length || 0) > 1).map((rows) => rows?.map((row) => row.id));

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  total: published.length,
  byCity: countBy(published, "city_id"),
  byCategory: countBy(published, "category"),
  byOrigin: countBy(published, "origin"),
  needsReview: published.filter((row) => row.verification_status !== "verified" || row.source_sync_status === "needs_review").length,
  missingSource: published.filter((row) => !row.source_url).length,
  missingCoordinates: published.filter((row) => row.latitude == null || row.longitude == null || !Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude))).length,
  duplicateGroups,
}, null, 2));
