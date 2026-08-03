import "server-only";
import { contentSources } from "@/lib/sources/registry";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { fetchSourcePayload } from "@/lib/sources/payload";
import { runConnector } from "@/lib/sources/connectors";
import { academicYearStart, currentAcademicStartYear, currentAcademicYear, inspectConnectorResult, SourceBlockedError } from "@/lib/sources/validation";

export type LinkStatus = "ok" | "redirected" | "blocked" | "needs_review" | "temporary_failure" | "broken";

export async function checkSourceLink(source: (typeof contentSources)[number]) {
  const started = Date.now();
  try {
    const { fetched, effectiveSource, discovered } = await fetchSourcePayload(source);
    let issue = null as ReturnType<typeof inspectConnectorResult>;
    let detectedAcademicYear = discovered?.academicYear || effectiveSource.academicYear || null;
    if (source.monitoringMode === "automatic_publish") {
      const parsed = await runConnector({ source: effectiveSource, body: fetched.body, contentType: fetched.contentType, checkedAt: new Date().toISOString() });
      issue = inspectConnectorResult(effectiveSource, parsed);
      detectedAcademicYear = parsed.events.map((event) => event.academicYear).sort().at(-1) || detectedAcademicYear;
    } else if (!discovered && source.parserKey === "linked-document-review") {
      issue = { code: "incomplete_result", status: "needs_review", message: "Na oficiálním rozcestníku nebyl nalezen jednoznačný aktuální akademický dokument." };
    } else if (source.monitoringMode === "not_found_monitored") {
      issue = { code: "incomplete_result", status: "needs_review", message: "Zdroj je dostupný, ale veřejný harmonogram zatím nebyl nalezen." };
    }
    if (!issue && detectedAcademicYear && (academicYearStart(detectedAcademicYear) ?? currentAcademicStartYear()) < currentAcademicStartYear()) {
      issue = { code: "stale_academic_year", status: "needs_review", message: `Zdroj obsahuje starý akademický rok ${detectedAcademicYear}; automatické změny jsou zablokované.` };
    }
    const redirected = fetched.finalUrl !== source.sourceUrl || Boolean(discovered);
    return {
      source, httpStatus: fetched.status, finalUrl: fetched.finalUrl, redirected, responseMs: Date.now() - started,
      status: issue?.status || (redirected ? "redirected" as const : "ok" as const), error: issue?.message || null,
      contentType: fetched.contentType, expectedContentType: effectiveSource.format, detectedAcademicYear,
      expectedAcademicYear: currentAcademicYear(), validationMessage: issue?.message || null,
    };
  } catch (error) {
    if (error instanceof SourceBlockedError) return {
      source, httpStatus: 200, finalUrl: error.metadata.finalUrl || source.sourceUrl, redirected: (error.metadata.finalUrl || source.sourceUrl) !== source.sourceUrl,
      responseMs: Date.now() - started, status: error.issue.status, error: error.message, contentType: error.metadata.contentType || null,
      expectedContentType: source.format, detectedAcademicYear: null, expectedAcademicYear: currentAcademicYear(), validationMessage: error.message,
    };
    const message = error instanceof Error ? error.message : "Neznámá chyba";
    const blocked = /mimo registrovanou|lokální|privátní|HTTPS adresu/i.test(message);
    const broken = /HTTP (404|410)/i.test(message);
    return {
      source, httpStatus: broken ? Number(message.match(/HTTP (\d+)/)?.[1]) : null, finalUrl: source.sourceUrl, redirected: false,
      responseMs: Date.now() - started, status: blocked ? "blocked" as const : broken ? "broken" as const : "temporary_failure" as const,
      error: message, contentType: null, expectedContentType: source.format, detectedAcademicYear: null,
      expectedAcademicYear: currentAcademicYear(), validationMessage: message,
    };
  }
}

export async function checkRegisteredLinks() {
  const results: Awaited<ReturnType<typeof checkSourceLink>>[] = [];
  for (let index = 0; index < contentSources.length; index += 3) results.push(...await Promise.all(contentSources.slice(index, index + 3).map(checkSourceLink)));
  if (isSupabaseConfigured()) {
    const client = createServiceClient();
    for (const result of results) {
      const { data: previous } = await client.from("link_checks").select("failure_count").eq("source_id", result.source.id).order("checked_at", { ascending: false }).limit(1).maybeSingle();
      const previousFailures = Number(previous?.failure_count || 0);
      const failureCount = result.status === "broken" ? previousFailures + 1 : ["ok", "redirected"].includes(result.status) ? 0 : previousFailures;
      const persistedStatus = failureCount >= 3 && result.status === "broken" ? "broken" : result.status;
      await client.from("link_checks").insert({ url: result.source.sourceUrl, source_id: result.source.id, entity_type: "source", entity_id: result.source.id, http_status: result.httpStatus, response_ms: result.responseMs, failure_count: failureCount, status: persistedStatus, error_message: result.error, final_url: result.finalUrl, content_type: result.contentType, expected_content_type: result.expectedContentType, detected_academic_year: result.detectedAcademicYear, expected_academic_year: result.expectedAcademicYear, validation_message: result.validationMessage });
      if (failureCount >= 3 && result.status === "broken") await client.from("content_sources").update({ sync_status: "stale", consecutive_failures: failureCount }).eq("id", result.source.id);
    }
  }
  return results;
}
