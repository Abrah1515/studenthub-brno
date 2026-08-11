import "server-only";
import type { ContentSource } from "@/lib/sources/types";
import type { DiscoveredDocument } from "@/lib/sources/discovery";
import { discoverAcademicDocuments, discoverPaginationUrls } from "@/lib/sources/discovery";
import { fetchRegisteredSource } from "@/lib/sources/fetch-source";
import { fitCalendarSourceForYear, fsiCalendarSourceForYear, inspectSourcePayload, SourceBlockedError } from "@/lib/sources/validation";

type Conditional = { etag?: string | null; lastModified?: string | null };
type FetchedSource = Awaited<ReturnType<typeof fetchRegisteredSource>>;

async function retry<T>(task: () => Promise<T>, attempts = 3) {
  let error: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await task(); }
    catch (caught) {
      error = caught;
      if (caught instanceof SourceBlockedError) throw caught;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw error;
}

function assertPayload(source: ContentSource, fetched: FetchedSource) {
  if (fetched.status === 304) return;
  const issue = inspectSourcePayload(source, fetched);
  if (issue) throw new SourceBlockedError(issue, { finalUrl: fetched.finalUrl, contentType: fetched.contentType });
}

function normalizedMime(fetched: FetchedSource) {
  return fetched.contentType.toLowerCase().split(";", 1)[0].trim();
}

function isPdfPayload(fetched: FetchedSource) {
  if (["application/pdf", "application/octet-stream"].includes(normalizedMime(fetched))) return true;
  return new TextDecoder().decode(fetched.body.slice(0, 5)) === "%PDF-";
}

function isHtmlPayload(fetched: FetchedSource) {
  return ["text/html", "application/xhtml+xml"].includes(normalizedMime(fetched));
}

function sourceAt(source: ContentSource, sourceUrl: string, values: Partial<ContentSource> = {}): ContentSource {
  return { ...source, ...values, sourceUrl };
}

function documentSource(source: ContentSource, fetched: FetchedSource, discovered: DiscoveredDocument): ContentSource {
  const pdf = fetched.status === 304 ? discovered.isPdfHint : isPdfPayload(fetched);
  return sourceAt(source, fetched.finalUrl || discovered.url, {
    academicYear: discovered.academicYear || source.academicYear,
    sourceDocumentTitle: discovered.title,
    format: pdf ? "pdf" : "html",
    parserKey: pdf ? (source.monitoringMode === "automatic_publish" ? "pdf-auto" : "pdf-review") : "generic-academic-html",
    requiresReview: source.monitoringMode !== "automatic_publish",
  });
}

function decodedHtml(fetched: FetchedSource) {
  return isHtmlPayload(fetched) ? new TextDecoder().decode(fetched.body) : "";
}

function rankedUnique(candidates: DiscoveredDocument[]) {
  const unique = new Map<string, DiscoveredDocument>();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.url);
    if (!previous || candidate.score > previous.score) unique.set(candidate.url, candidate);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || (b.academicYear || "").localeCompare(a.academicYear || ""));
}

async function fetchLinkedDocument(source: ContentSource, conditional: Conditional, now: Date) {
  const landing = await retry(() => fetchRegisteredSource(source));
  if (isPdfPayload(landing)) {
    const discovered: DiscoveredDocument = {
      url: landing.finalUrl,
      title: source.sourceDocumentTitle || "Oficiální PDF harmonogram",
      academicYear: source.academicYear,
      score: 100,
      isPdfHint: true,
    };
    const effectiveSource = documentSource(source, landing, discovered);
    assertPayload(effectiveSource, landing);
    return { fetched: landing, effectiveSource, discovered };
  }

  assertPayload(sourceAt(source, landing.finalUrl, { format: "html" }), landing);
  const landingHtml = decodedHtml(landing);
  const pages: FetchedSource[] = [landing];
  const pageUrls = discoverPaginationUrls(landingHtml, landing.finalUrl, source, source.discoveryPageLimit || 1);
  for (const pageUrl of pageUrls) {
    const pageSource = sourceAt(source, pageUrl, { format: "html" });
    const page = await retry(() => fetchRegisteredSource(pageSource), 2);
    assertPayload(pageSource, page);
    pages.push(page);
  }

  const candidates = rankedUnique(pages.flatMap((page) => discoverAcademicDocuments(decodedHtml(page), page.finalUrl, source, now)));
  if (!candidates.length) return { fetched: landing, effectiveSource: sourceAt(source, landing.finalUrl), discovered: null };

  let candidate = candidates[0];
  const visited = new Set<string>();
  const maxDepth = Math.max(1, Math.min(source.discoveryDepth || 2, 3));
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (visited.has(candidate.url)) break;
    visited.add(candidate.url);
    const candidateSource = sourceAt(source, candidate.url, { academicYear: candidate.academicYear || source.academicYear });
    const fetched = await retry(() => fetchRegisteredSource(candidateSource, candidate.isPdfHint ? conditional : {}));
    const effectiveSource = documentSource(source, fetched, candidate);

    if (fetched.status === 304 || effectiveSource.format === "pdf") {
      assertPayload(effectiveSource, fetched);
      return { fetched, effectiveSource, discovered: { ...candidate, url: fetched.finalUrl || candidate.url } };
    }

    assertPayload(effectiveSource, fetched);
    const html = decodedHtml(fetched);
    const nested = rankedUnique(discoverAcademicDocuments(html, fetched.finalUrl, effectiveSource, now))
      .filter((item) => !visited.has(item.url));
    if (!nested.length || depth + 1 >= maxDepth) {
      return { fetched, effectiveSource, discovered: { ...candidate, url: fetched.finalUrl || candidate.url } };
    }
    const next = nested[0];
    candidate = { ...next, academicYear: next.academicYear || candidate.academicYear };
  }

  throw new SourceBlockedError({ code: "invalid_document", status: "needs_review", message: "Oficiální dokument vytvořil cyklus odkazů a nebylo možné bezpečně vybrat konečný harmonogram." });
}

export async function fetchSourcePayload(source: ContentSource, conditional: Conditional = {}, now = new Date()) {
  if (["vut-fit-html", "vut-fsi-html"].includes(source.parserKey)) {
    const effectiveSource = source.parserKey === "vut-fit-html" ? fitCalendarSourceForYear(source, now) : fsiCalendarSourceForYear(source, now);
    try {
      const fetched = await retry(() => fetchRegisteredSource(effectiveSource, conditional));
      assertPayload(effectiveSource, fetched);
      return { fetched, effectiveSource: { ...effectiveSource, sourceUrl: fetched.finalUrl }, discovered: null };
    } catch (error) {
      if (error instanceof SourceBlockedError) throw error;
      const faculty = source.parserKey === "vut-fit-html" ? "FIT" : "FSI";
      throw new SourceBlockedError({ code: "stale_academic_year", status: "needs_review", message: `Aktuální stránku ${faculty} ${effectiveSource.academicYear} se nepodařilo bezpečně načíst; starší výchozí rok nebude použit.` }, { finalUrl: effectiveSource.sourceUrl });
    }
  }

  if (["linked-document-review", "linked-document-auto", "not-found-monitor"].includes(source.parserKey)) {
    return fetchLinkedDocument(source, conditional, now);
  }

  const fetched = await retry(() => fetchRegisteredSource(source, conditional));
  assertPayload(source, fetched);
  return { fetched, effectiveSource: { ...source, sourceUrl: fetched.finalUrl }, discovered: null };
}
