import type { ContentSource } from "@/lib/sources/types";
import { htmlText } from "@/lib/sources/connectors/academic-tables";

export type DiscoveredDocument = { url: string; title: string; academicYear: string | null; score: number };

function allowedHost(host: string, source: ContentSource) {
  return [source.officialDomain, ...(source.allowedDomains || [])].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function academicYearFromText(value: string) {
  const full = value.match(/(20\d{2})\s*[\/_-]\s*(20\d{2})/);
  if (full && Number(full[2]) === Number(full[1]) + 1) return `${full[1]}/${full[2]}`;
  const short = value.match(/(20\d{2})\s*[\/_-]\s*(\d{2})(?!\d)/);
  if (short) { const end = Number(short[1].slice(0, 2) + short[2]); if (end === Number(short[1]) + 1) return `${short[1]}/${end}`; }
  return null;
}

export function discoverAcademicDocument(html: string, baseUrl: string, source: ContentSource, now = new Date()): DiscoveredDocument | null {
  const currentStartYear = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const candidates: DiscoveredDocument[] = [];
  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const title = htmlText(match[4]); const raw = `${title} ${match[2]}`; const folded = raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (!/(harmonogram|casov.{0,3}plan|rozpis.{0,8}vyuk|akademick.{0,8}rok)/i.test(folded)) continue;
    if (/(prijimac|prijeti|stipendi|vyberov)/i.test(folded)) continue;
    let url: URL; try { url = new URL(match[2], baseUrl); } catch { continue; }
    if (url.protocol !== "https:" || !allowedHost(url.hostname.toLowerCase(), source)) continue;
    const academicYear = academicYearFromText(raw); const startYear = academicYear ? Number(academicYear.slice(0, 4)) : null;
    let score = /\.pdf(?:$|[?#])/i.test(url.href) ? 30 : 10;
    if (/harmonogram|casov.{0,3}plan|rozpis.{0,8}vyuk/i.test(folded)) score += 30;
    if (startYear === currentStartYear) score += 60; else if (startYear === currentStartYear + 1) score += 50; else if (startYear) score -= Math.min(40, Math.abs(startYear - currentStartYear) * 8);
    candidates.push({ url: url.href, title: title || "Oficiální harmonogram akademického roku", academicYear, score });
  }
  return candidates.sort((a, b) => b.score - a.score || (b.academicYear || "").localeCompare(a.academicYear || ""))[0] || null;
}
