import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@/lib/sources/types";
import { evaluateSourcePublishPolicy, isActionableSourceReview, isSuspiciousMassChange, isTechnicalSourceIssueCode, semanticDocumentHash, SOURCE_PUBLISH_POLICY_VERSION, sourceReviewReasonLabel } from "@/lib/sources/publish-policy";

const event: NormalizedEvent = {
  externalId: "term-1", title: "Výuka", description: "Aktuální termín", startAt: "2026-09-13T22:00:00.000Z",
  endAt: "2026-12-11T22:59:00.000Z", allDay: true, timezone: "Europe/Prague", category: "Výuka",
  academicYear: "2026/2027", universityId: "vut", facultyId: "vut-fit", sourceId: "src-vut-fit",
  sourceUrl: "https://www.fit.vut.cz/study/calendar/2026/.cs", sourceHash: "a".repeat(64), confidence: 0.97,
  status: "approved", lastVerifiedAt: "2026-09-09T08:00:00.000Z",
};

const input = {
  sourceId: "src-vut-fit", sourceEnabled: true, sourceRegistered: true, monitoringMode: "automatic_review" as const,
  format: "pdf" as const, officialDomain: "fit.vut.cz", allowedDomains: ["vut.cz"],
  finalUrl: "https://www.fit.vut.cz/study/calendar/2026/calendar.pdf", contentType: "application/pdf",
  extractionMethod: "native_text" as const, sourceText: "Strojově čitelný harmonogram ".repeat(5),
  universityId: "vut", facultyId: "vut-fit", events: [event], warnings: [], now: new Date("2026-09-09T08:00:00.000Z"),
};

describe("deterministická politika akademických zdrojů", () => {
  it("automaticky publikuje čisté textové PDF i v režimu automatic_review", () => {
    expect(evaluateSourcePublishPolicy(input)).toMatchObject({ decision: "auto_publish", publishable: [event], review: [], policyVersion: SOURCE_PUBLISH_POLICY_VERSION });
  });
  it("OCR vždy pošle do ruční kontroly", () => {
    expect(evaluateSourcePublishPolicy({ ...input, extractionMethod: "ocr" })).toMatchObject({ decision: "manual_review", reasons: expect.arrayContaining(["ocr_used"]) });
  });
  it("odmítne starý rok, nízkou jistotu, neplatný rozsah i cizí doménu", () => {
    const result = evaluateSourcePublishPolicy({ ...input, finalUrl: "https://evil.example/calendar.pdf", events: [{ ...event, academicYear: "2025/2026", confidence: 0.7, endAt: "2026-01-01T00:00:00.000Z" }] });
    expect(result.reasons).toEqual(expect.arrayContaining(["outside_allowed_domain", "stale_academic_year", "low_confidence", "invalid_event"]));
    expect(result.publishable).toHaveLength(0);
  });
  it("konflikt a podezřelou hromadnou změnu nikdy nerozhodne sám", () => {
    expect(evaluateSourcePublishPolicy({ ...input, hasCrossSourceConflict: true }).reasons).toContain("source_conflict");
    expect(evaluateSourcePublishPolicy({ ...input, suspiciousMassChange: true }).reasons).toContain("suspicious_mass_change");
    expect(isSuspiciousMassChange({ existingCount: 10, archivedCount: 2, movedCount: 2 })).toBe(true);
    expect(isSuspiciousMassChange({ existingCount: 10, archivedCount: 1, movedCount: 1 })).toBe(false);
  });
  it("technický stav nevytvoří úkol pro editora", () => {
    const result = evaluateSourcePublishPolicy({ ...input, issue: { code: "challenge", status: "blocked", message: "Turnstile" } });
    expect(result).toMatchObject({ decision: "technical_blocked", review: [] });
    expect(isTechnicalSourceIssueCode("robots_unavailable")).toBe(true);
    expect(isActionableSourceReview({ status: "pending", reason: "challenge" })).toBe(false);
    expect(isActionableSourceReview({ status: "pending", reason: "low_confidence" })).toBe(true);
  });
  it("sémantický hash nezávisí na pořadí událostí", async () => {
    const second = { ...event, externalId: "term-2", sourceHash: "b".repeat(64) };
    expect(await semanticDocumentHash([event, second])).toBe(await semanticDocumentHash([second, event]));
  });
  it("vrací srozumitelné české důvody", () => expect(sourceReviewReasonLabel("ocr_used")).toContain("OCR"));
});
