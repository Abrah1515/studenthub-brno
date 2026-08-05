import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export type TableName = "cities" | "campuses" | "service_requests" | "submissions" | "outbound_clicks" | "page_views" | "academic_events" | "places" | "offers" | "jobs" | "content_sources" | "source_sync_runs" | "source_review_queue" | "link_checks" | "content_publication_events" | "buddy_posts" | "buddy_join_requests" | "content_reports";
type RecordValue = Record<string, unknown>;
type LocalStore = Record<TableName, RecordValue[]>;
const dataDirectory = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDirectory, "local-test-store.json");

function localStoreAllowed() { return process.env.DEMO_MODE === "true" && process.env.ALLOW_LOCAL_FILE_STORE === "true"; }
function emptyStore(): LocalStore { return { cities: [], campuses: [], service_requests: [], submissions: [], outbound_clicks: [], page_views: [], academic_events: [], places: [], offers: [], jobs: [], content_sources: [], source_sync_runs: [], source_review_queue: [], link_checks: [], content_publication_events: [], buddy_posts: [], buddy_join_requests: [], content_reports: [] }; }
async function readLocalStore(): Promise<LocalStore> { try { return { ...emptyStore(), ...JSON.parse(await readFile(dataFile, "utf8")) }; } catch { return emptyStore(); } }
async function writeLocalStore(store: LocalStore) { await mkdir(dataDirectory, { recursive: true }); await writeFile(dataFile, JSON.stringify(store, null, 2), "utf8"); }
function assertStorage() { if (!localStoreAllowed()) throw new Error("Produkční úložiště není nakonfigurované. Nastavte Supabase."); }

export async function insertRecord(table: TableName, record: RecordValue) {
  if (isSupabaseConfigured()) { const { data, error } = await createServiceClient().from(table).insert(record).select().single(); if (error) throw error; return data as RecordValue; }
  assertStorage(); const store = await readLocalStore(); const saved = { id: record.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...record }; store[table].push(saved); await writeLocalStore(store); return saved;
}
export async function listRecords(table: TableName) {
  if (isSupabaseConfigured()) { const { data, error } = await createServiceClient().from(table).select("*").order("created_at", { ascending: false }); if (error) throw error; return data as RecordValue[]; }
  if (!localStoreAllowed()) return []; return (await readLocalStore())[table];
}
export async function updateRecord(table: TableName, id: string, changes: RecordValue) {
  if (isSupabaseConfigured()) { const { data, error } = await createServiceClient().from(table).update(changes).eq("id", id).select().single(); if (error) throw error; return data as RecordValue; }
  assertStorage(); const store = await readLocalStore(); const index = store[table].findIndex((record) => String(record.id) === id); if (index < 0) throw new Error("Záznam nebyl nalezen."); store[table][index] = { ...store[table][index], ...changes, updated_at: new Date().toISOString() }; await writeLocalStore(store); return store[table][index];
}
export async function deleteRecord(table: TableName, id: string) {
  if (isSupabaseConfigured()) { const { error } = await createServiceClient().from(table).delete().eq("id", id); if (error) throw error; return; }
  assertStorage(); const store = await readLocalStore(); store[table] = store[table].filter((record) => String(record.id) !== id); await writeLocalStore(store);
}
