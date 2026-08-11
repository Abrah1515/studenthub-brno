const { contentSources } = await import("../lib/sources/registry.ts");
const { robotsAllowsPath } = await import("../lib/sources/robots.ts");
const userAgent = process.env.SYNC_USER_AGENT || "StudentHub-Brno/1.0 (+https://studenthub-brno.cz/kontakt)";
const now = new Date();
const currentStartYear = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const expectedAcademicYear = `${currentStartYear}/${currentStartYear + 1}`;

function allowed(url, source) {
  if (url.protocol !== "https:" || url.username || url.password) return false;
  return [source.officialDomain, ...(source.allowedDomains || [])].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
}
function mime(value) { return String(value || "").toLowerCase().split(";", 1)[0].trim(); }
function academicYear(value) {
  const full = value.match(/(20\d{2})\s*[\/_-]\s*(20\d{2})/); if (full && Number(full[2]) === Number(full[1]) + 1) return `${full[1]}/${full[2]}`;
  const short = value.match(/(20\d{2})\s*[\/_-]\s*(\d{2})(?!\d)/); if (short && Number(short[1]) + 1 === Number(`${short[1].slice(0, 2)}${short[2]}`)) return `${short[1]}/${Number(short[1]) + 1}`;
  const semester = value.normalize("NFD").replace(/\p{Diacritic}/gu, "").match(/(?:podzim|zima)\s*(20\d{2})/i); return semester ? `${semester[1]}/${Number(semester[1]) + 1}` : null;
}
function expectedMime(source) { return source.format === "pdf" ? "application/pdf" : source.format === "ics" ? "text/calendar" : source.format === "json" || source.format === "api" ? "application/json" : "text/html"; }
function mimeMatches(source, contentType) {
  const actual = mime(contentType); const expected = expectedMime(source);
  if (expected === "text/html") return actual === "text/html" || actual === "application/xhtml+xml";
  if (expected === "application/pdf") return actual === "application/pdf" || actual === "application/octet-stream";
  return actual === expected;
}
const robotsCache = new Map();
async function robotsDecision(url, source) {
  const cacheKey = url.origin;
  if (!robotsCache.has(cacheKey)) {
    robotsCache.set(cacheKey, (async () => {
      const robotsUrl = new URL("/robots.txt", url.origin);
      if (!allowed(robotsUrl, source)) return { result: "BLOCKED", error: "robots.txt leží mimo povolenou oficiální doménu" };
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(robotsUrl, { signal: controller.signal, redirect: "manual", headers: { "user-agent": userAgent, accept: "text/plain" } });
        if ([404, 410].includes(response.status)) return { result: "OK", text: "" };
        if (!response.ok) return { result: "TEMPORARY", error: `robots.txt odpověděl HTTP ${response.status}` };
        return { result: "OK", text: await response.text() };
      } catch (error) { return { result: "TEMPORARY", error: `robots.txt nelze ověřit: ${error instanceof Error ? error.message : String(error)}` }; }
      finally { clearTimeout(timer); }
    })());
  }
  const rules = await robotsCache.get(cacheKey);
  if (rules.result !== "OK") return rules;
  return robotsAllowsPath(`${url.pathname}${url.search}`, rules.text) ? { result: "OK" } : { result: "BLOCKED", error: "stahování této cesty zakazuje robots.txt" };
}
async function fetchFollowing(start, source) {
  let url = start; let redirected = false; let cookie = ""; let metaRetries = 0;
  for (let count = 0; count <= 4; count += 1) {
    if (!allowed(url, source)) return { result: "BLOCKED", status: null, url: url.href, redirected, error: "redirect mimo allowlist" };
    const robots = await robotsDecision(url, source);
    if (robots.result !== "OK") return { result: robots.result, status: null, url: url.href, redirected, error: robots.error };
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { "user-agent": userAgent, accept: "text/html,application/pdf,application/json,text/calendar;q=0.9,*/*;q=0.1", ...(cookie ? { cookie } : {}) } });
      if (response.status >= 300 && response.status < 400) { const location = response.headers.get("location"); if (!location) return { result: "BROKEN", status: response.status, url: url.href, redirected, error: "redirect bez cíle" }; url = new URL(location, url); redirected = true; continue; }
      if (!response.ok) return { result: [404, 410].includes(response.status) ? "BROKEN" : [401, 403].includes(response.status) ? "BLOCKED" : "TEMPORARY", status: response.status, url: url.href, redirected, error: `HTTP ${response.status}` };
      const buffer = new Uint8Array(await response.arrayBuffer()); const contentType = response.headers.get("content-type") || "application/octet-stream"; const text = mime(contentType).includes("html") || mime(contentType).startsWith("text/") ? new TextDecoder().decode(buffer.slice(0, 512_000)) : "";
      if (metaRetries < 1 && /<meta\s+http-equiv=["']?refresh/i.test(text) && response.headers.get("set-cookie")) { cookie = response.headers.get("set-cookie").split(";", 1)[0]; metaRetries += 1; count -= 1; continue; }
      return { result: redirected ? "REDIRECTED" : "OK", status: response.status, url: url.href, redirected, contentType, body: buffer, text };
    } catch (error) { return { result: "TEMPORARY", status: null, url: url.href, redirected, error: error instanceof Error ? error.message : String(error) }; }
    finally { clearTimeout(timer); }
  }
  const challenge = /\/turnstile\.php(?:$|\?)/i.test(url.href);
  return { result: challenge ? "BLOCKED" : "BROKEN", status: null, url: url.href, redirected, contentType: challenge ? "text/html" : undefined, error: challenge ? "ochranná Turnstile challenge; ruční aktualizace" : "příliš mnoho redirectů" };
}
function fitUrl(source) { const url = new URL(source.sourceUrl); url.pathname = `/study/calendar/${currentStartYear}/.cs`; url.search = ""; return url; }
function fsiUrl(source) { const url = new URL(source.sourceUrl); url.searchParams.set("degree", url.searchParams.get("degree") || "0"); url.searchParams.set("mode", url.searchParams.get("mode") || "0"); url.searchParams.set("year", String(currentStartYear)); return url; }
function discoverDocument(source, response) {
  const candidates = [];
  const pageFolded = `${response.url} ${String(response.text || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""}`.replace(/<[^>]+>/g, " ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const calendarDetailPage = /(harmonogram|casov.{0,3}plan|rozpis.{0,8}vyuk).{0,40}akademick.{0,8}rok|akademick.{0,8}rok.{0,40}(harmonogram|casov.{0,3}plan|rozpis.{0,8}vyuk)/i.test(pageFolded);
  for (const match of String(response.text || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url; try { url = new URL(match[1], response.url); } catch { continue; }
    if (!allowed(url, source)) continue;
    const label = `${match[2].replace(/<[^>]+>/g, " ")} ${url.href}`.replace(/\s+/g, " ");
    const folded = label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const isPdfHint = /\.pdf(?:$|[?#])/i.test(url.href) || /^\s*pdf/i.test(match[2].replace(/<[^>]+>/g, " "));
    const contextualAttachment = calendarDetailPage && isPdfHint && /(priloha|harmonogram|plan|rozpis|pdf)/i.test(folded);
    if (!/(harmonogram|casov.{0,3}plan|rozpis.{0,8}vyuk|akademick.{0,8}rok)/i.test(folded) && !contextualAttachment) continue;
    if (/(prijimac|prijeti|stipendi|vyberov|grantov|soutez)/i.test(folded)) continue;
    const year = academicYear(label); const startYear = year ? Number(year.slice(0, 4)) : null;
    let score = isPdfHint ? 40 : 10;
    if (contextualAttachment) score += 35;
    if (isPdfHint && /priloha/i.test(folded)) score += 65;
    if (startYear === currentStartYear) score += 80; else if (startYear) score -= Math.min(60, Math.abs(startYear - currentStartYear) * 12);
    candidates.push({ url, year, score });
  }
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}
function discoverPaginationUrls(source, response, pageLimit) {
  if (pageLimit <= 1) return [];
  const base = new URL(response.url);
  const pages = [];
  for (const match of String(response.text || "").matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    let url; try { url = new URL(match[2], response.url); } catch { continue; }
    if (!allowed(url, source) || url.hostname !== base.hostname || url.pathname.replace(/\/$/, "") !== base.pathname.replace(/\/$/, "")) continue;
    const label = match[4].replace(/<[^>]+>/g, " ").trim();
    const pageValue = [...url.searchParams.entries()].find(([key, value]) => /^(?:str|page|p)$/i.test(key) && /^\d+$/.test(value));
    const relNext = /rel\s*=\s*["'][^"']*next/i.test(`${match[1]} ${match[3]}`);
    if (!pageValue && !relNext && !/^\d{1,3}$/.test(label)) continue;
    pages.push({ url, order: pageValue ? Number(pageValue[1]) : relNext ? 1 : Number(label) });
  }
  return [...new Map(pages.sort((a, b) => a.order - b.order).map((page) => [page.url.href, page])).values()].slice(0, pageLimit - 1).map((page) => page.url);
}
function validateContent(source, response, skipAcademicYear = false) {
  if (!response.body) return response;
  const folded = String(response.text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/\/turnstile\.php(?:\?|$)/i.test(response.url) || /cf-turnstile|challenges\.cloudflare\.com|verify you are human|overte, ze nejste robot/i.test(folded)) return { ...response, result: "BLOCKED", error: "ochranná challenge; ruční aktualizace" };
  if (!mimeMatches(source, response.contentType)) return { ...response, result: "BLOCKED", error: `MIME ${mime(response.contentType)}, očekává se ${expectedMime(source)}` };
  if (source.format === "pdf" && new TextDecoder().decode(response.body.slice(0, 5)) !== "%PDF-") return { ...response, result: "BLOCKED", error: "neplatná PDF hlavička" };
  const detected = academicYear(`${response.url} ${response.text || ""}`);
  const structured = source.parserKey === "muni-is-periods" || source.parserKey === "jamu-is-periods" ? /<table\b[^>]*id=["']obdobi:/i.test(response.text || "")
    : source.parserKey === "mendelu-pef-html" ? /rozvrhovan[aá]\s+v[yý]uka/i.test(response.text || "") && /zkou[sš]kov[eé]\s+obdob[ií]/i.test(response.text || "")
      : source.parserKey === "vut-fit-html" ? response.url.includes(`/calendar/${currentStartYear}/`) && /(v[yý]uka|zkou[sš]kov[eé])/i.test(response.text || "")
        : source.parserKey === "vut-fsi-html" ? /(v[yý]uka|zkou[sš]kov[eé]|akademick)/i.test(response.text || "") : true;
  if (!structured && source.monitoringMode === "automatic_publish") return { ...response, result: "NEEDS_REVIEW", error: "chybí očekávaná struktura akademického kalendáře", detected };
  if (!skipAcademicYear && detected && Number(detected.slice(0, 4)) < currentStartYear) return { ...response, result: "NEEDS_REVIEW", error: `starý akademický rok ${detected}`, detected };
  return { ...response, detected };
}
async function check(source) {
  const started = Date.now(); const start = source.parserKey === "vut-fit-html" ? fitUrl(source) : source.parserKey === "vut-fsi-html" ? fsiUrl(source) : new URL(source.sourceUrl);
  const fetched = await fetchWithRetry(start, source);
  const linked = ["linked-document-review", "linked-document-auto"].includes(source.parserKey);
  const directPdf = linked && ["application/pdf", "application/octet-stream"].includes(mime(fetched.contentType));
  let response = validateContent(directPdf ? { ...source, format: "pdf" } : source, fetched, linked && !directPdf);
  if (directPdf && source.monitoringMode !== "automatic_publish" && ["OK", "REDIRECTED"].includes(response.result)) {
    response.result = "NEEDS_REVIEW"; response.error = "PDF je platné, změna čeká na ruční schválení";
  } else if (linked && ["OK", "REDIRECTED"].includes(response.result)) {
    const visited = new Set();
    const maxDepth = Math.max(1, Math.min(source.discoveryDepth || 2, 3));
    let inheritedYear = response.detected || null;
    let reachedDocument = false;
    const discoveryPages = [response];
    for (const pageUrl of discoverPaginationUrls(source, response, source.discoveryPageLimit || 1)) {
      const page = validateContent({ ...source, format: "html" }, await fetchWithRetry(pageUrl, source), true);
      if (["OK", "REDIRECTED"].includes(page.result)) discoveryPages.push(page);
    }
    for (let depth = 0; depth < maxDepth && ["OK", "REDIRECTED"].includes(response.result); depth += 1) {
      const document = (depth === 0 ? discoveryPages : [response]).map((page) => discoverDocument(source, page)).filter(Boolean).sort((a, b) => b.score - a.score)[0];
      if (!document || visited.has(document.url.href)) break;
      visited.add(document.url.href); inheritedYear = document.year || inheritedYear;
      const documentResponse = await fetchWithRetry(document.url, source);
      const documentIsPdf = ["application/pdf", "application/octet-stream"].includes(mime(documentResponse.contentType)) || new TextDecoder().decode(documentResponse.body?.slice(0, 5) || new Uint8Array()) === "%PDF-";
      const documentSource = { ...source, format: documentIsPdf ? "pdf" : "html" };
      response = validateContent(documentSource, documentResponse, !documentIsPdf);
      response.detected ||= inheritedYear;
      if (documentIsPdf) {
        reachedDocument = true;
        if (source.monitoringMode !== "automatic_publish" && ["OK", "REDIRECTED"].includes(response.result)) { response.result = "NEEDS_REVIEW"; response.error = "PDF je platné, změna čeká na ruční schválení"; }
        break;
      }
    }
    if (!reachedDocument && ["OK", "REDIRECTED"].includes(response.result) && source.parserKey === "linked-document-auto") {
      response.result = "NEEDS_REVIEW"; response.error = "cesta seznam → detail neskončila jednoznačným PDF dokumentem";
    } else if (!visited.size && ["OK", "REDIRECTED"].includes(response.result)) {
      response.result = "NEEDS_REVIEW"; response.error = "aktuální akademický dokument nebyl jednoznačně nalezen";
    } else if (!reachedDocument && response.detected && Number(response.detected.slice(0, 4)) < currentStartYear && ["OK", "REDIRECTED"].includes(response.result)) {
      response.result = "NEEDS_REVIEW"; response.error = `starý akademický rok ${response.detected}`;
    }
  }
  if (source.monitoringMode === "not_found_monitored" && ["OK", "REDIRECTED"].includes(response.result)) { response.result = "NEEDS_REVIEW"; response.error = "harmonogram nenalezen; monitoring pokračuje"; }
  return { source, ...response, ms: Date.now() - started };
}

const sharedFetches = new Map();
async function fetchWithRetry(start, source) {
  const share = ["muni-is-periods", "jamu-is-periods"].includes(source.parserKey);
  const key = `${source.officialDomain}|${start.href}`;
  const run = async () => {
    let result;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      result = await fetchFollowing(start, source);
      if (result.result !== "TEMPORARY") break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
    return result;
  };
  if (!share) return run();
  if (!sharedFetches.has(key)) sharedFetches.set(key, run());
  return sharedFetches.get(key);
}

const results = [];
for (let index = 0; index < contentSources.length; index += 3) results.push(...await Promise.all(contentSources.slice(index, index + 3).map(check)));
for (const item of results) console.log(`${item.result.padEnd(12)} ${String(item.status ?? "-").padStart(3)} ${String(item.ms).padStart(5)} ms  ${item.source.id}  ${item.url}  ${mime(item.contentType) || "-"}  ${item.detected || "rok nezjištěn"}${item.error ? `  · ${item.error}` : ""}`);
const requiredInvalid = results.filter((item) => item.source.monitoringMode === "automatic_publish" && !["OK", "REDIRECTED"].includes(item.result));
const counts = Object.groupBy(results, (item) => item.result);
console.log(`\nZkontrolováno ${results.length} zdrojů pro ${expectedAcademicYear}: ${Object.entries(counts).map(([key, values]) => `${key} ${values.length}`).join(", ")}.`);
if (requiredInvalid.length) { console.error(`Povinné automatické zdroje bez bezpečně ověřeného obsahu: ${requiredInvalid.map((item) => item.source.id).join(", ")}`); process.exitCode = 1; }
