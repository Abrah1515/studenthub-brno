import type { MarketplaceListing, MarketplacePhoto } from "@/lib/marketplace-types";

const publicStatuses = new Set(["active", "reserved", "sold"]);

function optionalText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }

export function publicMarketplaceListing(row: Record<string, unknown>, photos: Array<Record<string, unknown> & { signedUrl?: string }> = []): MarketplaceListing | null {
  const status = String(row.status || "");
  if (!publicStatuses.has(status)) return null;
  return {
    id: String(row.id), cityId: String(row.city_id), listingType: String(row.listing_type) as MarketplaceListing["listingType"], category: String(row.category) as MarketplaceListing["category"],
    title: String(row.title), shortDescription: String(row.short_description), description: String(row.description), priceMode: String(row.price_mode) as MarketplaceListing["priceMode"],
    priceAmount: row.price_amount == null ? undefined : Number(row.price_amount), priceScope: String(row.price_scope) as MarketplaceListing["priceScope"],
    universityId: optionalText(row.university_id), facultyId: optionalText(row.faculty_id), studyProgram: optionalText(row.study_program), subjectName: optionalText(row.subject_name),
    subjectCode: optionalText(row.subject_code), teacherName: optionalText(row.teacher_name), recommendedYear: row.recommended_year == null ? undefined : Number(row.recommended_year),
    semester: String(row.semester) as MarketplaceListing["semester"], academicYear: optionalText(row.academic_year), materialFormat: String(row.material_format) as MarketplaceListing["materialFormat"],
    itemCondition: optionalText(row.item_condition) as MarketplaceListing["itemCondition"], handoffMethod: String(row.handoff_method) as MarketplaceListing["handoffMethod"],
    handoffLocation: optionalText(row.handoff_location), publicAlias: String(row.public_alias), status: status as MarketplaceListing["status"], publishedAt: String(row.published_at),
    expiresAt: String(row.expires_at), renewedAt: optionalText(row.renewed_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at || row.created_at),
    photos: photos.filter((photo) => photo.signedUrl).sort((a, b) => Number(a.sort_order) - Number(b.sort_order)).map((photo) => ({ id: String(photo.id), url: String(photo.signedUrl), width: Number(photo.width), height: Number(photo.height), sortOrder: Number(photo.sort_order) } satisfies MarketplacePhoto)),
  };
}

export type MarketplaceFilters = { q?: string; listingType?: string; category?: string; university?: string; faculty?: string; subject?: string; teacher?: string; year?: number; format?: string; condition?: string; status?: string; minPrice?: number; maxPrice?: number; location?: string; sort?: string };

export function filterMarketplaceListings(items: MarketplaceListing[], filters: MarketplaceFilters, preference?: { universityId?: string | null; facultyId?: string | null }) {
  const query = (filters.q || "").trim().toLocaleLowerCase("cs"); const subject = (filters.subject || "").trim().toLocaleLowerCase("cs"); const teacher = (filters.teacher || "").trim().toLocaleLowerCase("cs"); const location = (filters.location || "").trim().toLocaleLowerCase("cs");
  const filtered = items.filter((item) => {
    const price = item.priceAmount ?? 0;
    return (!query || [item.title, item.shortDescription, item.description, item.subjectName, item.subjectCode].some((value) => value?.toLocaleLowerCase("cs").includes(query)))
      && (!filters.listingType || item.listingType === filters.listingType) && (!filters.category || item.category === filters.category)
      && (!filters.university || item.universityId === filters.university) && (!filters.faculty || item.facultyId === filters.faculty)
      && (!subject || item.subjectName?.toLocaleLowerCase("cs").includes(subject) || item.subjectCode?.toLocaleLowerCase("cs").includes(subject))
      && (!teacher || item.teacherName?.toLocaleLowerCase("cs").includes(teacher)) && (!filters.year || item.recommendedYear === filters.year)
      && (!filters.format || item.materialFormat === filters.format) && (!filters.condition || item.itemCondition === filters.condition) && (!filters.status || item.status === filters.status)
      && (filters.minPrice == null || price >= filters.minPrice) && (filters.maxPrice == null || price <= filters.maxPrice)
      && (!location || item.handoffLocation?.toLocaleLowerCase("cs").includes(location));
  });
  const relevance = (item: MarketplaceListing) => Number(Boolean(preference?.facultyId && item.facultyId === preference.facultyId)) * 4 + Number(Boolean(preference?.universityId && item.universityId === preference.universityId)) * 2;
  return [...filtered].sort((a, b) => {
    if (filters.sort === "cheapest") return (a.priceAmount ?? 0) - (b.priceAmount ?? 0) || b.publishedAt.localeCompare(a.publishedAt);
    if (filters.sort === "expensive") return (b.priceAmount ?? 0) - (a.priceAmount ?? 0) || b.publishedAt.localeCompare(a.publishedAt);
    if (filters.sort === "free") return Number(b.priceMode === "free") - Number(a.priceMode === "free") || b.publishedAt.localeCompare(a.publishedAt);
    if (filters.sort === "relevant") return relevance(b) - relevance(a) || b.publishedAt.localeCompare(a.publishedAt);
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}
