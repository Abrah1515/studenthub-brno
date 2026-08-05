import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = process.argv[2] || process.env.PWA_CHECK_URL || "";
const errors = [];
const ok = (condition, message) => { if (!condition) errors.push(message); };
const read = (path) => readFileSync(resolve(root, path));

function pngSize(buffer) {
  ok(buffer.length >= 24 && buffer.subarray(1, 4).toString("ascii") === "PNG", "Ikona není platný PNG soubor.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const [path, size] of [
  ["public/brand/brno/icon-192.png", 192],
  ["public/brand/brno/icon-512.png", 512],
  ["public/brand/brno/icon-maskable-192.png", 192],
  ["public/brand/brno/icon-maskable-512.png", 512],
]) {
  const dimensions = pngSize(read(path));
  ok(dimensions.width === size && dimensions.height === size, `${path} musí mít ${size}×${size} px.`);
}

const manifestSource = read("lib/pwa-manifest.ts").toString("utf8");
const workerSource = read("public/sw.js").toString("utf8");
ok(manifestSource.includes('short_name: brand.platformName'), "Manifest musí používat krátký název StudentHub.");
ok(manifestSource.includes('scope: "/"'), "Manifest musí mít scope /.");
ok((manifestSource.match(/purpose: "maskable"/g) || []).length === 2, "Manifest musí obsahovat obě maskable ikony.");
ok(workerSource.includes('request.mode === "navigate"'), "Service worker musí obsloužit offline navigaci.");
ok(workerSource.includes("isPrivatePath(url.pathname)"), "Service worker musí vyloučit soukromé cesty.");
ok(workerSource.includes('url.pathname.startsWith("/_next/static/")'), "Service worker smí cachovat verzované Next.js assety.");
ok(!workerSource.includes("cache.put(event.request"), "Service worker nesmí bez rozlišení cachovat každou odpověď.");

if (target) {
  const base = new URL(target);
  ok(base.protocol === "https:" || ["localhost", "127.0.0.1"].includes(base.hostname), "PWA musí běžet přes HTTPS nebo localhost.");
  const manifestResponse = await fetch(new URL("/manifest.webmanifest", base), { redirect: "follow" });
  ok(manifestResponse.ok, `Manifest vrací HTTP ${manifestResponse.status}.`);
  ok((manifestResponse.headers.get("content-type") || "").includes("manifest+json"), "Manifest má neočekávaný MIME typ.");
  const manifest = await manifestResponse.json();
  ok(manifest.name === "StudentHub Brno", "Manifest name není StudentHub Brno.");
  ok(manifest.short_name === "StudentHub", "Manifest short_name není StudentHub.");
  ok(manifest.start_url === "/brno" && manifest.scope === "/" && manifest.display === "standalone", "Manifest nemá správný start_url, scope nebo display.");
  ok(manifest.theme_color && manifest.background_color, "Manifest nemá barvy aplikace.");
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  ok(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"), "Chybí běžná ikona 192×192.");
  ok(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"), "Chybí běžná ikona 512×512.");
  ok(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "maskable"), "Chybí maskable ikona 192×192.");
  ok(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"), "Chybí maskable ikona 512×512.");
  for (const icon of icons) {
    const response = await fetch(new URL(icon.src, base));
    ok(response.ok && (response.headers.get("content-type") || "").includes("image/png"), `Ikona ${icon.src} není dostupná jako PNG.`);
  }
  const workerResponse = await fetch(new URL("/sw.js", base));
  ok(workerResponse.ok, `Service worker vrací HTTP ${workerResponse.status}.`);
  ok((workerResponse.headers.get("cache-control") || "").includes("no-cache") || (workerResponse.headers.get("cache-control") || "").includes("no-store"), "Service worker musí mít revalidační Cache-Control.");
  ok((workerResponse.headers.get("service-worker-allowed") || "/") === "/", "Service worker nemá scope /.");
  const offlineResponse = await fetch(new URL("/offline.html", base));
  ok(offlineResponse.ok && (await offlineResponse.text()).includes("Teď jste offline"), "Offline stránka není dostupná.");
}

if (errors.length) {
  console.error(`[PWA] Kontrola selhala (${errors.length}):`);
  errors.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`[PWA] Manifest, 4 ikony, bezpečný service worker a offline stránka jsou v pořádku${target ? ` na ${new URL(target).origin}` : ""}.`);
}
