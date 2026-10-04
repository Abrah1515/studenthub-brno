export type DashboardCommunityEventPreview = { id: string; title: string; startsAt: string; venue: string; category: string };
export type DashboardCommunityPostPreview = { id: string; body: string; category: string; createdAt: string };
export type DashboardMarketplacePreview = { id: string; title: string; shortDescription: string; priceMode: string; priceAmount?: number; priceScope: string; publishedAt: string };
export type DashboardHousingPreview = { id: string; title: string; listingType: string; locality: string; priceMonthly: number; publishedAt: string };
export type DashboardBuddyPreview = { id: string; title: string; activityType: string; approximateLocation: string; startsAt: string };

export type CityDashboardPreviews = {
  communityEvents: DashboardCommunityEventPreview[];
  communityPosts: DashboardCommunityPostPreview[];
  marketplaceListings: DashboardMarketplacePreview[];
  housingListings: DashboardHousingPreview[];
  buddyPosts: DashboardBuddyPreview[];
};

export type CityDashboardPreviewRows = {
  communityEvents: Record<string, unknown>[];
  communityPosts: Record<string, unknown>[];
  marketplaceListings: Record<string, unknown>[];
  housingListings: Record<string, unknown>[];
  buddyPosts: Record<string, unknown>[];
};

export const emptyCityDashboardPreviews = (): CityDashboardPreviews => ({ communityEvents: [], communityPosts: [], marketplaceListings: [], housingListings: [], buddyPosts: [] });

function timestamp(value: unknown) { const result = new Date(String(value || "")).getTime(); return Number.isFinite(result) ? result : 0; }
function cityRows(rows: Record<string, unknown>[], cityId: string) { return rows.filter((row) => String(row.city_id || "") === cityId); }
function newest(rows: Record<string, unknown>[], key: string) { return [...rows].sort((a, b) => timestamp(b[key]) - timestamp(a[key])).slice(0, 3); }

export function buildCityDashboardPreviews(cityId: string, rows: CityDashboardPreviewRows, now = new Date()): CityDashboardPreviews {
  const current = now.getTime();
  const communityEvents = cityRows(rows.communityEvents, cityId)
    .filter((row) => row.status === "published" && timestamp(row.ends_at || row.starts_at) >= current)
    .sort((a, b) => timestamp(a.starts_at) - timestamp(b.starts_at)).slice(0, 3)
    .map((row) => ({ id: String(row.id), title: String(row.title), startsAt: String(row.starts_at), venue: String(row.venue || ""), category: String(row.category || "Ostatní") }));
  const communityPosts = newest(cityRows(rows.communityPosts, cityId).filter((row) => row.status === "active"), "created_at")
    .map((row) => ({ id: String(row.id), body: String(row.body), category: String(row.category || "Ostatní"), createdAt: String(row.created_at) }));
  const marketplaceListings = newest(cityRows(rows.marketplaceListings, cityId).filter((row) => row.status === "active" && (!row.expires_at || timestamp(row.expires_at) > current)), "published_at")
    .map((row) => ({ id: String(row.id), title: String(row.title), shortDescription: String(row.short_description || ""), priceMode: String(row.price_mode || "fixed"), priceAmount: row.price_amount == null ? undefined : Number(row.price_amount), priceScope: String(row.price_scope || "item"), publishedAt: String(row.published_at || row.created_at) }));
  const housingListings = newest(cityRows(rows.housingListings, cityId).filter((row) => row.status === "active" && timestamp(row.expires_at) > current), "published_at")
    .map((row) => ({ id: String(row.id), title: String(row.title), listingType: String(row.listing_type), locality: String(row.locality || ""), priceMonthly: Number(row.price_monthly || 0), publishedAt: String(row.published_at || row.created_at) }));
  const buddyPosts = cityRows(rows.buddyPosts, cityId)
    .filter((row) => row.status === "active" && row.moderation_status === "approved" && timestamp(row.expires_at) >= current)
    .sort((a, b) => timestamp(a.starts_at) - timestamp(b.starts_at)).slice(0, 3)
    .map((row) => ({ id: String(row.id), title: String(row.title), activityType: String(row.activity_type), approximateLocation: String(row.approximate_location || ""), startsAt: String(row.starts_at) }));
  return { communityEvents, communityPosts, marketplaceListings, housingListings, buddyPosts };
}
