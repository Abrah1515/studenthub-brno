import "server-only";
import type { ContentSource } from "@/lib/sources/types";
import { discoverAcademicDocument } from "@/lib/sources/discovery";
import { fetchRegisteredSource } from "@/lib/sources/fetch-source";
import { fitCalendarSourceForYear, fsiCalendarSourceForYear, inspectSourcePayload, SourceBlockedError } from "@/lib/sources/validation";

type Conditional = { etag?: string | null; lastModified?: string | null };

async function retry<T>(task: () => Promise<T>, attempts = 3) {
  let error: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await task(); }
    catch (caught) { error = caught; if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt)); }
  }
  throw error;
}

function assertPayload(source: ContentSource, fetched: Awaited<ReturnType<typeof fetchRegisteredSource>>) {
  if (fetched.status === 304) return;
  const issue = inspectSourcePayload(source, fetched);
  if (issue) throw new SourceBlockedError(issue, { finalUrl: fetched.finalUrl, contentType: fetched.contentType });
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
  if (!["linked-document-review", "not-found-monitor"].includes(source.parserKey)) {
    const fetched = await retry(() => fetchRegisteredSource(source, conditional));
    assertPayload(source, fetched);
    return { fetched, effectiveSource: { ...source, sourceUrl: fetched.finalUrl }, discovered: null };
  }
  const landing = await retry(() => fetchRegisteredSource(source));
  const landingMime = landing.contentType.toLowerCase().split(";", 1)[0].trim();
  if (source.parserKey === "linked-document-review" && ["application/pdf", "application/octet-stream"].includes(landingMime)) {
    const documentSource: ContentSource = { ...source, sourceUrl: landing.finalUrl, format: "pdf", parserKey: "pdf-review", requiresReview: true };
    assertPayload(documentSource, landing);
    return { fetched: landing, effectiveSource: documentSource, discovered: { url: landing.finalUrl, title: "Oficiální PDF harmonogram", academicYear: source.academicYear } };
  }
  assertPayload(source, landing);
  const html = landing.contentType.toLowerCase().includes("html") ? new TextDecoder().decode(landing.body) : "";
  const discovered = html ? discoverAcademicDocument(html, landing.finalUrl, source, now) : null;
  if (!discovered) return { fetched: landing, effectiveSource: { ...source, sourceUrl: landing.finalUrl }, discovered: null };
  const isPdf = /\.pdf(?:$|[?#])/i.test(discovered.url);
  const documentSource: ContentSource = { ...source, sourceUrl: discovered.url, academicYear: discovered.academicYear || source.academicYear, sourceDocumentTitle: discovered.title, format: isPdf ? "pdf" : "html", parserKey: isPdf ? "pdf-review" : "generic-academic-html" };
  const fetched = await retry(() => fetchRegisteredSource(documentSource, conditional));
  assertPayload(documentSource, fetched);
  return { fetched, effectiveSource: { ...documentSource, sourceUrl: fetched.finalUrl }, discovered };
}
