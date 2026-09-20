import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("denní porovnání akademického kalendáře", () => {
  it("nepotřebuje AI klíč, nepíše do veřejného kalendáře a izoluje staré nálezy", async () => {
    const source = await readFile("lib/academic-calendar-ai.ts", "utf8");
    const route = await readFile("app/api/admin/calendar-ai/route.ts", "utf8");
    expect(source).toContain('CALENDAR_REVIEW_VERSION = "source-comparison-v2"');
    expect(source).toContain('onConflict: "fingerprint", ignoreDuplicates: true');
    expect(source).toContain("inspectConnectorResult(effectiveSource, result)");
    expect(source).toContain("findCalendarEventMatch(rows, usedIds");
    expect(source).toContain('current?.status === "pending"');
    expect(source).toContain("if (!current) {");
    expect(source).not.toContain('findingFingerprint(id, "missing"');
    expect(source).toContain('status: "resolved"');
    expect(source).toContain('sourceIssue(row, "mass-difference"');
    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).not.toContain('from("academic_events").update');
    expect(route).toContain('.eq("ai_reason", CALENDAR_REVIEW_VERSION)');
  });

  it("cron zůstává chráněný a plánuje kontrolu jednou denně", async () => {
    const route = await readFile("app/api/cron/ai-calendar-check/route.ts", "utf8");
    const migration = await readFile("supabase/migrations/202609180041_academic_calendar_ai_review_scheduler.sql", "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("SUPABASE_SCHEDULER_SECRET");
    expect(migration).toContain("41 3 * * *");
  });

  it("nálezy jsou neveřejné a ručně rozhoduje pouze administrátor Brna", async () => {
    const migration = await readFile("supabase/migrations/202609180040_academic_calendar_ai_review.sql", "utf8");
    const route = await readFile("app/api/admin/calendar-ai/findings/[id]/route.ts", "utf8");
    expect(migration).toContain("unique (fingerprint)");
    expect(migration).toContain("academic_calendar_ai_finding_audit");
    expect(migration).not.toContain('create policy "calendar ai staff update findings"');
    expect(route).toContain('["super_admin", "admin"].includes(user.role)');
    expect(route).toContain('user.cityId !== "brno"');
  });

  it("blokovaný nebo selhaný ruční běh nehlásí jako úspěch", async () => {
    const route = await readFile("app/api/admin/calendar-ai/route.ts", "utf8");
    const panel = await readFile("components/calendar-ai-admin-panel.tsx", "utf8");
    expect(route).toContain('result.status === "failed" ? 500 : 503');
    expect(panel).toContain('if (!response.ok) setError');
    expect(panel).toContain("stats.openFindings ?? 0");
  });
});
