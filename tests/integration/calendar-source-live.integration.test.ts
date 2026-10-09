import { describe, expect, it, vi } from "vitest";
import { fetchSourcePayload } from "@/lib/sources/payload";
import { runConnector } from "@/lib/sources/connectors";
import { contentSources } from "@/lib/sources/registry";

vi.mock("server-only", () => ({}));

const live = process.env.RUN_LIVE_CALENDAR_SOURCE_TEST === "1" ? describe : describe.skip;

live("aktuální oficiální harmonogramy", () => {
  for (const sourceId of [
    "src-ostrava-vsbtuo", "src-vsbtuo-fmt", "src-vsbtuo-fs", "src-vsbtuo-ekf",
    "src-vsbtuo-fei", "src-vsbtuo-fast", "src-vsbtuo-fbi",
    "src-upol-cmtf", "src-upol-lf", "src-upol-ff", "src-upol-prf",
    "src-upol-pdf", "src-upol-ftk", "src-upol-pf", "src-upol-fzv",
  ]) {
    it(`${sourceId} vrací termíny 2026/2027`, async () => {
      const source = contentSources.find((item) => item.id === sourceId);
      expect(source).toBeTruthy();
      const payload = await fetchSourcePayload(source!, {}, new Date("2026-10-09T10:00:00Z"));
      const result = await runConnector({
        source: payload.effectiveSource,
        body: payload.fetched.body,
        contentType: payload.fetched.contentType,
        checkedAt: "2026-10-09T10:00:00Z",
      });
      expect(result.events.filter((event) => event.academicYear === "2026/2027").length).toBeGreaterThan(0);
    }, 30_000);
  }
});
