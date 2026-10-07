import { describe, expect, it } from "vitest";
import { resolutionForReviewReason } from "../../scripts/source-review-resolution.mjs";

describe("bezpečné uzavření fronty zdrojů", () => {
  it("nikdy neschválí zastaralý nebo neprokázaný návrh", () => {
    expect(resolutionForReviewReason("stale_academic_year")).toMatchObject({ status: "rejected" });
    expect(resolutionForReviewReason("suspicious_mass_change")).toMatchObject({ status: "rejected" });
    expect(resolutionForReviewReason("unproven_revision")).toMatchObject({ status: "rejected" });
  });
  it("neúplný a ruční zdroj uzavře jako vysvětlený BLOCKED", () => {
    expect(resolutionForReviewReason("incomplete_result")).toMatchObject({ status: "technical_closed", code: "blocked_incomplete_result" });
    expect(resolutionForReviewReason("manual_monitoring_only")?.note).toContain("BLOCKED");
  });
  it("neznámý důvod odmítne bez zápisu", () => {
    expect(resolutionForReviewReason("unknown")).toBeNull();
  });
});
