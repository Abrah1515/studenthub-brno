import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ContentSource } from "@/lib/sources/types";
import { SourceBlockedError } from "@/lib/sources/validation";
import { robotsAllowsPath } from "@/lib/sources/robots";

const maxBytes = 5 * 1024 * 1024;
const timeoutMs = 15_000;
const userAgent = process.env.SYNC_USER_AGENT || "StudentHub-Brno/1.0 (+https://studenthubapp.cz/kontakt)";
const robotsCache = new Map<string, { value: string | null; expiresAt: number }>();
const robotsCacheMs = 30 * 60 * 1000;

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
  const robotsUrl = new URL("/robots.txt", url.origin);
  const cached = process.env.NODE_ENV === "test" ? undefined : robotsCache.get(robotsUrl.href);
  const disallowed = () => new SourceBlockedError({ code: "robots_disallowed", status: "blocked", message: "Stahování této oficiální cesty zakazuje robots.txt; zdroj zůstává v ručním režimu." }, { finalUrl: url.href });
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.value !== null && !robotsAllowsPath(`${url.pathname}${url.search}`, cached.value)) throw disallowed();
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  let target = robotsUrl;
  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      await validateSourceUrl(target.href, source);
      const response = await fetch(target, { headers: { "user-agent": userAgent, accept: "text/plain", connection: "close" }, redirect: "manual", signal: controller.signal, cache: "no-store" });
      const contentType = response.headers.get("content-type") || "";
      const fail = (message: string, status: "blocked" | "needs_review" = "needs_review", code: "challenge" | "robots_unavailable" = "robots_unavailable"): never => {
        throw new SourceBlockedError({ code, status, message }, { finalUrl: target.href, contentType });
      };
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirects === 3) fail("Neplatné nebo příliš dlouhé přesměrování robots.txt.");
        const next = new URL(location!, target);
        if (/turnstile|captcha|challenge/i.test(next.pathname)) fail("robots.txt přesměroval na ochrannou stránku; ochranu neobcházíme.", "blocked", "challenge");
        target = await validateSourceUrl(next.href, source);
        continue;
      }
      // Bound even untrusted policy responses. Never solve/replay a cookie or JS challenge.
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 512 * 1024) { await reader.cancel(); fail("robots.txt překročil bezpečný limit velikosti."); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const text = new TextDecoder().decode(bytes);
      if (/<(?:!doctype|html|head|script|meta)\b/i.test(text) && /cf-turnstile|captcha|challenge|crypto\.subtle|http-equiv\s*=\s*["']?refresh/i.test(text)) fail("robots.txt vrátil ochrannou HTML/JavaScript výzvu; zdroj zůstává v ručním režimu.", "blocked", "challenge");
      if ([401, 403].includes(response.status)) fail(`Přístup k robots.txt je zakázán (HTTP ${response.status}).`, "blocked");
      if ([404, 410].includes(response.status)) {
        if (process.env.NODE_ENV !== "test") robotsCache.set(robotsUrl.href, { value: null, expiresAt: Date.now() + robotsCacheMs });
        return;
      }
      if (!response.ok) fail(`Pravidla robots.txt nejsou dočasně dostupná (HTTP ${response.status}).`);
      if (!/^text\/plain(?:\s*;|$)/i.test(contentType.trim())) fail("Pravidla robots.txt mají neplatný MIME typ; zdroj jsme preventivně nestáhli.");
      if (/<[a-z!][^>]*>/i.test(text) || text.includes("\u0000")) fail("Pravidla robots.txt neobsahují platný textový dokument.");
      if (process.env.NODE_ENV !== "test") robotsCache.set(robotsUrl.href, { value: text, expiresAt: Date.now() + robotsCacheMs });
      if (!robotsAllowsPath(`${url.pathname}${url.search}`, text)) throw disallowed();
      return;
    }
  } catch (error) {
    if (error instanceof SourceBlockedError) throw error;
    throw new SourceBlockedError({ code: "robots_unavailable", status: "needs_review", message: "Pravidla robots.txt se nepodařilo bezpečně ověřit (síť, timeout nebo nepovolené přesměrování); zdroj jsme nestáhli." }, { finalUrl: target.href });
  } finally { clearTimeout(timer); }
}

export async function fetchRegisteredSource(source: ContentSource, conditional: { etag?: string | null; lastModified?: string | null } = {}) {
  let url = await validateSourceUrl(source.sourceUrl, source); await assertRobotsAllowed(url, source);
  const headers = new Headers({ "user-agent": userAgent, accept: "text/calendar, application/json, application/xml, text/html, application/pdf;q=0.9, */*;q=0.1", connection: "close" });
  if (conditional.etag) headers.set("if-none-match", conditional.etag); if (conditional.lastModified) headers.set("if-modified-since", conditional.lastModified);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers, signal: controller.signal, cache: "no-store", redirect: "manual" });
      // HTTP 304 patří podmíněnému GET a nemá Location. Musí se zpracovat před
      // obecnou 3xx větví, jinak se platná odpověď chybně označí za přesměrování.
      if (response.status === 304) return { status: 304, body: new Uint8Array(), contentType: "", contentDisposition: response.headers.get("content-disposition"), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), finalUrl: url.href };
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location"); if (!location) throw new Error("Neplatné přesměrování zdroje.");
        const target = await validateSourceUrl(new URL(location, url).href, source);
        if (/\/turnstile\.php(?:$|\?)/i.test(target.href)) throw new SourceBlockedError({ code: "challenge", status: "blocked", message: "Oficiální zdroj přesměroval na ochrannou Turnstile stránku. Ochranu neobcházíme; zdroj zůstává v ručním režimu." }, { finalUrl: target.href, contentType: "text/html" });
        await assertRobotsAllowed(target, source);
        url = target; continue;
      }
      if (!response.ok) throw new Error(`Zdroj odpověděl HTTP ${response.status}.`);
      const declared = Number(response.headers.get("content-length") || 0); if (declared > maxBytes) throw new Error("Dokument překračuje povolenou velikost 5 MB.");
      const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let length = 0;
      if (!reader) throw new Error("Zdroj neposkytl čitelné tělo odpovědi.");
      while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maxBytes) { await reader.cancel(); throw new Error("Dokument překračuje povolenou velikost 5 MB."); } chunks.push(value); }
      const body = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      if (contentType.toLowerCase().includes("html") && /crypto\.subtle|cf-turnstile|captcha-container|verify you are human|<meta\s+http-equiv=["']?refresh/i.test(new TextDecoder().decode(body))) {
        throw new SourceBlockedError({ code: "challenge", status: "blocked", message: "Zdroj vrátil ochrannou nebo automaticky přesměrovávající stránku; zdroj zůstává v ručním režimu bez opakování cookies." }, { finalUrl: url.href, contentType });
      }
      return { status: response.status, body, contentType, contentDisposition: response.headers.get("content-disposition"), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified"), finalUrl: url.href };
    } finally { clearTimeout(timer); }
  }
  throw new Error("Zdroj překročil maximální počet přesměrování.");
}
