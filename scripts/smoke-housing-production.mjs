import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

async function localEnvironment() {
  try {
    const text = await readFile(".env.local", "utf8");
    return Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^(['"])(.*)\1$/, "$2")]));
  } catch { return {}; }
}

const local = await localEnvironment();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || local.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || local.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = (process.env.PRODUCTION_BASE_URL || "https://studenthubapp.cz").replace(/\/$/, "");
const productionUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const confirmation = process.env.CONFIRM_PRODUCTION_HOUSING_SMOKE || process.argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length);
if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Produkční test Bydlení vyžaduje lokální Supabase URL, anon key a service-role key.");
if (confirmation !== "studenthub-brno") throw new Error("Pro vědomý produkční test nastavte CONFIRM_PRODUCTION_HOUSING_SMOKE=studenthub-brno.");

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const password = `Housing-${randomUUID()}-Aa1!`;
const createdUsers = [];
const listingIds = [];
const conversationIds = [];

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryNetwork(operation, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      const cause = error && typeof error === "object" && "cause" in error ? error.cause : null;
      const detail = `${error instanceof Error ? error.message : error} ${cause instanceof Error ? cause.message : ""} ${cause && typeof cause === "object" && "code" in cause ? cause.code : ""}`;
      if (attempt === attempts - 1 || !/(fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|network)/i.test(detail)) throw error;
      await pause(500 * (2 ** attempt));
    }
  }
  throw lastError;
}

function authCookies(session) {
  const key = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunks = encoded.length <= 3180 ? [{ name: key, value: encoded }] : Array.from({ length: Math.ceil(encoded.length / 3180) }, (_, index) => ({ name: `${key}.${index}`, value: encoded.slice(index * 3180, (index + 1) * 3180) }));
  return chunks.map(({ name, value }) => `${name}=${value}`).join("; ");
}

async function createSyntheticUser(label) {
  const email = `studenthub-housing-smoke-${label}-${suffix}@example.com`;
  const result = await retryNetwork(() => service.auth.admin.createUser({ email, password, email_confirm: true }));
  if (result.error || !result.data.user) throw result.error || new Error("Syntetický účet se nepodařilo vytvořit.");
  const id = result.data.user.id;
  createdUsers.push(id);
  const profile = await service.from("profiles").update({
    username: `housing_${label}_${suffix}`,
    display_name: `Housing smoke ${label}`,
    city_id: "brno",
    profile_visibility: "public",
    account_status: "active",
    is_blocked: false,
    community_rules_accepted_at: new Date().toISOString(),
    allow_chat_requests: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  }).eq("id", id);
  if (profile.error) throw profile.error;
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await retryNetwork(() => client.auth.signInWithPassword({ email, password }));
  if (signed.error || !signed.data.session) throw signed.error || new Error("Syntetický účet se nepodařilo přihlásit.");
  return { id, client, cookie: authCookies(signed.data.session) };
}

async function api(user, path, options = {}) {
  const { networkRetries = 0, ...fetchOptions } = options;
  const response = await retryNetwork(() => fetch(`${baseUrl}${path}`, {
    ...fetchOptions,
    headers: { "user-agent": productionUserAgent, accept: "application/json", ...(fetchOptions.headers || {}), cookie: user.cookie },
    redirect: "manual",
  }), networkRetries + 1);
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

function photoBlob() {
  const canvas = createCanvas(800, 600);
  const context = canvas.getContext("2d");
  context.fillStyle = "#eef2ff";
  context.fillRect(0, 0, 800, 600);
  context.fillStyle = "#4f46e5";
  context.fillRect(80, 90, 640, 420);
  context.fillStyle = "#ffffff";
  context.font = "bold 42px sans-serif";
  context.fillText("STUDENTHUB E2E", 205, 320);
  return new Blob([canvas.encodeSync("webp", 82)], { type: "image/webp" });
}

function offerForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ listingType: "offer", category: "private_room", title: `[E2E ${suffix}] Nabídka pokoje`, locality: "Královo Pole", availableFrom: "2026-10-01", stayLength: "6_12_months", shortDescription: "Dočasný produkční test nabídky studentského bydlení.", description: "Dočasný syntetický inzerát slouží výhradně k řízenému produkčnímu testu modulu Bydlení a bude po kontrole automaticky odstraněn.", priceMonthly: "7500", utilitiesIncluded: "true", depositAmount: "7500", availableSpots: "1", currentOccupants: "2", furnished: "true", transitAccess: "Tramvaj přibližně pět minut pěšky", cityId: "brno", company: "" })) form.append(key, value);
  form.append("features", "internet");
  form.append("photos", photoBlob(), `housing-e2e-${suffix}.webp`);
  return form;
}

function wantedForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ listingType: "wanted", category: "apartment", title: `[E2E ${suffix}] Hledám byt`, locality: "Bohunice", availableFrom: "2026-10-15", stayLength: "over_year", shortDescription: "Dočasný produkční test poptávky studentského bydlení.", description: "Dočasná syntetická poptávka slouží výhradně k řízenému produkčnímu testu modulu Bydlení a bude po kontrole automaticky odstraněna.", priceMonthly: "12000", utilitiesIncluded: "true", wantedPersonCount: "1", cityId: "brno", company: "" })) form.append(key, value);
  form.append("lifestylePreferences", "quiet_home");
  return form;
}

async function productionScreenshots() {
  await mkdir("artifacts", { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      const context = await browser.newContext({ viewport: { width, height }, locale: "cs-CZ" });
      await context.addInitScript(() => {
        localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
        localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: null, facultyId: null, studyYear: null, studyYearCycleStart: null, completed: true }));
        localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: "completed", lastCompletedStep: "complete" }));
      });
      const page = await context.newPage();
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      const response = await page.goto(`${baseUrl}/brno/bydleni`, { waitUntil: "networkidle" });
      if (!response?.ok()) throw new Error(`Produkční stránka Bydlení v ${width} px vrátila HTTP ${response?.status()}.`);
      await page.getByRole("heading", { name: "Bydlení", exact: true }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) throw new Error(`Produkční Bydlení přetéká o ${overflow}px při ${width}×${height}.`);
      if (errors.length) throw new Error(`Konzole Bydlení při ${width}×${height}: ${errors.join(" | ")}`);
      await page.screenshot({ path: `artifacts/production-housing-${width}x${height}.png`, fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); }
}

try {
  const author = await createSyntheticUser("author");
  const seeker = await createSyntheticUser("seeker");

  const offer = await api(author, "/api/housing/listings", { method: "POST", body: offerForm() });
  if (offer.status !== 201 || offer.body?.status !== "active") throw new Error(`Produkční nabídka nevznikla jako aktivní (HTTP ${offer.status}, stav ${offer.body?.status || "?"}).`);
  listingIds.push(offer.body.id);
  const wanted = await api(seeker, "/api/housing/listings", { method: "POST", body: wantedForm() });
  if (wanted.status !== 201 || wanted.body?.status !== "active") throw new Error(`Produkční poptávka nevznikla jako aktivní (HTTP ${wanted.status}, stav ${wanted.body?.status || "?"}).`);
  listingIds.push(wanted.body.id);

  const publicFeed = await retryNetwork(() => fetch(`${baseUrl}/api/housing/listings?type=offer&q=${encodeURIComponent(`[E2E ${suffix}]`)}`, { headers: { "user-agent": productionUserAgent, accept: "application/json" } }));
  const publicJson = await publicFeed.json();
  if (!publicFeed.ok || publicJson.items?.length !== 1 || /moderation_note|duplicate_fingerprint|email|phone/.test(JSON.stringify(publicJson))) throw new Error("Veřejný feed nepotvrdil nabídku nebo propustil neveřejné údaje.");
  await productionScreenshots();

  const chat = await api(seeker, "/api/chat/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contextType: "housing_listing", contextId: offer.body.id, message: "Mám zájem o prohlídku testovací nabídky.", clientNonce: randomUUID() }) });
  if (chat.status !== 201 || !chat.body?.conversation?.id) throw new Error(`Chatová žádost nevznikla (HTTP ${chat.status}).`);
  const conversationId = chat.body.conversation.id;
  conversationIds.push(conversationId);
  const reply = await api(author, `/api/chat/conversations/${conversationId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Přijímám žádost odpovědí.", clientNonce: randomUUID() }), networkRetries: 3 });
  const activeConversation = await service.from("chat_conversations").select("status").eq("id", conversationId).single();
  if (reply.status !== 201 || activeConversation.error || activeConversation.data.status !== "active") throw new Error("Odpověď nepřijala žádost o kontakt.");

  const blocked = await api(seeker, `/api/chat/conversations/${conversationId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "block" }), networkRetries: 3 });
  if (blocked.status !== 200) throw new Error("Blokování v produkčním chatu selhalo.");
  const blockedMessage = await api(author, `/api/chat/conversations/${conversationId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Tato zpráva nesmí projít.", clientNonce: randomUUID() }) });
  if (blockedMessage.status < 400) throw new Error("Blokování nezastavilo další zprávu.");

  const unauthorized = await api(seeker, `/api/housing/listings/${offer.body.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", version: 1, title: "Cizí úprava nesmí projít" }) });
  if (![403, 404].includes(unauthorized.status)) throw new Error(`Cizí úprava nebyla odmítnuta (HTTP ${unauthorized.status}).`);
  const report = await api(seeker, `/api/housing/listings/${offer.body.id}/report`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "other", detail: "Řízené produkční E2E hlášení; po testu bude odstraněno.", company: "" }) });
  if (report.status !== 201) throw new Error(`Produkční hlášení selhalo (HTTP ${report.status}).`);
  const reportRow = await service.from("housing_reports").select("id").eq("listing_id", offer.body.id).eq("reporter_id", seeker.id).single();
  if (reportRow.error) throw reportRow.error;

  const version = await service.from("housing_listings").select("version").eq("id", offer.body.id).single();
  const occupied = await api(author, `/api/housing/listings/${offer.body.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "occupied", version: version.data.version }) });
  if (occupied.status !== 200) throw new Error(`Označení Obsazeno selhalo (HTTP ${occupied.status}).`);

  const promoted = await service.from("profiles").update({ role: "city_editor", city_id: "brno" }).eq("id", author.id);
  if (promoted.error) throw promoted.error;
  const moderated = await api(author, "/api/admin/housing", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ listingId: offer.body.id, reportId: reportRow.data.id, action: "resolve_report", reason: "Řízené E2E ověření administračního zpracování." }) });
  if (moderated.status !== 200) throw new Error(`Administrační zpracování selhalo (HTTP ${moderated.status}).`);

  console.log(JSON.stringify({ passed: true, offerCreated: true, wantedCreated: true, publicPrivacy: true, chatRequestAccepted: true, blockingEnforced: true, foreignEditDenied: true, reportModerated: true, occupiedLifecycle: true, screenshots: 3, cleanup: "pending" }));
} finally {
  const cleanupErrors = [];
  try {
    if (conversationIds.length) {
      await service.from("internal_notifications").delete().in("target_id", conversationIds);
      await service.from("chat_conversations").delete().in("id", conversationIds);
    }
    if (listingIds.length) {
      const photos = await service.from("housing_photos").select("storage_path").in("listing_id", listingIds);
      if (photos.data?.length) await service.storage.from("housing-images").remove(photos.data.map((item) => item.storage_path));
      await service.from("housing_moderation_actions").delete().in("listing_id", listingIds);
      await service.from("housing_reports").delete().in("listing_id", listingIds);
      await service.from("housing_history").delete().in("listing_id", listingIds);
      await service.from("housing_daily_stats").delete().in("listing_id", listingIds);
      await service.from("housing_photos").delete().in("listing_id", listingIds);
      await service.from("housing_listings").delete().in("id", listingIds);
    }
    for (const id of createdUsers) {
      const keyHash = createHash("sha256").update(`housing:account:${id}`).digest("hex").slice(0, 24);
      await service.from("housing_rate_limits").delete().eq("key_hash", keyHash);
    }
    for (const id of [...createdUsers].reverse()) {
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error) cleanupErrors.push(removed.error.message);
    }
    const leftover = await service.from("housing_listings").select("id", { count: "exact", head: true }).like("title", `[E2E ${suffix}]%`);
    if (leftover.error || leftover.count) cleanupErrors.push("Po testu zůstal syntetický inzerát.");
  } catch (error) { cleanupErrors.push(error instanceof Error ? error.message : "Neznámá chyba úklidu."); }
  if (cleanupErrors.length) throw new Error(`Úklid produkčního E2E selhal: ${cleanupErrors.join(" | ")}`);
  console.log(JSON.stringify({ syntheticAccountsRemoved: createdUsers.length, syntheticListingsRemoved: listingIds.length, syntheticConversationsRemoved: conversationIds.length }));
}
