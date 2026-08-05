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
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/auth/callback?next=/admin/obnova` });
  if (error) throw error;
  console.log(`E-mail pro obnovu přístupu byl odeslán na ${email}.`);
  process.exit(0);
}

const { data: existingProfiles, error: profileReadError } = await client.from("profiles").select("id").eq("role", "super_admin").limit(1);
if (profileReadError) throw profileReadError;
if (existingProfiles?.length) throw new Error("Superadministrátor už existuje. Pro obnovu použijte pnpm admin:recover; další role spravujte v administraci.");

const { data, error } = await client.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl}/auth/callback?next=/admin/obnova`, data: { invited_as: "super_admin" } });
if (error || !data.user) throw error || new Error("Supabase nevrátil vytvořeného uživatele.");
const metadata = { role: "super_admin", city_id: null, faculty_id: null };
const { error: metadataError } = await client.auth.admin.updateUserById(data.user.id, { app_metadata: metadata });
if (metadataError) throw metadataError;
const { error: profileError } = await client.from("profiles").upsert({ id: data.user.id, display_name: email.split("@")[0], ...metadata }, { onConflict: "id" });
if (profileError) throw profileError;

const accessFile = path.join(process.cwd(), "ADMIN-PRISTUP-LOKALNE.txt");
await writeFile(accessFile, `StudentHub Brno – lokální přístupový přehled\n\nAdministrace: ${siteUrl}/admin\nPřihlášení: ${siteUrl}/admin/prihlaseni\nSupabase: https://supabase.com/dashboard/project/${new URL(url).hostname.split(".")[0]}\nVercel: https://vercel.com/dashboard\nAdministrátorský e-mail: ${email}\n\nObnova přístupu:\n1. Nastavte lokálně SUPERADMIN_EMAIL, NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY.\n2. Spusťte pnpm admin:recover.\n3. Otevřete jednorázový odkaz z e-mailu a nastavte nové heslo na /admin/obnova.\n\nHeslo ani service-role key do tohoto souboru nepatří.\n`, "utf8");
console.log(`Pozvánka superadministrátora byla odeslána na ${email}. Heslo nebylo vytvořeno ani uloženo.`);
