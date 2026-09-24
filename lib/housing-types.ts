import type { PublicProfileIdentity } from "@/lib/profile-types";

export const housingListingTypes = ["offer", "wanted"] as const;
export const housingCategories = ["private_room", "shared_room", "apartment", "dormitory", "roommate", "other"] as const;
export const housingStayLengths = ["under_3_months", "3_6_months", "6_12_months", "over_year", "indefinite", "agreement"] as const;
export const housingFeatures = ["internet", "washer", "balcony", "cellar", "elevator", "accessible", "pets", "smoking"] as const;
export const housingLifestylePreferences = ["non_smoking", "smoking_ok", "pets_ok", "no_pets", "quiet_home", "social_home"] as const;
export const housingReportReasons = ["fake", "fraud", "outdated", "discrimination", "public_contact", "inappropriate_photo", "harassment", "other"] as const;
export const housingPublicStatuses = ["active", "occupied", "found", "archived", "expired", "hidden", "pending_review", "rejected"] as const;

export type HousingListingType = (typeof housingListingTypes)[number];
export type HousingCategory = (typeof housingCategories)[number];
export type HousingStayLength = (typeof housingStayLengths)[number];
export type HousingFeature = (typeof housingFeatures)[number];
export type HousingPublicStatus = (typeof housingPublicStatuses)[number];
export type HousingPhoto = { id: string; url: string; width: number; height: number; sortOrder: number };

export type HousingListing = {
  id: string; cityId: string; authorId: string; listingType: HousingListingType; category: HousingCategory; title: string; locality: string;
  availableFrom: string; stayLength: HousingStayLength; shortDescription: string; description: string; priceMonthly: number; utilitiesIncluded: boolean;
  utilitiesAmount?: number; depositAmount?: number; availableSpots?: number; currentOccupants?: number; furnished?: boolean; transitAccess?: string;
  features: HousingFeature[]; wantedPersonCount?: number; lifestylePreferences: string[]; status: HousingPublicStatus; publishedAt?: string; expiresAt: string;
  createdAt: string; updatedAt: string; photos: HousingPhoto[]; author: PublicProfileIdentity; owned?: boolean; chatAvailable?: boolean;
  viewCount?: number; contactCount?: number; moderationFlags?: string[]; version?: number;
  moderationReason?: string; publicationMode?: "automatic" | "manual"; hiddenByAdmin?: boolean;
};

export const housingLabels = {
  type: { offer: "Nabízím bydlení", wanted: "Hledám bydlení" },
  category: { private_room: "Samostatný pokoj", shared_room: "Sdílený pokoj nebo lůžko", apartment: "Celý byt", dormitory: "Místo na koleji", roommate: "Hledáme spolubydlícího", other: "Jiné studentské bydlení" },
  stay: { under_3_months: "Méně než 3 měsíce", "3_6_months": "3–6 měsíců", "6_12_months": "6–12 měsíců", over_year: "Déle než rok", indefinite: "Dlouhodobě", agreement: "Dohodou" },
  feature: { internet: "Internet", washer: "Pračka", balcony: "Balkon", cellar: "Sklep", elevator: "Výtah", accessible: "Bezbariérové", pets: "Zvířata povolena", smoking: "Kouření povoleno" },
  lifestyle: { non_smoking: "Nekuřácká domácnost", smoking_ok: "Kouření nevadí", pets_ok: "Zvířata nevadí", no_pets: "Bez zvířat", quiet_home: "Klidnější domácnost", social_home: "Společenská domácnost" },
  status: { active: "Aktivní", occupied: "Obsazeno", found: "Nalezeno", archived: "Archivováno", expired: "Vypršelo", hidden: "Skryté", pending_review: "Čeká na kontrolu", rejected: "Zamítnuto" },
} as const;

export function housingPriceLabel(item: Pick<HousingListing, "priceMonthly" | "utilitiesIncluded" | "utilitiesAmount">) {
  const base = `${new Intl.NumberFormat("cs-CZ").format(item.priceMonthly)} Kč / měsíc`;
  if (item.utilitiesIncluded) return `${base} včetně energií`;
  return item.utilitiesAmount ? `${base} + ${new Intl.NumberFormat("cs-CZ").format(item.utilitiesAmount)} Kč energie` : `${base} + energie`;
}
