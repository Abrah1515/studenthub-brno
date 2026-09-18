import { readdir, readFile, mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readEnvironment, artifactRoot } from "./environment.mjs";

const local = await readEnvironment();
const env = { ...local, ...process.env };
const report = { checkedAt: new Date().toISOString(), environments: {}, credentials: {}, database: {} };
for (const path of [".env.local", ".env.vercel"]) {
  const variables = await readEnvironment(path);
  report.environments[path] = Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, Boolean(value)]));
}
for (const path of [join(process.env.APPDATA || "", "com.vercel.cli/auth.json"), join(process.env.USERPROFILE || "", ".vercel/auth.json"), join(process.env.USERPROFILE || "", ".supabase/access-token")]) {
  report.credentials[path] = await access(path).then(() => true, () => false);
}
report.localMigrations = (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
report.vercel = JSON.parse(await readFile("vercel.json", "utf8"));
report.project = JSON.parse(await readFile(".vercel/project.json", "utf8"));
if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  report.database.projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const users = [];
  for (let page = 1; ; page++) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) { report.database.authError = { code: result.error.code, status: result.error.status }; break; }
    users.push(...result.data.users);
    if (result.data.users.length < 1000) break;
  }
  report.database.users = { total: users.length, confirmed: users.filter((u) => u.email_confirmed_at).length, unconfirmed: users.filter((u) => !u.email_confirmed_at).length };
  const profiles = await client.from("profiles").select("id,role,city_id,faculty_id,account_status,is_blocked");
  report.database.roles = Object.fromEntries(["user", "faculty_editor", "city_editor", "admin", "super_admin"].map((role) => [role, (profiles.data || []).filter((p) => p.role === role).length]));
  report.database.profileError = profiles.error?.code || null;
  report.database.missingProfiles = users.filter((u) => !(profiles.data || []).some((p) => p.id === u.id)).length;
  report.database.tables = {};
  for (const table of ["cities", "universities", "faculties", "academic_events", "content_sources", "source_sync_runs", "places", "jobs", "community_events", "community_posts", "community_comments", "buddy_posts", "chat_conversations", "chat_messages", "marketplace_listings", "housing_listings", "place_submissions", "admin_role_audit"]) {
    const result = await client.from(table).select("*", { count: "exact", head: true });
    report.database.tables[table] = { count: result.count, error: result.error?.code || null };
  }
  const migrations = await client.schema("supabase_migrations").from("schema_migrations").select("version");
  report.database.migrations = migrations.error ? { blocked: migrations.error.code } : migrations.data;
} else report.database.blocked = "Supabase serverové údaje nejsou dostupné v lokálním prostředí.";
await mkdir(artifactRoot, { recursive: true });
await writeFile(join(artifactRoot, "inventory.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
