import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadEnv(path) {
  try {
    const source = await readFile(path, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // CI a produkce mohou předávat proměnné přímo.
  }
}

await loadEnv(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Chybí NEXT_PUBLIC_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY.");

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function count(table, configure = (query) => query) {
  const query = configure(supabase.from(table).select("*", { count: "exact", head: true }));
  const { count: value, error } = await query;
  if (error) return { unavailable: error.code || "query_failed" };
  return value ?? 0;
}

async function columnExists(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  if (["42703", "PGRST200", "PGRST204"].includes(error.code) || /column .* does not exist|schema cache/i.test(error.message || "")) return false;
  throw new Error(`Kontrola sloupce ${table}.${column} selhala (${error.code || "unknown"}): ${error.message || error.details || "bez detailu"}`);
}

async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Auth audit selhal: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

const [authUsers, profilesResult] = await Promise.all([
  listAllAuthUsers(),
  supabase.from("profiles").select("id,role,city_id,faculty_id,account_status,is_blocked"),
]);
if (profilesResult.error) throw new Error(`Profile audit selhal: ${profilesResult.error.message}`);

const profiles = profilesResult.data || [];
const authById = new Map(authUsers.map((user) => [user.id, user]));
const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
const administrativeRoles = new Set(["faculty_editor", "city_editor", "admin", "super_admin"]);

const roleMetadataMismatches = profiles.filter((profile) => {
  const metadata = authById.get(profile.id)?.app_metadata || {};
  return String(metadata.role || "user") !== String(profile.role || "user")
    || (metadata.city_id || null) !== (profile.city_id || null)
    || (metadata.faculty_id || null) !== (profile.faculty_id || null);
}).length;

const report = {
  generatedAt: new Date().toISOString(),
  auth: {
    users: authUsers.length,
    confirmed: authUsers.filter((user) => Boolean(user.email_confirmed_at)).length,
    unconfirmed: authUsers.filter((user) => !user.email_confirmed_at).length,
    missingProfile: authUsers.filter((user) => !profileById.has(user.id)).length,
    orphanProfiles: profiles.filter((profile) => !authById.has(profile.id)).length,
    roleMetadataMismatches,
    adminProfiles: profiles.filter((profile) => administrativeRoles.has(String(profile.role))).length,
    activeSuperAdmins: profiles.filter((profile) => profile.role === "super_admin" && profile.account_status === "active" && !profile.is_blocked).length,
  },
  legacy: {
    archivedSnapshots: await count("auth_legacy_archive"),
    legacyColumnsPresent: {
      marketplaceVerification: await columnExists("marketplace_listings", "verification_token_hash"),
      marketplaceManagement: await columnExists("marketplace_listings", "management_token_hash"),
      communityManagement: await columnExists("community_events", "management_token_hash"),
      serviceOwner: await columnExists("service_requests", "owner_token_hash"),
    },
    marketplace: {
      total: await count("marketplace_listings"),
      owned: await count("marketplace_listings", (query) => query.not("seller_id", "is", null)),
      orphaned: await count("marketplace_listings", (query) => query.is("seller_id", null)),
      pendingVerification: await count("marketplace_listings", (query) => query.eq("status", "pending_verification")),
    },
    communityEvents: {
      total: await count("community_events"),
      ownedCommunity: await count("community_events", (query) => query.eq("source_type", "community").not("author_id", "is", null)),
      orphanedCommunity: await count("community_events", (query) => query.eq("source_type", "community").is("author_id", null)),
    },
    serviceRequests: {
      total: await count("service_requests"),
    },
    buddyPosts: {
      total: await count("buddy_posts"),
      orphaned: await count("buddy_posts", (query) => query.is("owner_id", null)),
      orphanedVisible: await count("buddy_posts", (query) => query.is("owner_id", null).neq("moderation_status", "hidden")),
    },
  },
};

console.log(JSON.stringify(report, null, 2));
