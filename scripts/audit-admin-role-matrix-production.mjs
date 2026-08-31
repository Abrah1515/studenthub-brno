import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

async function environment() {
  const text = await readFile(".env.local", "utf8");
  return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
}

const env = { ...await environment(), ...process.env };
const baseUrl = String(env.NEXT_PUBLIC_SITE_URL || "https://studenthub-brno.vercel.app").replace(/\/$/, "");
if (baseUrl !== "https://studenthub-brno.vercel.app") throw new Error("Produkční matici lze spustit pouze proti oficiální URL.");
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Chybí lokální produkční Supabase tajemství.");
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anonOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const sectionKeys = ["cities", "content_sources", "academic_events", "community_events", "community_forum", "chat_reports", "profiles", "places", "live_reports", "offers", "jobs", "marketplace", "service_requests", "buddy_posts", "contact_messages", "content_reports", "academic_event_conflicts", "analytics", "admin_users", "submissions", "source_review_queue"];
const roleSections = {
  super_admin: sectionKeys,
  admin: sectionKeys.filter((section) => !["profiles", "admin_users"].includes(section)),
  city_editor: ["content_sources", "academic_events", "community_events", "community_forum", "chat_reports", "places", "live_reports", "offers", "jobs", "marketplace", "buddy_posts", "content_reports", "academic_event_conflicts", "submissions", "source_review_queue"],
  faculty_editor: ["content_sources", "academic_events", "places", "live_reports", "offers", "jobs", "academic_event_conflicts", "submissions", "source_review_queue"],
  user: [],
};

function password() { return `Sh!${randomBytes(18).toString("base64url")}9a`; }
function cookieHeader(jar) { return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "); }
function parseSetCookies(response) { const jar = new Map(); for (const value of response.headers.getSetCookie?.() || []) { const pair = value.split(";", 1)[0]; const split = pair.indexOf("="); if (split > 0) jar.set(pair.slice(0, split), pair.slice(split + 1)); } return jar; }

async function superCookie() {
  const { data: profiles, error: profileError } = await service.from("profiles").select("id").eq("role", "super_admin");
  if (profileError || profiles?.length !== 1) throw new Error("Produkce nemá právě jeden profil superadmina.");
  const { data: authData, error: authError } = await service.auth.admin.getUserById(profiles[0].id);
  if (authError || !authData.user?.email || !authData.user.email_confirmed_at || authData.user.app_metadata?.role !== "super_admin") throw new Error("Superadmin není potvrzený nebo synchronizovaný.");
  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email: authData.user.email });
  if (linkError || !link.properties?.hashed_token) throw new Error("Nelze vytvořit jednorázovou testovací relaci superadmina.");
  const jar = new Map();
  const auth = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })), setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)) } });
  const verified = await auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (verified.error || !verified.data.session) throw new Error("Jednorázovou superadmin relaci nelze ověřit.");
  return { id: authData.user.id, jar };
}

async function productionLogin(email, secret) {
  const response = await fetch(`${baseUrl}/api/admin/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: secret }), redirect: "manual" });
  return { status: response.status, jar: parseSetCookies(response), body: await response.json().catch(() => ({})) };
}

async function call(jar, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...(options.headers || {}), ...(jar ? { Cookie: cookieHeader(jar) } : {}) }, redirect: "manual" });
  const text = await response.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}

async function runMatrix(iteration) {
  const runId = `admin-${Date.now().toString(36)}-${iteration}-${randomBytes(3).toString("hex")}`;
  const short = runId.replace(/[^a-z0-9]/g, "").slice(-12); const cityId = `e2e-admin-${short}`; const results = []; const userIds = []; const emails = []; const cleanupIds = { places: [], marketplace: [], buddy: [], conversations: [], reports: [], source: `src-e2e-${short}` };
  const record = (role, area, expected, actual, pass, detail = "") => results.push({ role, area, expected, actual, status: pass ? "PASS" : "FAIL", detail });
  const expectStatus = (role, area, actual, expected) => record(role, area, expected, actual, actual === expected);
  const superSession = await superCookie(); const superJar = superSession.jar;
  let browser;
  try {
    const createCity = await call(superJar, "/api/admin/content/cities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: cityId, slug: cityId, name: `[E2E ADMIN – ${runId}]`, region: "Testovací neveřejný rozsah", country_code: "CZ", timezone: "Europe/Prague", latitude: 49.2, longitude: 16.61, map_bounds: [[49.1, 16.4], [49.3, 16.8]], map_zoom: 13, enabled: false, public_status: "draft", sort_order: 999, brand_config: { testRunId: runId } }) });
    expectStatus("super_admin", "vytvoření neveřejného města", createCity.status, 201);
    const publicCity = await call(null, `/${cityId}`); record("anonymous", "neveřejné město", "404", String(publicCity.status), publicCity.status === 404);

    const accountSpecs = ["admin", "city_editor", "faculty_editor", "user", "transition", "chat_target"];
    const accounts = {};
    for (const name of accountSpecs) {
      const email = `abrahamek.adam+sh-${runId}-${name}@gmail.com`; const secret = password(); emails.push(email);
      const created = await service.auth.admin.createUser({ email, password: secret, email_confirm: true, app_metadata: { role: "user", city_id: cityId, faculty_id: null }, user_metadata: { testRunId: runId } });
      if (created.error || !created.data.user) throw new Error(`Nelze vytvořit dočasný účet ${name}: ${created.error?.message || "bez uživatele"}`);
      const id = created.data.user.id; userIds.push(id); accounts[name] = { id, email, secret, jar: null };
      const profile = await service.from("profiles").upsert({ id, username: `e2e_${short}_${name}`.slice(0, 40), display_name: `[E2E ${name} ${runId}]`, role: "user", city_id: cityId, faculty_id: null, account_status: "active", is_blocked: false, profile_visibility: "public", community_rules_accepted_at: new Date().toISOString() }, { onConflict: "id" });
      if (profile.error) throw new Error(`Nelze připravit profil ${name}: ${profile.error.message}`);
    }

    async function assign(account, role, city = null, faculty = null) {
      const response = await call(superJar, "/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: account.id, action: "update", role, cityId: city, facultyId: faculty, reason: `Produkční role-matrix ${runId}` }) });
      expectStatus("super_admin", `přiřazení role ${role}`, response.status, 200);
      const [{ data: auth }, { data: profile }] = await Promise.all([service.auth.admin.getUserById(account.id), service.from("profiles").select("role,city_id,faculty_id").eq("id", account.id).single()]);
      const synchronized = auth.user?.app_metadata?.role === profile?.role && (auth.user?.app_metadata?.city_id || null) === (profile?.city_id || null) && (auth.user?.app_metadata?.faculty_id || null) === (profile?.faculty_id || null);
      record(role, "Auth metadata = profiles", "synchronizováno", synchronized ? "synchronizováno" : "neshoda", synchronized);
      return response;
    }
    await assign(accounts.admin, "admin", cityId, null); await assign(accounts.city_editor, "city_editor", cityId, null); await assign(accounts.faculty_editor, "faculty_editor", null, "muni-fi");

    for (const name of ["admin", "city_editor", "faculty_editor"]) { const login = await productionLogin(accounts[name].email, accounts[name].secret); accounts[name].jar = login.jar; expectStatus(name, "produkční přihlášení", login.status, 200); }
    const userLogin = await productionLogin(accounts.user.email, accounts.user.secret); expectStatus("user", "odmítnutí admin přihlášení", userLogin.status, 401);
    const anonymousAdmin = await call(null, "/api/admin/data"); expectStatus("anonymous", "admin API bez relace", anonymousAdmin.status, 401);

    const placeRows = [
      { id: randomUUID(), city_id: cityId, faculty_id: null, university_id: null, name: `[E2E CITY ${runId}]`, category: "cafe", description: `Neveřejný test ${runId}`, address: "Testovací 1", latitude: 49.2, longitude: 16.61, status: "pending", is_demo: false },
      { id: randomUUID(), city_id: "brno", faculty_id: "muni-fi", university_id: "muni", name: `[E2E FI ${runId}]`, category: "library", description: `Neveřejný test ${runId}`, address: "Testovací FI", latitude: 49.2, longitude: 16.6, status: "pending", is_demo: false },
      { id: randomUUID(), city_id: "brno", faculty_id: "vut-fit", university_id: "vut", name: `[E2E FIT ${runId}]`, category: "library", description: `Neveřejný test ${runId}`, address: "Testovací FIT", latitude: 49.22, longitude: 16.59, status: "pending", is_demo: false },
    ];
    const placeInsert = await service.from("places").insert(placeRows); if (placeInsert.error) throw new Error(`Nelze připravit testovací místa: ${placeInsert.error.message}`); cleanupIds.places.push(...placeRows.map((row) => row.id));
    const foreignPlace = await service.from("places").select("id").eq("city_id", "brno").eq("status", "approved").limit(1).single(); if (foreignPlace.error) throw new Error("Chybí bezpečný cizí záznam pro kontrolu scope.");

    const listingId = randomUUID(); cleanupIds.marketplace.push(listingId);
    const listing = await service.from("marketplace_listings").insert({ id: listingId, seller_id: accounts.user.id, city_id: cityId, listing_type: "offer", category: "other", title: `[E2E BURZA ${runId}]`, short_description: "Neveřejný test role-matrix.", description: `Neveřejný testovací inzerát ${runId} pro kontrolu oprávnění.`, price_mode: "free", price_scope: "item", semester: "not_applicable", material_format: "printed", item_condition: "used", handoff_method: "in_person", handoff_location: "Testovací město", public_alias: "E2E", seller_email: accounts.user.email, seller_email_hash: randomBytes(32).toString("hex"), request_fingerprint: randomBytes(12).toString("hex"), management_token_hash: randomBytes(32).toString("hex"), duplicate_fingerprint: randomBytes(32).toString("hex"), copyright_confirmed: true, privacy_consent_at: new Date().toISOString(), status: "hidden", expires_at: new Date(Date.now() + 86400000).toISOString() });
    if (listing.error) throw new Error(`Nelze připravit testovací inzerát: ${listing.error.message}`);

    const buddyId = randomUUID(); cleanupIds.buddy.push(buddyId);
    const buddy = await service.from("buddy_posts").insert({ id: buddyId, owner_id: accounts.chat_target.id, city_id: cityId, activity_type: "study", approximate_location: "Testovací město", starts_at: new Date(Date.now() + 86400000).toISOString(), description: `Neveřejný chatový kontext ${runId} s dostatečně dlouhým popisem.`, max_participants: 2, status: "active", moderation_status: "approved", expires_at: new Date(Date.now() + 172800000).toISOString() });
    if (buddy.error) throw new Error(`Nelze připravit chatový kontext: ${buddy.error.message}`);
    const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, anonOptions); const userAuth = await userClient.auth.signInWithPassword({ email: accounts.user.email, password: accounts.user.secret }); if (userAuth.error) throw userAuth.error;
    const chat = await userClient.rpc("start_chat_request", { target_profile: accounts.chat_target.id, target_context_type: "buddy_post", target_context_id: buddyId, first_body: `Soukromá E2E zpráva ${runId}`, message_nonce: randomUUID() });
    if (chat.error) throw new Error(`Nelze vytvořit testovací chat: ${chat.error.message}`); cleanupIds.conversations.push(chat.data);
    const message = await service.from("chat_messages").select("id").eq("conversation_id", chat.data).single(); if (message.error) throw message.error;
    const reportId = randomUUID(); cleanupIds.reports.push(reportId); const report = await service.from("chat_message_reports").insert({ id: reportId, message_id: message.data.id, reporter_id: accounts.chat_target.id, reason: "spam", detail: runId }); if (report.error) throw report.error;

    const sourceInsert = await service.from("content_sources").insert({ id: cleanupIds.source, university_id: "muni", faculty_id: "muni-fi", city_id: cityId, source_type: "academic_calendar", source_url: `https://example.com/?studenthub=${runId}`, official_domain: "example.com", format: "html", parser_key: "safe-unpublished-city-probe", enabled: true, refresh_interval: "24 hours", terms_note: runId });
    if (sourceInsert.error) throw new Error(`Nelze připravit bezpečný zdroj: ${sourceInsert.error.message}`);

    for (const [role, account] of Object.entries({ admin: accounts.admin, city_editor: accounts.city_editor, faculty_editor: accounts.faculty_editor })) {
      const allowed = new Set(roleSections[role]);
      for (const section of sectionKeys) {
        const page = await call(account.jar, `/admin?section=${section}`); const expected = allowed.has(section) ? 200 : 404;
        expectStatus(role, `UI sekce ${section}`, page.status, expected);
      }
    }
    for (const section of sectionKeys) { const page = await call(superJar, `/admin?section=${section}`); expectStatus("super_admin", `UI sekce ${section}`, page.status, 200); }

    const superData = await call(superJar, "/api/admin/data"); expectStatus("super_admin", "globální data", superData.status, 200); record("super_admin", "vidí testovací město", cityId, (superData.body?.cities || []).map((row) => row.id).join(","), (superData.body?.cities || []).some((row) => row.id === cityId));
    const adminData = await call(accounts.admin.jar, "/api/admin/data"); expectStatus("admin", "městská data", adminData.status, 200); record("admin", "scope míst", cityId, (adminData.body?.places || []).map((row) => row.city_id).join(","), (adminData.body?.places || []).every((row) => row.city_id === cityId));
    const editorData = await call(accounts.city_editor.jar, "/api/admin/data"); expectStatus("city_editor", "obsahová data", editorData.status, 200); record("city_editor", "bez kontaktů a analytiky", "0/0/0", `${editorData.body?.contact_messages?.length || 0}/${editorData.body?.service_requests?.length || 0}/${editorData.body?.page_views?.length || 0}`, !(editorData.body?.contact_messages?.length || editorData.body?.service_requests?.length || editorData.body?.page_views?.length));
    const facultyData = await call(accounts.faculty_editor.jar, "/api/admin/data"); expectStatus("faculty_editor", "fakultní data", facultyData.status, 200); record("faculty_editor", "scope míst", "muni-fi", (facultyData.body?.places || []).map((row) => row.faculty_id).join(","), (facultyData.body?.places || []).some((row) => row.id === placeRows[1].id) && (facultyData.body?.places || []).every((row) => row.faculty_id === "muni-fi"));

    expectStatus("admin", "úprava vlastního města", (await call(accounts.admin.jar, "/api/admin/content/cities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: cityId, latitude: 49.201, enabled: true, public_status: "published" }) })).status, 200);
    const cityAfterAdmin = await service.from("cities").select("enabled,public_status,latitude").eq("id", cityId).single(); record("admin", "nezmění aktivaci ani veřejný stav", "false/draft", `${cityAfterAdmin.data?.enabled}/${cityAfterAdmin.data?.public_status}`, cityAfterAdmin.data?.enabled === false && cityAfterAdmin.data?.public_status === "draft");
    expectStatus("admin", "nevytvoří další město", (await call(accounts.admin.jar, "/api/admin/content/cities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: `${cityId}-x` }) })).status, 403);
    expectStatus("city_editor", "nemění konfiguraci města", (await call(accounts.city_editor.jar, "/api/admin/content/cities", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: cityId, latitude: 1 }) })).status, 403);
    for (const [role, account] of Object.entries({ admin: accounts.admin, city_editor: accounts.city_editor })) {
      expectStatus(role, "úprava vlastního obsahu", (await call(account.jar, "/api/admin/content/places", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: placeRows[0].id, description: `${runId} upraveno rolí ${role}` }) })).status, 200);
      expectStatus(role, "zákaz cizího města", (await call(account.jar, "/api/admin/content/places", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: foreignPlace.data.id, description: runId }) })).status, 403);
      expectStatus(role, "zákaz správy rolí", (await call(account.jar, "/api/admin/users")).status, 403);
      expectStatus(role, "zákaz citlivého detailu burzy", (await call(account.jar, `/api/admin/marketplace/${listingId}/sensitive`)).status, 403);
      expectStatus(role, "zákaz ruční synchronizace", (await call(account.jar, `/api/admin/sources/${cleanupIds.source}/sync`, { method: "POST" })).status, 403);
    }
    expectStatus("city_editor", "zákaz CSV soukromého archivu", (await call(accounts.city_editor.jar, "/api/admin/export")).status, 403);
    const facultyOwn = await call(accounts.faculty_editor.jar, "/api/admin/content/places", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: placeRows[1].id, description: `${runId} fakulta`, faculty_id: "vut-fit", university_id: "vut" }) }); expectStatus("faculty_editor", "úprava vlastní fakulty", facultyOwn.status, 200);
    const facultyRow = await service.from("places").select("faculty_id,university_id").eq("id", placeRows[1].id).single(); record("faculty_editor", "server odmítne podvržený scope", "muni-fi/muni", `${facultyRow.data?.faculty_id}/${facultyRow.data?.university_id}`, facultyRow.data?.faculty_id === "muni-fi" && facultyRow.data?.university_id === "muni");
    expectStatus("faculty_editor", "zákaz cizí fakulty", (await call(accounts.faculty_editor.jar, "/api/admin/content/places", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: placeRows[2].id, description: runId }) })).status, 403);
    for (const path of ["/api/admin/community", "/api/admin/chat", "/api/admin/marketplace", "/api/admin/export"]) expectStatus("faculty_editor", `zakázané API ${path}`, (await call(accounts.faculty_editor.jar, path, { method: path.includes("export") || path.includes("chat") ? "GET" : "PATCH" })).status, 403);

    const chatQueue = await call(accounts.city_editor.jar, "/api/admin/chat"); expectStatus("city_editor", "městská fronta chatu", chatQueue.status, 200); record("city_editor", "vidí jen testovací chat report", reportId, (chatQueue.body?.items || []).map((row) => row.id).join(","), (chatQueue.body?.items || []).some((row) => row.id === reportId));
    for (const action of ["hide_message", "restore_message", "restrict_chat", "restore_chat"]) expectStatus("city_editor", `chat ${action}`, (await call(accounts.city_editor.jar, "/api/admin/chat", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, action, reason: `${runId} moderace` }) })).status, 200);
    expectStatus("city_editor", "nesmí pozastavit profil z chatu", (await call(accounts.city_editor.jar, "/api/admin/chat", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId, action: "suspend_profile", reason: runId }) })).status, 403);

    expectStatus("super_admin", "citlivý detail burzy", (await call(superJar, `/api/admin/marketplace/${listingId}/sensitive`)).status, 200);
    for (const action of ["suspend", "restore"]) expectStatus("super_admin", `profil ${action}`, (await call(superJar, "/api/admin/profiles", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: accounts.chat_target.id, action, reason: `${runId} kontrola` }) })).status, 200);
    for (const action of ["grant", "suspend", "reactivate", "revoke"]) expectStatus("super_admin", `důvěryhodný pořadatel ${action}`, (await call(superJar, "/api/admin/profile-permissions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: accounts.user.id, action, reason: `${runId} ověřený testovací pořadatel` }) })).status, 200);
    const safeSync = await call(superJar, `/api/admin/sources/${cleanupIds.source}/sync`, { method: "POST" }); expectStatus("super_admin", "bezpečná ruční synchronizace", safeSync.status, 200); record("super_admin", "synchronizace nic nepublikovala", 0, safeSync.body?.publishedCount, safeSync.body?.probeOnly === true && safeSync.body?.publishedCount === 0);
    expectStatus("super_admin", "odmítnutí role bez města", (await call(superJar, "/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: accounts.transition.id, action: "update", role: "admin", cityId: null, facultyId: null, reason: runId }) })).status, 422);
    expectStatus("super_admin", "odmítnutí druhého superadmina", (await call(superJar, "/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: accounts.transition.id, action: "update", role: "super_admin", cityId: null, facultyId: null, reason: runId }) })).status, 422);
    expectStatus("super_admin", "ochrana jediného superadmina", (await call(superJar, "/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: superSession.id, action: "update", role: "admin", cityId, facultyId: null, reason: runId }) })).status, 409);

    let staleAdminJar = null;
    for (const step of [{ role: "city_editor", city: cityId, faculty: null }, { role: "admin", city: cityId, faculty: null }, { role: "faculty_editor", city: null, faculty: "muni-fi" }, { role: "user", city: null, faculty: null }]) {
      await assign(accounts.transition, step.role, step.city, step.faculty);
      const login = await productionLogin(accounts.transition.email, accounts.transition.secret);
      if (step.role === "user") expectStatus("role_transition", "nová user session bez administrace", login.status, 401);
      else { expectStatus("role_transition", `nová session ${step.role}`, login.status, 200); if (step.role === "admin") staleAdminJar = login.jar; }
      if (step.role === "faculty_editor" && staleAdminJar) expectStatus("role_transition", "stará admin session po snížení", (await call(staleAdminJar, "/api/admin/data")).status, 401);
    }

    const recovery = await call(superJar, "/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: accounts.user.id, action: "recovery", email: accounts.user.email }) }); record("super_admin", "produkční SMTP obnova", "200 nebo pravdivá SMTP chyba", String(recovery.status), recovery.status === 200 || (recovery.status === 400 && /odeslat|smtp/i.test(String(recovery.body?.message || ""))), String(recovery.body?.message || ""));
    const inviteEmail = `abrahamek.adam+sh-${runId}-invite@gmail.com`; emails.push(inviteEmail); const invite = await call(superJar, "/api/admin/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: inviteEmail, role: "city_editor", cityId, facultyId: null }) }); record("super_admin", "produkční SMTP pozvánka", "201 nebo pravdivá SMTP chyba", String(invite.status), invite.status === 201 || (invite.status === 400 && /odeslat|smtp/i.test(String(invite.body?.message || ""))), String(invite.body?.message || ""));

    const rlsEditor = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, anonOptions); await rlsEditor.auth.signInWithPassword({ email: accounts.city_editor.email, password: accounts.city_editor.secret });
    const sensitiveRls = await rlsEditor.from("service_requests").select("id"); record("city_editor", "RLS citlivého archivu", "0 řádků", String(sensitiveRls.data?.length || 0), !sensitiveRls.error && sensitiveRls.data?.length === 0);
    const foreignRls = await rlsEditor.from("places").update({ description: runId }).eq("id", foreignPlace.data.id).select("id"); record("city_editor", "RLS zápisu cizího města", "0 řádků", String(foreignRls.data?.length || 0), !foreignRls.error && foreignRls.data?.length === 0);
    const rlsFaculty = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, anonOptions); await rlsFaculty.auth.signInWithPassword({ email: accounts.faculty_editor.email, password: accounts.faculty_editor.secret });
    const otherFacultyRls = await rlsFaculty.from("places").update({ description: runId }).eq("id", placeRows[2].id).select("id"); record("faculty_editor", "RLS zápisu cizí fakulty", "0 řádků", String(otherFacultyRls.data?.length || 0), !otherFacultyRls.error && otherFacultyRls.data?.length === 0);

    const screenshots = [{ role: "admin", account: accounts.admin, width: 1440, height: 900, dark: false }, { role: "city_editor", account: accounts.city_editor, width: 768, height: 1024, dark: true }, { role: "faculty_editor", account: accounts.faculty_editor, width: 390, height: 844, dark: false }];
    const artifactDir = `artifacts/admin-role-matrix/${runId}`; await mkdir(artifactDir, { recursive: true }); browser = await chromium.launch({ headless: true });
    for (const item of screenshots) {
      const context = await browser.newContext({ viewport: { width: item.width, height: item.height }, colorScheme: item.dark ? "dark" : "light" });
      await context.addCookies([...item.account.jar.entries()].map(([name, value]) => ({ name, value, domain: "studenthub-brno.vercel.app", path: "/", secure: true, httpOnly: true, sameSite: "Lax" })));
      const page = await context.newPage(); const errors = []; page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); }); page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(`${baseUrl}/admin?section=${item.role === "faculty_editor" ? "places" : item.role === "city_editor" ? "chat_reports" : "cities"}`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      await page.screenshot({ path: `${artifactDir}/${item.role}-${item.width}x${item.height}.png`, fullPage: true });
      record(item.role, `UX ${item.width}x${item.height}`, "200, bez overflow/console error", `${response?.status()} / overflow=${overflow} / errors=${errors.length}`, response?.status() === 200 && !overflow && errors.length === 0, errors.slice(0, 3).join(" | "));
      await context.close();
    }
    await browser.close(); browser = null;
  } catch (error) {
    record("system", "běh matice", "bez výjimky", error instanceof Error ? error.message : String(error), false);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await service.from("chat_moderation_actions").delete().ilike("reason", `%${runId}%`);
    await service.from("account_moderation_history").delete().ilike("reason", `%${runId}%`);
    await service.from("marketplace_moderation_actions").delete().ilike("reason", `%${runId}%`);
    if (cleanupIds.conversations.length) await service.from("chat_conversations").delete().in("id", cleanupIds.conversations);
    if (cleanupIds.buddy.length) await service.from("buddy_posts").delete().in("id", cleanupIds.buddy);
    if (cleanupIds.marketplace.length) await service.from("marketplace_listings").delete().in("id", cleanupIds.marketplace);
    if (cleanupIds.places.length) await service.from("places").delete().in("id", cleanupIds.places);
    await service.from("content_sources").delete().eq("id", cleanupIds.source);
    for (const email of emails) { const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 }); for (const user of listed.data.users.filter((candidate) => candidate.email?.toLowerCase() === email.toLowerCase())) if (user.id !== superSession.id) await service.auth.admin.deleteUser(user.id); }
    const remainingUsers = (await service.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users.filter((user) => userIds.includes(user.id) || emails.includes(user.email || ""));
    await service.from("cities").delete().eq("id", cityId);
    const [{ count: cityCount }, { count: placeCount }, { count: sourceCount }] = await Promise.all([service.from("cities").select("id", { count: "exact", head: true }).eq("id", cityId), service.from("places").select("id", { count: "exact", head: true }).in("id", cleanupIds.places.length ? cleanupIds.places : [randomUUID()]), service.from("content_sources").select("id", { count: "exact", head: true }).eq("id", cleanupIds.source)]);
    record("cleanup", "přesná ID a testRunId", "0/0/0/0", `${remainingUsers.length}/${cityCount || 0}/${placeCount || 0}/${sourceCount || 0}`, remainingUsers.length === 0 && !cityCount && !placeCount && !sourceCount);
    const superCheck = await service.from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin"); record("cleanup", "zachován jediný superadmin", "1", String(superCheck.count || 0), superCheck.count === 1);
  }
  const failed = results.filter((result) => result.status === "FAIL"); const report = { runId, production: baseUrl, passed: results.length - failed.length, failed: failed.length, results };
  const reportDir = "artifacts/admin-role-matrix"; await mkdir(reportDir, { recursive: true }); await writeFile(`${reportDir}/${runId}.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ runId, passed: report.passed, failed: report.failed, report: `${reportDir}/${runId}.json` }));
  return report;
}

const reports = [];
for (let iteration = 1; iteration <= 2; iteration += 1) { const report = await runMatrix(iteration); reports.push(report); if (report.failed) break; }
const failed = reports.reduce((total, report) => total + report.failed, 0);
console.log(JSON.stringify({ runs: reports.map(({ runId, passed, failed: runFailed }) => ({ runId, passed, failed: runFailed })), totalFailed: failed }));
if (reports.length !== 2 || failed) process.exitCode = 1;
