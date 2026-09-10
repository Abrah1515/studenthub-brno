import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = resolve(import.meta.dirname, "..");
const target = process.argv[2] || process.env.PWA_CHECK_URL || "";
const errors = [];
const ok = (condition, message) => { if (!condition) errors.push(message); };
const read = (path) => readFileSync(resolve(root, path));

function pngSize(buffer) {
  ok(buffer.length >= 24 && buffer.subarray(1, 4).toString("ascii") === "PNG", "Ikona není platný PNG soubor.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const [path, width, height] of [
  ["public/brand/brno/studenthub-logo-v2.png", 216, 219],
  ["public/brand/brno/studenthub-logo-dark-v2.png", 216, 219],
  ["public/brand/brno/studenthub-symbol-v2.png", 155, 150],
  ["public/brand/brno/studenthub-icon-v2-192.png", 192, 192],
  ["public/brand/brno/studenthub-icon-v2-512.png", 512, 512],
  ["public/brand/brno/studenthub-icon-maskable-v2-192.png", 192, 192],
  ["public/brand/brno/studenthub-icon-maskable-v2-512.png", 512, 512],
  ["public/brand/brno/studenthub-apple-touch-v2-180.png", 180, 180],
  ["public/brand/brno/studenthub-favicon-v2-16.png", 16, 16],
  ["public/brand/brno/studenthub-favicon-v2-32.png", 32, 32],
  ["public/brand/brno/studenthub-favicon-v2-48.png", 48, 48],
  ["public/brand/brno/studenthub-og-v2.png", 1200, 630],
]) {
  const dimensions = pngSize(read(path));
  ok(dimensions.width === width && dimensions.height === height, `${path} musí mít ${width}×${height} px.`);
}

async function redCoverage(path) {
  const image = await loadImage(read(path));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let red = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] > 100 && pixels[index] > 160 && pixels[index] - pixels[index + 1] > 55 && pixels[index] - pixels[index + 2] > 35) red += 1;
  }
  return red / (image.width * image.height);
}

ok(await redCoverage("public/brand/brno/studenthub-icon-v2-512.png") > 0.48, "Běžná PWA ikona neobsahuje očekávaný původní červený symbol.");
ok(await redCoverage("public/brand/brno/studenthub-icon-maskable-v2-512.png") > 0.18, "Maskable PWA ikona neobsahuje očekávaný původní červený symbol.");

const manifestSource = read("lib/pwa-manifest.ts").toString("utf8");
const brandSource = read("lib/brand.ts").toString("utf8");
const workerSource = read("public/sw.js").toString("utf8");
ok(manifestSource.includes('short_name: brand.platformName'), "Manifest musí používat krátký název StudentHub.");
ok(manifestSource.includes('scope: "/"'), "Manifest musí mít scope /.");
ok((manifestSource.match(/purpose: "maskable"/g) || []).length === 2, "Manifest musí obsahovat obě maskable ikony.");
ok(brandSource.includes('primary: "#4F46E5"'), "PWA musí používat primární barvu Campus Indigo.");
ok(brandSource.includes('lightTheme: "#F8FAFC"') && brandSource.includes('darkTheme: "#0F172A"'), "PWA musí používat schválená pozadí Campus Indigo.");
ok(brandSource.includes('studenthub-logo-v2.png') && brandSource.includes('studenthub-logo-dark-v2.png'), "Aplikace musí používat světlou i tmavou variantu dodaného loga.");
ok(brandSource.includes('studenthub-apple-touch-v2-180.png'), "Metadata musí používat samostatnou Apple Touch Icon.");
ok(workerSource.includes('studenthub-static-v7'), "Service worker musí po změně loga používat novou verzi cache.");
ok(!workerSource.includes('"/brand/brno/icon-'), "Service worker nesmí aktivně odkazovat na nezverzované staré ikony.");
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
  ok(manifest.theme_color === "#4F46E5" && manifest.background_color === "#F8FAFC", "Manifest nemá schválenou paletu Campus Indigo.");
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  ok(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"), "Chybí běžná ikona 192×192.");
  ok(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"), "Chybí běžná ikona 512×512.");
  ok(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "maskable"), "Chybí maskable ikona 192×192.");
  ok(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"), "Chybí maskable ikona 512×512.");
  ok(icons.every((icon) => String(icon.src).includes("studenthub-icon") && String(icon.src).includes("v2")), "Manifest musí odkazovat pouze na nové verzované logo assety.");
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
