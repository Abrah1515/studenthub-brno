import { describe, expect, it, vi } from "vitest";
import { runConnector } from "@/lib/sources/connectors";
import { fetchSourcePayload } from "@/lib/sources/payload";
import { contentSources } from "@/lib/sources/registry";

vi.mock("server-only", () => ({}));

const live = process.env.RUN_LIVE_SOURCE_TESTS === "true";

describe.skipIf(!live)("živý veřejný plán zkoušek FEKT", () => {
  it("objeví neprůhlednou PDF URL a načte konkrétní termíny", async () => {
    const source = contentSources.find((item) => item.id === "src-vut-fekt-exams")!;
    const payload = await fetchSourcePayload(source, {}, new Date("2026-09-25T10:00:00.000Z"), { deepDiscovery: true });
    expect(payload.discovered).toMatchObject({ academicYear: "2026/2027", kind: "subject_exams" });
    expect(payload.fetched.contentType).toContain("application/pdf");
    expect(payload.effectiveSource.format).toBe("pdf");
    const result = await runConnector({ source: payload.effectiveSource, body: payload.fetched.body, contentType: payload.fetched.contentType, checkedAt: "2026-09-25T10:00:00.000Z" });
    expect(result.events).toHaveLength(25);
    expect(result.events.filter((event) => event.title.startsWith("BPC-EL1"))).toHaveLength(3);
    expect(result.events.some((event) => event.title.includes("BPC-MA1(B)") && event.startAt.startsWith("2026-12"))).toBe(true);
    expect(result.events.every((event) => event.facultyId === "vut-fekt" && event.academicYear === "2026/2027")).toBe(true);
  }, 30_000);
});
