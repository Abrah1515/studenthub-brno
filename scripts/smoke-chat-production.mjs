import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function localEnvironment() {
  try {
    const text = await readFile(".env.local", "utf8");
    return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
  } catch { return {}; }
}

const local = await localEnvironment();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || local.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY;
const confirmation = process.env.CONFIRM_PRODUCTION_CHAT_SMOKE || local.CONFIRM_PRODUCTION_CHAT_SMOKE || process.argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length);
if (!url || !anonKey || !serviceKey) throw new Error("Produkční chat smoke test vyžaduje lokální Supabase URL, anon key a service-role key.");
if (confirmation !== "studenthub-brno") throw new Error("Pro vědomý produkční test nastavte CONFIRM_PRODUCTION_CHAT_SMOKE=studenthub-brno.");

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `Smoke-${randomUUID()}-Aa1!`;
const createdIds = [];

async function createSyntheticUser(label) {
  const email = `studenthub-chat-smoke-${label}-${suffix}@example.com`;
  const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw result.error || new Error("Syntetický účet se nepodařilo vytvořit.");
  const id = result.data.user.id; createdIds.push(id);
  const profile = await service.from("profiles").update({
    username: `smoke_${label}_${suffix}`, display_name: `Smoke ${label}`,
    profile_visibility: "public", account_status: "active", is_blocked: false,
    community_rules_accepted_at: new Date().toISOString(), allow_chat_requests: true,
  }).eq("id", id);
  if (profile.error) throw profile.error;
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id, client };
}

try {
  const initiator = await createSyntheticUser("initiator");
  const recipient = await createSyntheticUser("recipient");
  const outsider = await createSyntheticUser("outsider");
  const firstNonce = randomUUID();
  const started = await initiator.client.rpc("start_chat_request", {
    target_profile: recipient.id, target_context_type: "profile", target_context_id: recipient.id,
    first_body: "Produkční syntetický test soukromého chatu.", message_nonce: firstNonce,
  });
  if (started.error || !started.data) throw started.error || new Error("Žádost o chat nevznikla.");
  const conversationId = started.data;

  const duplicate = await initiator.client.rpc("start_chat_request", {
    target_profile: recipient.id, target_context_type: "profile", target_context_id: recipient.id,
    first_body: "Tato druhá žádost se nesmí vložit.", message_nonce: randomUUID(),
  });
  if (duplicate.error || duplicate.data !== conversationId) throw duplicate.error || new Error("Idempotence otevřené konverzace selhala.");
  const requestMessages = await service.from("chat_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId);
  if (requestMessages.error || requestMessages.count !== 1) throw requestMessages.error || new Error("Před přijetím vznikla více než jedna zpráva iniciátora.");

  const accepted = await recipient.client.rpc("send_chat_message", { target_conversation: conversationId, message_body: "Přijímám odpovědí.", message_nonce: randomUUID() });
  if (accepted.error) throw accepted.error;
  const active = await service.from("chat_conversations").select("status").eq("id", conversationId).single();
  if (active.error || active.data.status !== "active") throw active.error || new Error("Odpověď nepřevedla žádost do aktivního stavu.");

  const continued = await initiator.client.rpc("send_chat_message", { target_conversation: conversationId, message_body: "Běžná zpráva po přijetí.", message_nonce: randomUUID() });
  if (continued.error) throw continued.error;
  const forbidden = await outsider.client.from("chat_messages").select("id").eq("conversation_id", conversationId);
  if (forbidden.error || (forbidden.data?.length || 0) !== 0) throw forbidden.error || new Error("Cizí účet získal přístup ke zprávám.");

  const blocked = await initiator.client.from("profile_blocks").insert({ blocker_id: initiator.id, blocked_id: recipient.id });
  if (blocked.error) throw blocked.error;
  const afterBlock = await recipient.client.rpc("send_chat_message", { target_conversation: conversationId, message_body: "Tato zpráva se nesmí uložit.", message_nonce: randomUUID() });
  if (!afterBlock.error) throw new Error("Blokování nezastavilo odesílání zpráv.");

  console.log(JSON.stringify({ passed: true, requestMessageLimit: true, replyAccepts: true, memberChat: true, outsiderDenied: true, blockingStopsMessages: true, syntheticAccountsRemoved: "pending" }));
} finally {
  const failures = [];
  for (const id of createdIds.reverse()) {
    const removed = await service.auth.admin.deleteUser(id);
    if (removed.error) failures.push(removed.error.message);
  }
  if (failures.length) throw new Error(`Úklid syntetických účtů selhal (${failures.length}).`);
  console.log(JSON.stringify({ syntheticAccountsRemoved: createdIds.length }));
}
