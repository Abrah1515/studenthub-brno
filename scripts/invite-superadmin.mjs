import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://studenthub-brno.vercel.app").replace(/\/$/, "");
const recovery = process.argv.includes("--recover");

if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Nastavte SUPERADMIN_EMAIL na vlastní platný e-mail.");
if (!url || !serviceKey) throw new Error("Nastavte NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY pouze v lokálním prostředí.");
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

if (recovery) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/admin/obnova` });
  if (error) throw error;
  console.log(`E-mail pro obnovu přístupu byl odeslán na ${email}.`);
  process.exit(0);
}

const { data: existingProfiles, error: profileReadError } = await client.from("profiles").select("id").eq("role", "super_admin").limit(1);
if (profileReadError) throw profileReadError;
if (existingProfiles?.length) throw new Error("Superadministrátor už existuje. Pro obnovu použijte pnpm admin:recover; další role spravujte v administraci.");

async function findUserByEmail() {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Uživatele se nepodařilo bezpečně dohledat v limitu 100 000 účtů.");
}

let user = await findUserByEmail();
const existingUser = Boolean(user);
if (!user) {
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl}/admin/obnova`, data: { invited_as: "super_admin" } });
  if (error || !data.user) throw error || new Error("Supabase nevrátil vytvořeného uživatele.");
  user = data.user;
}
const metadata = { role: "super_admin", city_id: null, faculty_id: null };
const { error: metadataError } = await client.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, ...metadata } });
if (metadataError) throw metadataError;
const { data: currentProfile, error: currentProfileError } = await client.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
if (currentProfileError) throw currentProfileError;
const { error: profileError } = await client.from("profiles").upsert({ id: user.id, display_name: currentProfile?.display_name || email.split("@")[0], ...metadata }, { onConflict: "id" });
if (profileError) throw profileError;

if (existingUser) {
  const { error: recoveryError } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/admin/obnova` });
  if (recoveryError) throw recoveryError;
}

const accessFile = path.join(process.cwd(), "ADMIN-PRISTUP-LOKALNE.txt");
await writeFile(accessFile, `StudentHub Brno – lokální přístupový přehled\n\nAdministrace: ${siteUrl}/admin\nPřihlášení: ${siteUrl}/admin/prihlaseni\nSupabase: https://supabase.com/dashboard/project/${new URL(url).hostname.split(".")[0]}\nVercel: https://vercel.com/dashboard\nAdministrátorský e-mail: ${email}\n\nObnova přístupu:\n1. Nastavte lokálně SUPERADMIN_EMAIL, NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY.\n2. Spusťte pnpm admin:recover.\n3. Otevřete jednorázový odkaz z e-mailu a nastavte nové heslo na /admin/obnova.\n\nHeslo ani service-role key do tohoto souboru nepatří.\n`, "utf8");
console.log(existingUser
  ? `Existující účet ${email} byl nastaven jako superadministrátor a byl odeslán odkaz pro nastavení hesla.`
  : `Pozvánka superadministrátora byla odeslána na ${email}. Heslo nebylo vytvořeno ani uloženo.`);
