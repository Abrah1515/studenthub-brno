import { describe, expect, it } from "vitest";

const importManifest = () => import("../../scripts/import-brno-community-events.mjs");

describe("idempotentní import brněnských komunitních akcí", () => {
  it("obsahuje pouze budoucí ověřované akce s unikátními externími ID", async () => {
    const { events } = await importManifest();
    const ids = events.map((event: { externalId: string }) => event.externalId);
    expect(events.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ids).size).toBe(ids.length);
    expect(events.every((event: { sourceUrl: string; eventUrl: string }) => event.sourceUrl.startsWith("https://") && event.eventUrl.startsWith("https://"))).toBe(true);
    expect(events.every((event: { startsAt: string }) => new Date(event.startsAt) >= new Date("2026-09-25T00:00:00+02:00"))).toBe(true);
  });

  it("generuje stabilní fingerprinty a zachovává publikovaný externí původ", async () => {
    const { events, row } = await importManifest();
    const rows = events.map(row);
    expect(new Set(rows.map((item: { id: string }) => item.id)).size).toBe(rows.length);
    expect(new Set(rows.map((item: { duplicate_fingerprint: string }) => item.duplicate_fingerprint)).size).toBe(rows.length);
    expect(rows.every((item: { source_type: string; status: string; source_sync_status: string; last_verified_at: string }) => item.source_type === "external" && item.status === "published" && item.source_sync_status === "verified" && item.last_verified_at)).toBe(true);
    expect(rows.every((item: Record<string, unknown>) => !("author_email" in item) && !("management_token_hash" in item))).toBe(true);
  });

  it("rozliší vložení, změnu a bezezměnný opakovaný import", async () => {
    const { importChangeKind, preservedPublicationStatus } = await importManifest();
    expect(importChangeKind(undefined, "novy-hash")).toBe("inserted");
    expect(importChangeKind({ source_content_hash: "stary-hash" }, "novy-hash")).toBe("updated");
    expect(importChangeKind({ source_content_hash: "stejny-hash" }, "stejny-hash")).toBe("unchanged");
    expect(preservedPublicationStatus("hidden")).toBe("hidden");
    expect(preservedPublicationStatus("archived")).toBe("archived");
    expect(preservedPublicationStatus("published")).toBe("published");
  });
});
