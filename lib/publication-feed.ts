import "server-only";
import { getPublishedCity } from "@/lib/city-data";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";

export type PromotionCandidate = { eventId: number; contentType: "academic_event" | "place" | "offer" | "job"; contentId: string; cityId: string; title: string; sourceUrl: string; occurredAt: string };
const tableFor = { academic_event: "academic_events", place: "places", offer: "offers", job: "jobs" } as const;

/** Interní read-only rozhraní. Nevrací kontakty, formuláře, profilová data ani volný JSON. */
export async function getPromotionCandidates(citySlug: string, limit = 25): Promise<PromotionCandidate[]> {
  const city = await getPublishedCity(citySlug); if (!city || !isSupabaseConfigured()) return [];
  const client = createServiceClient();
  const { data: events, error } = await client.from("content_publication_events").select("id,content_type,content_id,city_id,university_id,occurred_at,source_url").eq("verified", true).eq("promotable", true).is("processed_at", null).eq("city_id", city.id).order("occurred_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw error;
  const result: PromotionCandidate[] = [];
  for (const event of events || []) {
    const contentType = event.content_type as keyof typeof tableFor; const table = tableFor[contentType]; if (!table) continue;
    const columns = contentType === "place" ? "id,name,status,verification_status,is_demo,source_url" : contentType === "offer" ? "id,title,status,verification_status,is_demo,source_url,valid_to" : contentType === "job" ? "id,title,status,verification_status,is_demo,source_url,expires_at" : "id,title,status,verification_status,is_demo,source_url,is_cancelled";
    let query = client.from(table).select(columns).eq("id", event.content_id).eq("status", "approved").eq("verification_status", "verified").eq("is_demo", false);
    if (contentType === "academic_event") query = query.eq("is_cancelled", false);
    const { data } = await query.maybeSingle(); const entity = data as Record<string, unknown> | null; if (!entity) continue;
    const expiry = entity.valid_to || entity.expires_at; if (expiry && new Date(String(expiry)).getTime() < Date.now()) continue;
    const sourceUrl = String(entity.source_url || event.source_url || ""); if (!sourceUrl.startsWith("https://")) continue;
    result.push({ eventId: Number(event.id), contentType, contentId: String(event.content_id), cityId: city.id, title: String(entity.title || entity.name), sourceUrl, occurredAt: String(event.occurred_at) });
  }
  return result;
}
