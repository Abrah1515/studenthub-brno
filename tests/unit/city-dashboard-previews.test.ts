import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCityDashboardPreviews, type CityDashboardPreviewRows } from "@/lib/city-dashboard-previews";

const now = new Date("2026-10-04T12:00:00+02:00");
const rows: CityDashboardPreviewRows = {
  communityEvents: [
    { id: "p-event", city_id: "praha", title: "Pražská akce", starts_at: "2026-10-05T18:00:00+02:00", venue: "Praha", category: "Kultura", status: "published" },
    { id: "b-event", city_id: "brno", title: "Brněnská akce", starts_at: "2026-10-05T18:00:00+02:00", venue: "Brno", category: "Kultura", status: "published" },
    { id: "old", city_id: "praha", title: "Stará akce", starts_at: "2026-09-01T18:00:00+02:00", venue: "Praha", category: "Kultura", status: "published" },
  ],
  communityPosts: [{ id: "p-post", city_id: "praha", body: "Praha", category: "Dotaz", status: "active", created_at: "2026-10-04T10:00:00Z" }, { id: "o-post", city_id: "olomouc", body: "Olomouc", category: "Dotaz", status: "active", created_at: "2026-10-04T10:00:00Z" }],
  marketplaceListings: [{ id: "p-market", city_id: "praha", title: "Pražská učebnice", short_description: "Popis", price_mode: "fixed", price_amount: 200, price_scope: "item", status: "active", published_at: "2026-10-04T09:00:00Z", expires_at: "2026-11-01T00:00:00Z" }],
  housingListings: [{ id: "p-home", city_id: "praha", title: "Pokoj", listing_type: "offer", locality: "Dejvice", price_monthly: 8000, status: "active", published_at: "2026-10-04T08:00:00Z", expires_at: "2026-11-01T00:00:00Z" }],
  buddyPosts: [{ id: "p-buddy", city_id: "praha", title: "Běh", activity_type: "sport", approximate_location: "Stromovka", starts_at: "2026-10-06T17:00:00+02:00", expires_at: "2026-10-07T05:00:00+02:00", status: "active", moderation_status: "approved" }],
};

describe("městský Přehled", () => {
  it("vrací pouze aktuální obsah požadovaného města", () => {
    const result = buildCityDashboardPreviews("praha", rows, now);
    expect(result.communityEvents.map((item) => item.id)).toEqual(["p-event"]);
    expect(result.communityPosts.map((item) => item.id)).toEqual(["p-post"]);
    expect(result.marketplaceListings.map((item) => item.id)).toEqual(["p-market"]);
    expect(result.housingListings.map((item) => item.id)).toEqual(["p-home"]);
    expect(result.buddyPosts.map((item) => item.id)).toEqual(["p-buddy"]);
  });

  it("pro jiné město nepropustí pražský obsah", () => {
    const result = buildCityDashboardPreviews("olomouc", rows, now);
    expect(result.communityPosts.map((item) => item.id)).toEqual(["o-post"]);
    expect(result.communityEvents).toEqual([]);
    expect(result.marketplaceListings).toEqual([]);
    expect(result.housingListings).toEqual([]);
    expect(result.buddyPosts).toEqual([]);
  });

  it("výchozí cron vybírá splatné zdroje všech měst a explicitní město zachovává rozsah", () => {
    const source = readFileSync("app/api/cron/sync-sources/route.ts", "utf8");
    expect(source).toContain('requestedCity ? { cityId: city.id } : {}');
    expect(source).toContain('city: requestedCity ? city.id : "all"');
  });
});
