import { createClient } from "@supabase/supabase-js";

const targetEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
const sourceEmail = process.env.SUPERADMIN_TRANSFER_FROM_EMAIL?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://studenthub-brno.vercel.app").replace(/\/$/, "");

if (!targetEmail || !/^\S+@\S+\.\S+$/.test(targetEmail)) throw new Error("Nastavte SUPERADMIN_EMAIL na nový platný e-mail.");
if (!sourceEmail || !/^\S+@\S+\.\S+$/.test(sourceEmail)) throw new Error("Nastavte SUPERADMIN_TRANSFER_FROM_EMAIL na současný e-mail superadministrátora.");
if (targetEmail === sourceEmail) throw new Error("Nový a současný e-mail superadministrátora musí být odlišné.");
if (!url || !serviceKey) throw new Error("Nastavte NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY pouze v lokálním prostředí.");

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Uživatele se nepodařilo bezpečně načíst v limitu 100 000 účtů.");
}

const users = await listAuthUsers();
const sourceUser = users.find((user) => user.email?.trim().toLowerCase() === sourceEmail);
let targetUser = users.find((user) => user.email?.trim().toLowerCase() === targetEmail);
if (!sourceUser) throw new Error("Současný účet superadministrátora nebyl v Supabase Auth nalezen.");

const { data: superadminProfiles, error: profileReadError } = await client
  .from("profiles")
  .select("id,display_name,role,city_id,faculty_id")
  .eq("role", "super_admin");
if (profileReadError) throw profileReadError;
if (superadminProfiles?.length !== 1 || superadminProfiles[0].id !== sourceUser.id) {
  throw new Error("Převod byl zastaven: současný superadministrátor není jednoznačně synchronizovaný v tabulce profiles.");
}

if (!targetUser) {
  const { data, error } = await client.auth.admin.inviteUserByEmail(targetEmail, {
    redirectTo: `${siteUrl}/admin/obnova`,
    data: { invited_as: "super_admin_transfer" },
  });
  if (error || !data.user) throw error || new Error("Supabase nevytvořil cílový účet.");
  console.log(`Na ${targetEmail} byla odeslána pozvánka. Otevřete ji, nastavte heslo a potom spusťte admin:transfer znovu.`);
  process.exit(0);
}

if (!targetUser.email_confirmed_at && !targetUser.confirmed_at) {
  const { error } = await client.auth.resetPasswordForEmail(targetEmail, { redirectTo: `${siteUrl}/admin/obnova` });
  if (error) throw error;
  console.log(`Cílový účet ${targetEmail} zatím není potvrzený. Otevřete zaslaný odkaz, nastavte heslo a potom spusťte admin:transfer znovu.`);
  process.exit(0);
}

const sourceProfile = superadminProfiles[0];
const { data: targetProfile, error: targetProfileError } = await client
  .from("profiles")
  .select("display_name,role,city_id,faculty_id")
  .eq("id", targetUser.id)
  .maybeSingle();
if (targetProfileError) throw targetProfileError;

const adminMetadata = { role: "super_admin", city_id: null, faculty_id: null };
const targetOriginalMetadata = targetUser.app_metadata || {};
const targetOriginalProfile = targetProfile || null;

const { error: targetMetadataError } = await client.auth.admin.updateUserById(targetUser.id, {
  app_metadata: { ...targetOriginalMetadata, ...adminMetadata },
});
if (targetMetadataError) throw targetMetadataError;

const { error: targetProfileUpdateError } = await client.from("profiles").upsert({
  id: targetUser.id,
  display_name: targetProfile?.display_name || targetEmail.split("@")[0],
  ...adminMetadata,
}, { onConflict: "id" });
if (targetProfileUpdateError) {
  await client.auth.admin.updateUserById(targetUser.id, { app_metadata: targetOriginalMetadata });
  throw targetProfileUpdateError;
}

const regularMetadata = {
  role: "user",
  city_id: sourceProfile.city_id || null,
  faculty_id: sourceProfile.faculty_id || null,
};

try {
  const { error: sourceMetadataError } = await client.auth.admin.updateUserById(sourceUser.id, {
    app_metadata: { ...sourceUser.app_metadata, ...regularMetadata },
  });
  if (sourceMetadataError) throw sourceMetadataError;

  const { error: sourceProfileError } = await client.from("profiles").update({ role: "user" }).eq("id", sourceUser.id);
  if (sourceProfileError) throw sourceProfileError;
} catch (error) {
  await client.auth.admin.updateUserById(sourceUser.id, { app_metadata: sourceUser.app_metadata || {} });
  await client.from("profiles").update({
    role: "super_admin",
    city_id: sourceProfile.city_id,
    faculty_id: sourceProfile.faculty_id,
  }).eq("id", sourceUser.id);
  await client.auth.admin.updateUserById(targetUser.id, { app_metadata: targetOriginalMetadata });
  if (targetOriginalProfile) {
    await client.from("profiles").update({
      role: targetOriginalProfile.role,
      city_id: targetOriginalProfile.city_id,
      faculty_id: targetOriginalProfile.faculty_id,
    }).eq("id", targetUser.id);
  } else {
    await client.from("profiles").update({ role: "user", city_id: null, faculty_id: null }).eq("id", targetUser.id);
  }
  throw error;
}

console.log(`Role superadministrátora byla převedena z ${sourceEmail} na ${targetEmail}.`);
