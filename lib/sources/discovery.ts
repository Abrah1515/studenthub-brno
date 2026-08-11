import type { ContentSource } from "@/lib/sources/types";
import { htmlText } from "@/lib/sources/connectors/academic-tables";

export type DiscoveredDocument = {
  url: string;
  title: string;
  academicYear: string | null;
  score: number;
  isPdfHint: boolean;
};

type HtmlAnchor = { url: URL; title: string; rawAttributes: string };

function allowedHost(host: string, source: ContentSource) {
  return [source.officialDomain, ...(source.allowedDomains || [])].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function academicYearFromText(value: string) {
  const full = value.match(/(20\d{2})\s*[\/_-]\s*(20\d{2})/);
  if (full && Number(full[2]) === Number(full[1]) + 1) return `${full[1]}/${full[2]}`;
  const short = value.match(/(20\d{2})\s*[\/_-]\s*(\d{2})(?!\d)/);
  if (short) {
    const end = Number(short[1].slice(0, 2) + short[2]);
    if (end === Number(short[1]) + 1) return `${short[1]}/${end}`;
  }
  return null;
}

function anchorsFromHtml(html: string, baseUrl: string, source: ContentSource) {
  const anchors: HtmlAnchor[] = [];
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try { url = new URL(match[2], baseUrl); } catch { continue; }
    if (url.protocol !== "https:" || !allowedHost(url.hostname.toLowerCase(), source)) continue;
    anchors.push({ url, title: htmlText(match[4]), rawAttributes: `${match[1]} ${match[3]}` });
  }
  return anchors;
}

function comparableUrl(value: URL) {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

export function discoverAcademicDocuments(html: string, baseUrl: string, source: ContentSource, now = new Date()): DiscoveredDocument[] {
  const currentStartYear = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const base = new URL(baseUrl);
  const candidates: DiscoveredDocument[] = [];
  const heading = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => htmlText(match[1])).join(" ");
  const pageFolded = `${base.href} ${heading}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const calendarDetailPage = /(harmonogram|casov.{0,3}plan|rozpis.{0,8}vyuk).{0,40}akademick.{0,8}rok|akademick.{0,8}rok.{0,40}(harmonogram|casov.{0,3}plan|rozpis.{0,8}vyuk)/i.test(pageFolded);

  for (const anchor of anchorsFromHtml(html, baseUrl, source)) {
    if (comparableUrl(anchor.url) === comparableUrl(base)) continue;
    const raw = `${anchor.title} ${anchor.url.href}`;
    const folded = raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const isPdfHint = /\.pdf(?:$|[?#])/i.test(anchor.url.href)
      || /^pdf/i.test(anchor.title.trim())
      || /type=["']application\/pdf/i.test(anchor.rawAttributes);
    const isStrongCalendar = /(harmonogram|casov.{0,3}plan).{0,30}akademick.{0,8}rok|akademick.{0,8}rok.{0,30}(harmonogram|casov.{0,3}plan)|rozpis.{0,8}vyuk/i.test(folded);
    const contextualAttachment = calendarDetailPage && isPdfHint && /(priloha|harmonogram|plan|rozpis)/i.test(folded);
    const isCalendar = isStrongCalendar || /(harmonogram|casov.{0,3}plan|akademick.{0,8}rok)/i.test(folded) || contextualAttachment;
    if (!isCalendar) continue;
    if (/(prijimac|prijeti|stipendi|vyberov|grantov|soutez|zapis.{0,12}1\.?\s*roc)/i.test(folded)) continue;

    const academicYear = academicYearFromText(raw);
    const startYear = academicYear ? Number(academicYear.slice(0, 4)) : null;
    let score = isPdfHint ? 40 : 12;
    if (isStrongCalendar) score += 55;
    if (contextualAttachment) score += 35;
    if (isPdfHint && /priloha/i.test(folded)) score += 65;
    if (startYear === currentStartYear) score += 100;
    else if (startYear === currentStartYear + 1) score += 35;
    else if (startYear) score -= Math.min(80, Math.abs(startYear - currentStartYear) * 20);
    candidates.push({
      url: anchor.url.href,
      title: anchor.title || "Oficialni harmonogram akademickeho roku",
      academicYear,
      score,
      isPdfHint,
    });
  }

  return candidates.sort((a, b) => b.score - a.score || (b.academicYear || "").localeCompare(a.academicYear || ""));
}

export function discoverAcademicDocument(html: string, baseUrl: string, source: ContentSource, now = new Date()): DiscoveredDocument | null {
  return discoverAcademicDocuments(html, baseUrl, source, now)[0] || null;
}

export function discoverPaginationUrls(html: string, baseUrl: string, source: ContentSource, pageLimit: number) {
  if (pageLimit <= 1) return [];
  const base = new URL(baseUrl);
  const pages = anchorsFromHtml(html, baseUrl, source).flatMap((anchor) => {
    const foldedTitle = anchor.title.trim().toLowerCase();
    const relNext = /rel\s*=\s*["'][^"']*next/i.test(anchor.rawAttributes);
    const pageValue = [...anchor.url.searchParams.entries()].find(([key, value]) => /^(?:str|page|p)$/i.test(key) && /^\d+$/.test(value));
    const numericLabel = /^\d{1,3}$/.test(foldedTitle);
    if (!relNext && !pageValue && !numericLabel) return [];
    if (anchor.url.hostname !== base.hostname || anchor.url.pathname.replace(/\/$/, "") !== base.pathname.replace(/\/$/, "")) return [];
    if (comparableUrl(anchor.url) === comparableUrl(base)) return [];
    return [{ url: anchor.url.href, order: pageValue ? Number(pageValue[1]) : relNext ? 1 : Number(foldedTitle) }];
  });
  return [...new Map(pages.sort((a, b) => a.order - b.order).map((page) => [page.url, page])).values()]
    .slice(0, pageLimit - 1)
    .map((page) => page.url);
}
