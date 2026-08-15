import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

async function localEnvironment() {
  try {
    const text = await readFile(".env.local", "utf8");
    return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
  } catch { return {}; }
}

const local = await localEnvironment();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY;
const expectedEmail = (process.env.SUPERADMIN_EMAIL || local.SUPERADMIN_EMAIL || "").trim().toLowerCase();
if (!url || !serviceKey) throw new Error("Audit vyžaduje lokálně nastavené Supabase serverové údaje.");

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: profiles, error: profilesError } = await client.from("profiles").select("id,role").eq("role", "super_admin");
if (profilesError) throw profilesError;

const authUsers = [];
for (let page = 1; page <= 100; page += 1) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  authUsers.push(...data.users);
  if (data.users.length < 1000) break;
}
const authSuperadmins = authUsers.filter((user) => user.app_metadata?.role === "super_admin");
const profileIds = new Set((profiles || []).map((profile) => profile.id));
const matching = authSuperadmins.filter((user) => profileIds.has(user.id));
const expectedMatches = expectedEmail ? matching.filter((user) => user.email?.toLowerCase() === expectedEmail) : matching;
const confirmed = matching.length === 1 && Boolean(matching[0].email_confirmed_at || matching[0].confirmed_at);

console.log(JSON.stringify({ profileSuperadmins: profiles?.length || 0, authSuperadmins: authSuperadmins.length, consistentAccounts: matching.length, expectedAccountMatches: expectedMatches.length, emailConfirmed: confirmed }));
if ((profiles?.length || 0) !== 1 || authSuperadmins.length !== 1 || matching.length !== 1 || expectedMatches.length !== 1 || !confirmed) throw new Error("Audit hlavního superadministrátora neprošel.");
