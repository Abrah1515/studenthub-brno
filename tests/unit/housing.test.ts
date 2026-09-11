import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { filterHousingListings, publicHousingListing } from "@/lib/housing-public";
import { housingListingSchema, housingReportSchema } from "@/lib/housing-schemas";
import { housingDuplicateFingerprint, housingModerationFlags } from "@/lib/housing-server";
import { housingPriceLabel, type HousingListing } from "@/lib/housing-types";
import { legacyProfileIdentity } from "@/lib/profile-types";

const baseForm = {
  listingType: "offer",
  category: "private_room",
  title: "Samostatný pokoj v Králově Poli",
  locality: "Královo Pole",
  availableFrom: "2026-10-01",
  stayLength: "6_12_months",
  shortDescription: "Světlý pokoj v klidném studentském bytě blízko MHD.",
  description: "Nabízím samostatný vybavený pokoj v klidném studentském bytě s dobrou dostupností do centra Brna.",
  priceMonthly: 7500,
  utilitiesIncluded: false,
  utilitiesAmount: 1400,
  depositAmount: 7500,
  availableSpots: 1,
  currentOccupants: 2,
  furnished: true,
  transitAccess: "Tramvaj 1 přibližně pět minut pěšky",
  features: ["internet", "washer"],
  lifestylePreferences: [],
  cityId: "brno",
  company: "",
} as const;

function listing(overrides: Partial<HousingListing> = {}): HousingListing {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    cityId: "brno",
    authorId: "21111111-1111-4111-8111-111111111111",
    listingType: "offer",
    category: "private_room",
    title: "Samostatný pokoj v Králově Poli",
    locality: "Královo Pole",
    availableFrom: "2026-10-01",
    stayLength: "6_12_months",
    shortDescription: "Světlý pokoj v klidném studentském bytě.",
    description: "Bezpečný veřejný popis nabídky bez přesné adresy a kontaktu.",
    priceMonthly: 7500,
    utilitiesIncluded: false,
    utilitiesAmount: 1400,
    depositAmount: 7500,
    availableSpots: 1,
    currentOccupants: 2,
    furnished: true,
    features: ["internet", "washer"],
    lifestylePreferences: [],
    status: "active",
    publishedAt: "2026-09-11T10:00:00Z",
    expiresAt: "2026-10-11T10:00:00Z",
    createdAt: "2026-09-11T10:00:00Z",
    updatedAt: "2026-09-11T10:00:00Z",
    photos: [],
    author: legacyProfileIdentity,
    ...overrides,
  };
}

describe("Bydlení – validace a veřejné soukromí", () => {
  it("validuje nabídku a odlišné povinné údaje poptávky", () => {
    expect(housingListingSchema.safeParse(baseForm).success).toBe(true);
    expect(housingListingSchema.safeParse({ ...baseForm, listingType: "offer", availableSpots: undefined }).success).toBe(false);
    expect(housingListingSchema.safeParse({ ...baseForm, listingType: "wanted", availableSpots: undefined, wantedPersonCount: 2 }).success).toBe(true);
    expect(housingListingSchema.safeParse({ ...baseForm, listingType: "wanted", availableSpots: undefined, wantedPersonCount: undefined }).success).toBe(false);
    expect(housingListingSchema.safeParse({ ...baseForm, cityId: "praha" }).success).toBe(false);
    expect(housingListingSchema.safeParse({ ...baseForm, company: "spam" }).success).toBe(false);
  });

  it("veřejná projekce nepropustí přesnou adresu, kontakt ani moderaci", () => {
    const item = publicHousingListing({
      id: listing().id, city_id: "brno", author_id: listing().authorId, listing_type: "offer", category: "private_room",
      title: listing().title, locality: "Královo Pole", exact_address: "Soukromá 12", available_from: "2026-10-01", stay_length: "6_12_months",
      short_description: listing().shortDescription, description: listing().description, price_monthly: 7500, utilities_included: false, utilities_amount: 1400,
      features: [], lifestyle_preferences: [], status: "active", published_at: listing().publishedAt, expires_at: listing().expiresAt,
      created_at: listing().createdAt, updated_at: listing().updatedAt, email: "private@example.cz", phone: "+420123456789", moderation_note: "interní",
    });
    const serialized = JSON.stringify(item);
    expect(item).not.toBeNull();
    expect(serialized).not.toMatch(/Soukromá 12|private@example|123456789|moderation_note|interní/);
  });

  it("nepublikuje neveřejný stav a přijímá jen povolené důvody hlášení", () => {
    expect(publicHousingListing({ status: "pending_review" })).toBeNull();
    expect(housingReportSchema.safeParse({ reason: "fraud", detail: "Požadovaná platba bez prohlídky.", company: "" }).success).toBe(true);
    expect(housingReportSchema.safeParse({ reason: "libovolny", detail: "", company: "" }).success).toBe(false);
  });
});

describe("Bydlení – filtry, řazení a moderace", () => {
  it("filtruje sdílitelnými parametry a řadí cenu i nastěhování", () => {
    const items = [
      listing(),
      listing({ id: "31111111-1111-4111-8111-111111111111", listingType: "wanted", category: "apartment", locality: "Bohunice", priceMonthly: 11000, availableFrom: "2026-09-20", furnished: false, features: [] }),
    ];
    expect(filterHousingListings(items, { listingType: "offer", locality: "královo", maxPrice: 8000, furnished: true, feature: ["internet"] })).toHaveLength(1);
    expect(filterHousingListings(items, { listingType: "wanted" })[0].locality).toBe("Bohunice");
    expect(filterHousingListings(items, { sort: "price_desc" })[0].priceMonthly).toBe(11000);
    expect(filterHousingListings(items, { sort: "move_in" })[0].availableFrom).toBe("2026-09-20");
  });

  it("detekuje kontakty, odkazy, zálohu předem, diskriminaci a neobvyklou kauci", () => {
    expect(housingModerationFlags({ title: "Pokoj", shortDescription: "Pište na test@example.cz", description: "Pošli kauci předem bez prohlídky na https://example.cz", priceMonthly: 5000, depositAmount: 120000 })).toEqual(expect.arrayContaining(["external_link", "public_contact", "advance_payment", "unusual_deposit"]));
    expect(housingModerationFlags({ title: "Pokoj", shortDescription: "Jen ženy", description: "Pouze ženy mohou reagovat na tuto nabídku.", priceMonthly: 5000 })).toContain("discrimination");
    expect(housingDuplicateFingerprint({ title: "Žluťoučký pokoj", locality: "Žabovřesky", description: "Dlouhý popis" })).toBe(housingDuplicateFingerprint({ title: "Zlutoucky pokoj", locality: "Zabovresky", description: "Dlouhý popis" }));
  });

  it("formátuje energie jednoznačně", () => {
    expect(housingPriceLabel(listing({ utilitiesIncluded: true }))).toContain("včetně energií");
    expect(housingPriceLabel(listing({ utilitiesIncluded: false, utilitiesAmount: 1400 }))).toContain("+ 1 400 Kč energie");
  });
});

describe("Bydlení – databázové a serverové bezpečnostní kontrakty", () => {
  it("má oddělený model, soukromý bucket, RLS, audit, expiraci a chat kontext", () => {
    const sql = readFileSync("supabase/migrations/202609110037_student_housing.sql", "utf8");
    for (const table of ["housing_listings", "housing_photos", "housing_reports", "housing_history", "housing_moderation_actions", "housing_daily_stats", "housing_rate_limits", "housing_maintenance_runs"]) expect(sql).toContain(`public.${table}`);
    expect(sql).toContain("public=false");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("expire_housing_listings");
    expect(sql).toContain("housing_listing");
    expect(sql).not.toMatch(/insert into public\.marketplace/i);
  });

  it("API odvozuje autora ze session a při selhání limitu nepředstírá 429", () => {
    const route = readFileSync("app/api/housing/listings/route.ts", "utf8");
    expect(route).toContain("author_id:account.id");
    expect(route).not.toMatch(/author_id:parsed/i);
    expect(route).toMatch(/status==="error"[\s\S]+status:503/);
    expect(route).toMatch(/status==="limited"[\s\S]+status:429/);
    expect(route).toContain("pending_review");
  });
});
