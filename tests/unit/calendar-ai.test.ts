import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AI kontrola akademického kalendáře", () => {
  it("má explicitní bezpečné defaulty a nikdy nepublikuje změnu z AI", async () => {
    const source = await readFile("lib/academic-calendar-ai.ts", "utf8");
    expect(source).toContain('process.env.ACADEMIC_CALENDAR_AI_ENABLED === "true"');
    expect(source).toContain("if (!aiEnabled() || !aiKey())");
    expect(source).toContain("if (!sourceEvents.length || (existing.length >= 4");
    expect(source).toContain('onConflict: "fingerprint", ignoreDuplicates: true');
    expect(source).toContain('.eq("status", "approved")');
    expect(source).toContain('"needs_review"');
    expect(source).not.toContain('from("academic_events").update');
  });

  it("cron vyžaduje serverové tajemství a migrace plánuje denní běh", async () => {
    const route = await readFile("app/api/cron/ai-calendar-check/route.ts", "utf8");
    const migration = await readFile("supabase/migrations/202609180041_academic_calendar_ai_review_scheduler.sql", "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("SUPABASE_SCHEDULER_SECRET");
    expect(migration).toContain("41 3 * * *");
    expect(migration).toContain("studenthub-academic-calendar-ai-review-daily");
  });

  it("AI credentials zůstávají server-only", async () => {
    const source = await readFile("lib/academic-calendar-ai.ts", "utf8");
    expect(source).toContain('import "server-only"');
    expect(source).toContain("OPENAI_API_KEY");
    expect(source).not.toContain("NEXT_PUBLIC_OPENAI_API_KEY");
    const migration = await readFile("supabase/migrations/202609180040_academic_calendar_ai_review.sql", "utf8");
    expect(migration).toContain("unique (fingerprint)");
    expect(migration).toContain("academic_calendar_ai_finding_audit");
    expect(migration).not.toContain('create policy "calendar ai staff update findings"');
  });

  it("o nálezech smí rozhodovat pouze administrátor Brna nebo superadministrátor", async () => {
    const route = await readFile("app/api/admin/calendar-ai/findings/[id]/route.ts", "utf8");
    expect(route).toContain('["super_admin", "admin"].includes(user.role)');
    expect(route).toContain('user.cityId !== "brno"');
    expect(route).toContain('finding.city_id === "brno"');
  });
});
