import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function environment() {
  const text = await readFile(".env.local", "utf8");
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
}

const env = { ...await environment(), ...process.env };
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Chybí lokální produkční Supabase údaje.");
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const chatTables = ["chat_conversations", "chat_conversation_members", "chat_messages", "chat_message_reports", "chat_moderation_actions", "chat_rate_limits"];
const checks = {};
for (const table of chatTables) {
  const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
  checks[table] = { available: !error, count: count || 0, errorCode: error?.code || null };
}
const cityColumn = await client.from("chat_conversations").select("city_id").limit(1);
const roleAudit = await client.from("admin_role_audit").select("id", { count: "exact", head: true });
console.log(JSON.stringify({ chatTables: checks, privateChatSchemaPresent: Object.values(checks).every((check) => check.available), chatCityScopePresent: !cityColumn.error, roleAuditPresent: !roleAudit.error }));
if (!Object.values(checks).every((check) => check.available)) process.exitCode = 1;
