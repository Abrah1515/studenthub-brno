import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ContentSource } from "@/lib/sources/types";
import { SourceBlockedError } from "@/lib/sources/validation";
import { robotsAllowsPath } from "@/lib/sources/robots";

const maxBytes = 5 * 1024 * 1024;
const timeoutMs = 15_000;
const userAgent = process.env.SYNC_USER_AGENT || "StudentHub-Brno/1.0 (+https://studenthub-brno.cz/kontakt)";

function privateAddress(address: string) {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export async function validateSourceUrl(value: string, source: ContentSource) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Zdroj musí používat registrovanou HTTPS adresu.");
  const host = url.hostname.toLowerCase(); const officialDomains = [source.officialDomain, ...(source.allowedDomains || [])].map((domain) => domain.toLowerCase());
  if (!officialDomains.some((official) => host === official || host.endsWith(`.${official}`))) throw new Error("Přesměrování vede mimo registrovanou oficiální doménu.");
  const addresses = await lookup(host, { all: true }); if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("Zdroj směřuje na lokální nebo privátní adresu.");
  return url;
}

async function assertRobotsAllowed(url: URL, source: ContentSource) {
  const robotsUrl = new URL("/robots.txt", url.origin); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await validateSourceUrl(robotsUrl.href, source); const response = await fetch(robotsUrl, { headers: { "user-agent": userAgent }, signal: controller.signal, cache: "no-store" });
    if ([404, 410].includes(response.status)) return;
    if (!response.ok) throw new SourceBlockedError({ code: "robots_unavailable", status: "needs_review", message: `Pravidla robots.txt nejsou dočasně dostupná (HTTP ${response.status}); zdroj jsme preventivně nestáhli.` }, { finalUrl: robotsUrl.href, contentType: response.headers.get("content-type") || undefined });
    const text = await response.text();
    if (!robotsAllowsPath(`${url.pathname}${url.search}`, text)) throw new SourceBlockedError({ code: "robots_disallowed", status: "blocked", message: "Stahování této oficiální cesty zakazuje robots.txt; pravidlo respektujeme a zdroj zůstává v ručním režimu." }, { finalUrl: url.href, contentType: "text/plain" });
  } catch (error) {
    if (error instanceof SourceBlockedError) throw error;
    throw new SourceBlockedError({ code: "robots_unavailable", status: "needs_review", message: "Pravidla robots.txt se nepodařilo bezpečně ověřit; zdroj jsme preventivně nestáhli a zkusíme jej později." }, { finalUrl: robotsUrl.href });
  } finally { clearTimeout(timer); }
}

export async function fetchRegisteredSource(source: ContentSource, conditional: { etag?: string | null; lastModified?: string | null } = {}) {
  let url = await validateSourceUrl(source.sourceUrl, source); await assertRobotsAllowed(url, source);
  const headers = new Headers({ "user-agent": userAgent, accept: "text/calendar, application/json, application/xml, text/html, application/pdf;q=0.9, */*;q=0.1" });
  if (conditional.etag) headers.set("if-none-match", conditional.etag); if (conditional.lastModified) headers.set("if-modified-since", conditional.lastModified);
  let metaRefreshes = 0;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers, signal: controller.signal, cache: "no-store", redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location"); if (!location) throw new Error("Neplatné přesměrování zdroje.");
        const target = await validateSourceUrl(new URL(location, url).href, source);
        if (/\/turnstile\.php(?:$|\?)/i.test(target.href)) throw new SourceBlockedError({ code: "challenge", status: "blocked", message: "Oficiální zdroj přesměroval na ochrannou Turnstile stránku. Ochranu neobcházíme; zdroj zůstává v ručním režimu." }, { finalUrl: target.href, contentType: "text/html" });
        await assertRobotsAllowed(target, source);
        url = target; continue;
      }
      if (response.status === 304) return { status: 304, body: new Uint8Array(), contentType: "", etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), finalUrl: url.href };
      if (!response.ok) throw new Error(`Zdroj odpověděl HTTP ${response.status}.`);
      const declared = Number(response.headers.get("content-length") || 0); if (declared > maxBytes) throw new Error("Dokument překračuje povolenou velikost 5 MB.");
      const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      if (!reader) throw new Error("Zdroj neposkytl čitelné tělo odpovědi.");
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes) { await reader.cancel(); throw new Error("Dokument překračuje povolenou velikost 5 MB."); } chunks.push(value); }
      const body = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      if (contentType.toLowerCase().includes("text/html") && metaRefreshes < 1 && /<meta\s+http-equiv=["']?refresh/i.test(new TextDecoder().decode(body))) {
        const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
        if (cookie) { headers.set("cookie", cookie); metaRefreshes += 1; redirects -= 1; continue; }
      }
      return { status: response.status, body, contentType, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), finalUrl: url.href };
    } finally { clearTimeout(timer); }
  }
  throw new Error("Zdroj překročil maximální počet přesměrování.");
}
