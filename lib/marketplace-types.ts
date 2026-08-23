export const marketplaceListingTypes = ["offer", "wanted"] as const;
export const marketplaceCategories = ["textbook", "scripts", "own_notes", "study_materials", "calculator_equipment", "other"] as const;
export const marketplaceFormats = ["printed", "digital", "both"] as const;
export const marketplaceConditions = ["new", "like_new", "used", "worn"] as const;
export const marketplaceStatuses = ["active", "reserved", "sold"] as const;

export type MarketplaceListingType = (typeof marketplaceListingTypes)[number];
export type MarketplaceCategory = (typeof marketplaceCategories)[number];
export type MarketplaceFormat = (typeof marketplaceFormats)[number];
export type MarketplaceCondition = (typeof marketplaceConditions)[number];
export type MarketplacePublicStatus = (typeof marketplaceStatuses)[number];

export type MarketplacePhoto = { id: string; url: string; width: number; height: number; sortOrder: number };

export type MarketplaceListing = {
  id: string;
  cityId: string;
  listingType: MarketplaceListingType;
  category: MarketplaceCategory;
  title: string;
  shortDescription: string;
  description: string;
  priceMode: "fixed" | "free" | "negotiable";
  priceAmount?: number;
  priceScope: "item" | "bundle";
  universityId?: string;
  facultyId?: string;
  studyProgram?: string;
  subjectName?: string;
  subjectCode?: string;
  teacherName?: string;
  recommendedYear?: number;
  semester: "winter" | "summer" | "both" | "not_applicable";
  academicYear?: string;
  materialFormat: MarketplaceFormat;
  itemCondition?: MarketplaceCondition;
  handoffMethod: "in_person" | "shipping" | "digital" | "agreement";
  handoffLocation?: string;
  publicAlias: string;
  status: MarketplacePublicStatus;
  publishedAt: string;
  expiresAt: string;
  renewedAt?: string;
  createdAt: string;
  updatedAt: string;
  photos: MarketplacePhoto[];
};

export const marketplaceLabels = {
  listingType: { offer: "Nabízím", wanted: "Hledám" },
  category: { textbook: "Učebnice", scripts: "Skripta", own_notes: "Vlastní poznámky", study_materials: "Studijní materiály", calculator_equipment: "Kalkulačky a vybavení", other: "Ostatní" },
  format: { printed: "Tištěné", digital: "Digitální", both: "Obojí" },
  condition: { new: "Nové", like_new: "Jako nové", used: "Použité", worn: "Více používané" },
  status: { active: "Aktivní", reserved: "Rezervováno", sold: "Prodáno" },
  semester: { winter: "Zimní", summer: "Letní", both: "Oba semestry", not_applicable: "Neurčeno" },
  handoff: { in_person: "Osobní předání", shipping: "Zaslání", digital: "Digitální předání", agreement: "Dohodou" },
} as const;

export function marketplacePriceLabel(item: Pick<MarketplaceListing, "priceMode" | "priceAmount" | "priceScope">) {
  if (item.priceMode === "free" || item.priceAmount === 0) return "Zdarma";
  if (item.priceMode === "negotiable") return "Dohodou";
  return `${new Intl.NumberFormat("cs-CZ").format(item.priceAmount || 0)} Kč ${item.priceScope === "bundle" ? "za balíček" : "za kus"}`;
}
