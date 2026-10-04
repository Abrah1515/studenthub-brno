import "server-only";

import { buildCityDashboardPreviews, emptyCityDashboardPreviews, type CityDashboardPreviewRows } from "@/lib/city-dashboard-previews";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export async function getCityDashboardPreviews(cityId: string) {
  if (!isSupabaseConfigured()) return emptyCityDashboardPreviews();
  const client = createServiceClient();
  const [events, posts, marketplace, housing, buddy] = await Promise.all([
    client.from("community_events").select("id,city_id,title,starts_at,ends_at,venue,category,status").eq("city_id", cityId).eq("status", "published").order("starts_at").limit(12),
    client.from("community_posts").select("id,city_id,body,category,status,created_at").eq("city_id", cityId).eq("status", "active").order("created_at", { ascending: false }).limit(12),
    client.from("marketplace_listings").select("id,city_id,title,short_description,price_mode,price_amount,price_scope,status,published_at,created_at,expires_at").eq("city_id", cityId).eq("status", "active").order("published_at", { ascending: false }).limit(12),
    client.from("housing_listings").select("id,city_id,title,listing_type,locality,price_monthly,status,published_at,created_at,expires_at").eq("city_id", cityId).eq("status", "active").order("published_at", { ascending: false }).limit(12),
    client.from("buddy_posts").select("id,city_id,title,activity_type,approximate_location,starts_at,expires_at,status,moderation_status").eq("city_id", cityId).eq("status", "active").eq("moderation_status", "approved").order("starts_at").limit(12),
  ]);
  const named = { communityEvents: events, communityPosts: posts, marketplaceListings: marketplace, housingListings: housing, buddyPosts: buddy };
  for (const [source, result] of Object.entries(named)) if (result.error) console.warn("dashboard_preview_query_failed", { source, code: result.error.code });
  const rows = Object.fromEntries(Object.entries(named).map(([key, result]) => [key, (result.data || []) as Record<string, unknown>[]])) as CityDashboardPreviewRows;
  return buildCityDashboardPreviews(cityId, rows);
}
