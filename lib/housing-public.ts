import type { HousingListing, HousingPhoto } from "@/lib/housing-types";
import { legacyProfileIdentity } from "@/lib/profile-types";

const publicStatuses = new Set(["active"]);
const manageableStatuses = new Set(["active", "occupied", "found", "expired", "hidden", "pending_review", "rejected"]);
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;

export function publicHousingListing(row: Record<string, unknown>, photos: Array<Record<string, unknown> & { signedUrl?: string }> = [], includePrivate = false): HousingListing | null {
  const status = String(row.status || "");
  if (!(includePrivate ? manageableStatuses : publicStatuses).has(status)) return null;
  return {
    id: String(row.id), cityId: String(row.city_id), authorId: String(row.author_id), listingType: String(row.listing_type) as HousingListing["listingType"], category: String(row.category) as HousingListing["category"],
    title: String(row.title), locality: String(row.locality), availableFrom: String(row.available_from), stayLength: String(row.stay_length) as HousingListing["stayLength"], shortDescription: String(row.short_description), description: String(row.description),
    priceMonthly: Number(row.price_monthly || 0), utilitiesIncluded: Boolean(row.utilities_included), utilitiesAmount: row.utilities_amount == null ? undefined : Number(row.utilities_amount), depositAmount: row.deposit_amount == null ? undefined : Number(row.deposit_amount),
    availableSpots: row.available_spots == null ? undefined : Number(row.available_spots), currentOccupants: row.current_occupants == null ? undefined : Number(row.current_occupants), furnished: row.furnished == null ? undefined : Boolean(row.furnished), transitAccess: text(row.transit_access),
    features: Array.isArray(row.features) ? row.features.map(String) as HousingListing["features"] : [], wantedPersonCount: row.wanted_person_count == null ? undefined : Number(row.wanted_person_count), lifestylePreferences: Array.isArray(row.lifestyle_preferences) ? row.lifestyle_preferences.map(String) : [],
    status: status as HousingListing["status"], publishedAt: text(row.published_at), expiresAt: String(row.expires_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at || row.created_at), author: legacyProfileIdentity,
    photos: photos.filter((photo) => photo.signedUrl).sort((a,b) => Number(a.sort_order)-Number(b.sort_order)).map((photo) => ({ id: String(photo.id), url: String(photo.signedUrl), width: Number(photo.width), height: Number(photo.height), sortOrder: Number(photo.sort_order) } satisfies HousingPhoto)),
    ...(includePrivate ? { viewCount: Number(row.view_count || 0), contactCount: Number(row.contact_count || 0), moderationFlags: Array.isArray(row.moderation_flags) ? row.moderation_flags.map(String) : [], version: Number(row.version || 1) } : {}),
  };
}

export type HousingFilters = { q?: string; listingType?: string; category?: string; locality?: string; minPrice?: number; maxPrice?: number; utilitiesIncluded?: boolean; availableFrom?: string; stayLength?: string; minSpots?: number; furnished?: boolean; feature?: string[]; sort?: string };
export function filterHousingListings(items: HousingListing[], filters: HousingFilters) {
  const query=(filters.q||"").trim().toLocaleLowerCase("cs"); const locality=(filters.locality||"").trim().toLocaleLowerCase("cs");
  const result=items.filter((item) => (!query || [item.title,item.shortDescription,item.description,item.locality].some((value)=>value.toLocaleLowerCase("cs").includes(query)))
    && (!filters.listingType || item.listingType===filters.listingType) && (!filters.category || item.category===filters.category)
    && (!locality || item.locality.toLocaleLowerCase("cs").includes(locality)) && (filters.minPrice==null || item.priceMonthly>=filters.minPrice) && (filters.maxPrice==null || item.priceMonthly<=filters.maxPrice)
    && (filters.utilitiesIncluded!==true || item.utilitiesIncluded) && (!filters.availableFrom || item.availableFrom<=filters.availableFrom) && (!filters.stayLength || item.stayLength===filters.stayLength)
    && (filters.minSpots==null || (item.availableSpots||0)>=filters.minSpots) && (filters.furnished!==true || item.furnished===true)
    && (!filters.feature?.length || filters.feature.every((value)=>item.features.includes(value as HousingListing["features"][number]))));
  return [...result].sort((a,b)=>filters.sort==="price_asc" ? a.priceMonthly-b.priceMonthly || b.createdAt.localeCompare(a.createdAt) : filters.sort==="price_desc" ? b.priceMonthly-a.priceMonthly || b.createdAt.localeCompare(a.createdAt) : filters.sort==="move_in" ? a.availableFrom.localeCompare(b.availableFrom) : String(b.publishedAt).localeCompare(String(a.publishedAt)));
}
