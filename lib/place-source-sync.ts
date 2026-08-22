import "server-only";
import { listRecords, updateRecord } from "@/lib/data-store";
import { fetchRegisteredSource } from "@/lib/sources/fetch-source";
import type { ContentSource } from "@/lib/sources/types";
import { foldSearchText } from "@/lib/search";

type StructuredPlace = { name?: string; openingHours?: string; address?: string };

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  return [row, ...flattenJsonLd(row["@graph"]), ...flattenJsonLd(row.itemListElement)];
}

function formatAddress(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  return [row.streetAddress, row.postalCode, row.addressLocality].filter(Boolean).map(String).join(", ") || undefined;
}

function formatHours(value: Record<string, unknown>) {
  if (typeof value.openingHours === "string") return value.openingHours.trim();
  if (Array.isArray(value.openingHours)) return value.openingHours.map(String).join("; ");
  const specs = Array.isArray(value.openingHoursSpecification) ? value.openingHoursSpecification : value.openingHoursSpecification ? [value.openingHoursSpecification] : [];
  const lines = specs.flatMap((spec) => {
    if (!spec || typeof spec !== "object") return [];
    const row = spec as Record<string, unknown>; const days = Array.isArray(row.dayOfWeek) ? row.dayOfWeek : row.dayOfWeek ? [row.dayOfWeek] : [];
    const labels = days.map((day) => String(day).split("/").pop()).join(", ");
    return row.opens && row.closes ? [`${labels} ${String(row.opens)}–${String(row.closes)}`.trim()] : [];
  });
  return lines.length ? lines.join("; ") : undefined;
}

export function extractStructuredPlace(html: string, expectedName: string): StructuredPlace | null {
  const candidates: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { candidates.push(...flattenJsonLd(JSON.parse(match[1]))); } catch { /* Poškozený blok se nepoužije. */ }
  }
  const expected = foldSearchText(expectedName); const row = candidates.find((item) => {
    const type = Array.isArray(item["@type"]) ? item["@type"].map(String).join(" ") : String(item["@type"] || "");
    const name = foldSearchText(String(item.name || ""));
    return /library|food|restaurant|organization|place|localbusiness|sportsactivitylocation/i.test(type) && (name.includes(expected) || expected.includes(name));
  });
  if (!row) return null;
  return { name: typeof row.name === "string" ? row.name.trim() : undefined, openingHours: formatHours(row), address: formatAddress(row.address) };
}

function sourceFor(row: Record<string, unknown>, sourceUrl: string): ContentSource {
  const url = new URL(sourceUrl);
  return { id: `place-${String(row.id)}`, cityId: String(row.city_id || "brno"), universityId: String(row.university_id || "city"), facultyId: String(row.faculty_id || "city"), sourceType: "academic_calendar", sourceUrl: url.href, officialDomain: url.hostname, format: "html", parserKey: "place-structured-data", enabled: true, refreshIntervalHours: 9, monitoringMode: "automatic_review", termsNote: "Pouze veřejná oficiální stránka provozovatele; změny se před publikací kontrolují.", academicYear: null, confidence: .9, requiresReview: true, notes: "Monitor dostupnosti a strukturovaných veřejných údajů." };
}

export async function syncDuePlaceSources(cityId: string, batchSize = 6) {
  const dueBefore = Date.now() - 9 * 60 * 60 * 1000;
  const rows = (await listRecords("places")).filter((row) => row.city_id === cityId && row.status === "approved" && !row.is_demo && row.source_url && (!row.source_checked_at || new Date(String(row.source_checked_at)).getTime() <= dueBefore)).sort((a, b) => String(a.source_checked_at || "").localeCompare(String(b.source_checked_at || ""))).slice(0, batchSize);
  const results = [];
  for (const row of rows) {
    const checkedAt = new Date().toISOString();
    try {
      const fetched = await fetchRegisteredSource(sourceFor(row, String(row.source_url)));
      const contentType = fetched.contentType.toLowerCase();
      let proposed: StructuredPlace | null = null;
      if (contentType.includes("text/html")) {
        const html = new TextDecoder().decode(fetched.body); const visible = foldSearchText(html.replace(/<[^>]+>/g, " "));
        if (!visible.includes(foldSearchText(String(row.name)))) throw new Error("Oficiální stránka už neobsahuje očekávaný název místa.");
        proposed = extractStructuredPlace(html, String(row.name));
      }
      const openingChanged = Boolean(proposed?.openingHours && foldSearchText(proposed.openingHours) !== foldSearchText(String(row.opening_hours || "")));
      const addressChanged = Boolean(proposed?.address && foldSearchText(proposed.address) !== foldSearchText(String(row.address || "")));
      await updateRecord("places", String(row.id), { source_checked_at: checkedAt, source_final_url: fetched.finalUrl, source_content_type: fetched.contentType, source_miss_count: 0, source_sync_status: openingChanged || addressChanged ? "needs_review" : row.source_sync_status === "needs_review" && row.proposed_source_data ? "needs_review" : "verified", proposed_source_data: openingChanged || addressChanged ? proposed : row.proposed_source_data || null });
      results.push({ id: row.id, status: openingChanged || addressChanged ? "needs_review" : "verified", finalUrl: fetched.finalUrl, contentType: fetched.contentType });
    } catch (error) {
      const misses = Number(row.source_miss_count || 0) + 1;
      await updateRecord("places", String(row.id), { source_checked_at: checkedAt, source_miss_count: misses, source_sync_status: misses >= 3 ? "unavailable" : row.source_sync_status || "needs_review" });
      results.push({ id: row.id, status: "failed", message: error instanceof Error ? error.message : "Kontrola zdroje selhala." });
    }
  }
  return results;
}
