import { readFile } from "node:fs/promises";

async function loadEnv(path) {
  try {
    for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // CI nebo lokální shell mohou hodnoty předat přímo.
  }
}

await loadEnv(".env.local");
const city = process.argv.find((value) => value.startsWith("--city="))?.split("=")[1];
if (!city || !["brno", "praha", "olomouc", "ostrava"].includes(city)) {
  throw new Error("Použijte --city=brno|praha|olomouc|ostrava.");
}
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET není lokálně dostupný.");
const site = (process.env.PRODUCTION_SITE_URL || "https://studenthubapp.cz").replace(/\/$/, "");
const response = await fetch(`${site}/api/cron/sync-sources?city=${encodeURIComponent(city)}`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(70_000),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Produkční synchronizace skončila HTTP ${response.status}: ${String(payload.message || "neznámá chyba")}`);
const results = Array.isArray(payload.results) ? payload.results : [];
console.log(JSON.stringify({
  city,
  processed: results.length,
  statuses: results.reduce((summary, result) => {
    const status = String(result.status || "unknown");
    summary[status] = (summary[status] || 0) + 1;
    return summary;
  }, {}),
  placesProcessed: Array.isArray(payload.placeSources) ? payload.placeSources.length : 0,
  communityEventsProcessed: Array.isArray(payload.communityEventSources) ? payload.communityEventSources.length : 0,
}, null, 2));
