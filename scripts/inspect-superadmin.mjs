import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) throw new Error("Nastavte NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY pouze v lokálním prostředí.");

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const users = [];
for (let page = 1; page <= 100; page += 1) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}

const { data: profiles, error: profilesError } = await client
  .from("profiles")
  .select("id,role,city_id,faculty_id");
if (profilesError) throw profilesError;

const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
const usersById = new Map(users.map((user) => [user.id, user]));
const relevantIds = new Set([
  ...users.filter((user) => user.app_metadata?.role === "super_admin").map((user) => user.id),
  ...(profiles || []).filter((profile) => profile.role === "super_admin").map((profile) => profile.id),
]);

const result = [...relevantIds].map((id) => {
  const user = usersById.get(id);
  const profile = profilesById.get(id);
  const authRole = user?.app_metadata?.role || null;
  const profileRole = profile?.role || null;
  const authCityId = user?.app_metadata?.city_id || null;
  const authFacultyId = user?.app_metadata?.faculty_id || null;
  const profileCityId = profile?.city_id || null;
  const profileFacultyId = profile?.faculty_id || null;
  return {
    email: user?.email || null,
    emailConfirmed: Boolean(user?.email_confirmed_at || user?.confirmed_at),
    authRole,
    profileRole,
    synchronized: authRole === profileRole && authCityId === profileCityId && authFacultyId === profileFacultyId,
  };
});

console.log(JSON.stringify({ superadminRoleHolders: result }, null, 2));
