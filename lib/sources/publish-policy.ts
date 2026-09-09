import { sha256 } from "@/lib/sources/normalize";
import type { ConnectorExtractionMethod, NormalizedEvent, SourceFormat, SourceMonitoringMode } from "@/lib/sources/types";
import { currentAcademicYear, type SourceIssue, type SourceIssueCode } from "@/lib/sources/validation";

export const SOURCE_PUBLISH_POLICY_VERSION = "academic-source-v2";
export const SOURCE_MINIMUM_CONFIDENCE = 0.9;

export type ManualReviewReason =
  | "source_not_enabled"
  | "unsupported_format"
  | "outside_allowed_domain"
  | "ocr_used"
  | "academic_year_unknown"
  | "stale_academic_year"
  | "invalid_event"
  | "low_confidence"
  | "parser_warning"
  | "incomplete_result"
  | "source_conflict"
  | "unproven_revision"
  | "suspicious_mass_change"
  | "manual_monitoring_only";

const technicalIssueCodes = new Set<SourceIssueCode>([
  "challenge", "robots_disallowed", "robots_unavailable", "login_page", "unexpected_mime", "invalid_document",
]);

const reasonLabels: Record<string, string> = {
  source_not_enabled: "Zdroj není v registru povolený.",
  unsupported_format: "Formát dokumentu není povolený pro automatické zveřejnění.",
  outside_allowed_domain: "Finální nebo událostní URL leží mimo povolenou doménu zdroje.",
  ocr_used: "Dokument byl přečten pomocí OCR a vyžaduje lidskou kontrolu.",
  academic_year_unknown: "Aktuální akademický rok nebylo možné jednoznačně doložit.",
  stale_academic_year: "Dokument neodpovídá aktuálnímu akademickému roku.",
  invalid_event: "Nejméně jeden termín má neplatné nebo neúplné povinné údaje.",
  low_confidence: "Jistota parseru je pod bezpečnou hranicí 90 %.",
  parser_warning: "Parser vrátil varování, které musí posoudit editor.",
  incomplete_result: "Výsledek je neúplný nebo změnil očekávanou strukturu.",
  source_conflict: "Termín je v konfliktu s jiným oficiálním zdrojem.",
  unproven_revision: "Nelze prokázat, že jde o novější oficiální revizi.",
  suspicious_mass_change: "Běh navrhuje podezřele mnoho přesunů nebo zrušení.",
  manual_monitoring_only: "Zdroj je pouze monitorovaný a nemá automaticky publikovat.",
  challenge: "Zdroj vrátil ochrannou stránku; nejde o obsah ke schválení.",
  robots_disallowed: "robots.txt zakazuje automatické načtení; nejde o obsah ke schválení.",
  robots_unavailable: "robots.txt nebylo možné bezpečně ověřit; nejde o obsah ke schválení.",
  login_page: "Zdroj vrátil přihlašovací stránku; nejde o obsah ke schválení.",
  unexpected_mime: "Zdroj vrátil neočekávaný MIME typ; nejde o obsah ke schválení.",
  invalid_document: "Stažený dokument není platný; nejde o obsah ke schválení.",
};

export function sourceReviewReasonLabel(reason: unknown) {
  return reasonLabels[String(reason || "")] || "Změna nesplnila všechna pravidla automatického zveřejnění.";
}

export function isTechnicalSourceIssueCode(code: unknown): code is SourceIssueCode {
  return technicalIssueCodes.has(String(code) as SourceIssueCode);
}

export function isActionableSourceReview(row: { status?: unknown; reason?: unknown }) {
  return row.status === "pending" && !isTechnicalSourceIssueCode(row.reason);
}

function normalizedMime(contentType: string) { return contentType.toLowerCase().split(";", 1)[0].trim(); }
function supportedDocument(format: SourceFormat, contentType: string, extractionMethod?: ConnectorExtractionMethod) {
  const mime = normalizedMime(contentType);
  if (format === "html") return ["text/html", "application/xhtml+xml"].includes(mime);
  if (format === "ics") return ["text/calendar", "text/plain"].includes(mime);
  if (format === "json" || format === "api") return mime === "application/json" || mime.endsWith("+json");
  if (format === "pdf") return ["application/pdf", "application/octet-stream"].includes(mime) && extractionMethod === "native_text";
  return false;
}

function allowedHost(urlValue: string, officialDomain: string, allowedDomains: string[]) {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return [officialDomain, ...allowedDomains].some((domainValue) => {
      const domain = domainValue.toLowerCase().replace(/^\./, "");
      return host === domain || host.endsWith(`.${domain}`);
    });
  } catch { return false; }
}

export type PublishPolicyInput = {
  sourceId: string; sourceEnabled: boolean; sourceRegistered: boolean; monitoringMode: SourceMonitoringMode;
  format: SourceFormat; officialDomain: string; allowedDomains: string[]; finalUrl: string; contentType: string;
  extractionMethod?: ConnectorExtractionMethod; sourceText?: string; universityId: string; facultyId: string;
  events: NormalizedEvent[]; warnings: string[]; issue?: SourceIssue | null; hasCrossSourceConflict?: boolean;
  suspiciousMassChange?: boolean; now?: Date;
};

function validEvent(event: NormalizedEvent, values: PublishPolicyInput, expectedAcademicYear: string) {
  const start = new Date(event.startAt).getTime();
  const end = event.endAt ? new Date(event.endAt).getTime() : start;
  return Boolean(event.externalId.trim() && event.title.trim() && Number.isFinite(start) && Number.isFinite(end) && end >= start
    && event.timezone === "Europe/Prague" && event.academicYear === expectedAcademicYear
    && event.universityId === values.universityId && event.facultyId === values.facultyId && event.sourceId === values.sourceId
    && allowedHost(event.sourceUrl, values.officialDomain, values.allowedDomains) && event.status === "approved");
}

export type PublishPolicyResult = {
  decision: "auto_publish" | "manual_review" | "technical_blocked"; publishable: NormalizedEvent[]; review: NormalizedEvent[];
  reasons: ManualReviewReason[]; reasonMessages: string[]; minimumConfidence: number; policyVersion: string;
};

export function evaluateSourcePublishPolicy(values: PublishPolicyInput): PublishPolicyResult {
  if (values.issue && isTechnicalSourceIssueCode(values.issue.code)) {
    return { decision: "technical_blocked", publishable: [], review: [], reasons: [], reasonMessages: [values.issue.message], minimumConfidence: 0, policyVersion: SOURCE_PUBLISH_POLICY_VERSION };
  }
  const expectedAcademicYear = currentAcademicYear(values.now);
  const minimumConfidence = values.events.length ? Math.min(...values.events.map((event) => event.confidence)) : 0;
  const reasons = new Set<ManualReviewReason>();
  if (!values.sourceRegistered || !values.sourceEnabled) reasons.add("source_not_enabled");
  if (values.monitoringMode === "not_found_monitored") reasons.add("manual_monitoring_only");
  if (!supportedDocument(values.format, values.contentType, values.extractionMethod)) reasons.add(values.extractionMethod === "ocr" ? "ocr_used" : "unsupported_format");
  if (!allowedHost(values.finalUrl, values.officialDomain, values.allowedDomains)) reasons.add("outside_allowed_domain");
  if (values.format === "pdf" && (!values.sourceText || values.sourceText.replace(/\s/g, "").length < 80)) reasons.add("invalid_event");
  if (!values.events.length) reasons.add("incomplete_result");
  if (values.events.some((event) => !event.academicYear)) reasons.add("academic_year_unknown");
  if (values.events.some((event) => event.academicYear !== expectedAcademicYear)) reasons.add("stale_academic_year");
  if (values.events.some((event) => !validEvent(event, values, expectedAcademicYear))) reasons.add("invalid_event");
  if (minimumConfidence < SOURCE_MINIMUM_CONFIDENCE) reasons.add("low_confidence");
  if (values.warnings.length) reasons.add(values.issue?.code === "incomplete_result" ? "incomplete_result" : "parser_warning");
  if (values.issue?.code === "stale_academic_year") reasons.add("stale_academic_year");
  if (values.issue?.code === "incomplete_result") reasons.add("incomplete_result");
  if (values.hasCrossSourceConflict) reasons.add("source_conflict");
  if (values.suspiciousMassChange) reasons.add("suspicious_mass_change");
  const reviewReasons = [...reasons];
  const autoPublish = reviewReasons.length === 0;
  return { decision: autoPublish ? "auto_publish" : "manual_review", publishable: autoPublish ? values.events : [], review: autoPublish ? [] : values.events,
    reasons: reviewReasons, reasonMessages: reviewReasons.map(sourceReviewReasonLabel), minimumConfidence, policyVersion: SOURCE_PUBLISH_POLICY_VERSION };
}

export async function semanticDocumentHash(events: NormalizedEvent[]) {
  const rows = [...events].map((event) => [event.externalId, event.sourceHash])
    .sort(([leftId, leftHash], [rightId, rightHash]) => leftId.localeCompare(rightId) || leftHash.localeCompare(rightHash));
  return sha256(JSON.stringify(rows));
}

export function isSuspiciousMassChange(values: { existingCount: number; archivedCount: number; movedCount: number }) {
  if (values.existingCount < 4) return false;
  const affected = values.archivedCount + values.movedCount;
  return affected >= 3 && affected / values.existingCount >= 0.35;
}

/** @deprecated Use evaluateSourcePublishPolicy for complete source decisions. */
export function partitionEventsForMonitoring(mode: SourceMonitoringMode, events: NormalizedEvent[]) {
  const publishable = mode !== "not_found_monitored" ? events.filter((event) => event.status === "approved" && event.confidence >= SOURCE_MINIMUM_CONFIDENCE) : [];
  const review = mode !== "not_found_monitored" ? events.filter((event) => !publishable.includes(event)) : events;
  return { publishable, review };
}

export function sourceRunMayArchive(_mode: SourceMonitoringMode, values: { publishableCount: number; reviewCount: number; warningCount: number; blocked: boolean; suspiciousMassChange?: boolean }) {
  return !values.blocked && !values.suspiciousMassChange && values.publishableCount > 0 && values.reviewCount === 0 && values.warningCount === 0;
}
