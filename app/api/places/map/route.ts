import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { placeFromRow } from "@/lib/public-data";
import { utilityCategoryCodes, utilityResponseLimit } from "@/lib/place-map-layers";

const querySchema = z.object({
  city: z.string().regex(/^[a-z0-9-]{2,40}$/).default("brno"),
  south: z.coerce.number().min(-90).max(90),
  west: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  categories: z.string().transform((value) => [...new Set(value.split(","))]).pipe(z.array(z.enum(utilityCategoryCodes)).min(1).max(3)),
});

const columns = "id,name,category,description,address,latitude,longitude,opening_hours,website_url,updated_at,university_id,faculty_id,city_id,source_url,last_verified_at,verification_status,osm_id,why_visit,price_level,student_discount,opening_hours_verified_at,access_conditions,source_sync_status,source_checked_at,origin,study_suitable,wifi_available,outlets_available,accessibility,public_access,student_only,source_license";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ items: [], truncated: false, unavailable: true });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || parsed.data.south >= parsed.data.north || parsed.data.west >= parsed.data.east) {
    return NextResponse.json({ message: "Neplatný výřez mapy." }, { status: 422 });
  }
  const { city, south, west, north, east, categories } = parsed.data;
  const { data, error, count } = await createServiceClient().from("places")
    .select(columns, { count: "exact" })
    .eq("city_id", city).eq("status", "approved").eq("is_demo", false).eq("verification_status", "verified")
    .in("category", categories)
    .gte("latitude", south).lte("latitude", north).gte("longitude", west).lte("longitude", east)
    .order("id").limit(utilityResponseLimit);
  if (error) return NextResponse.json({ message: "Vybavení v tomto výřezu nelze načíst." }, { status: 503 });
  return NextResponse.json({
    items: (data || []).map((row) => placeFromRow(row as Record<string, unknown>)),
    truncated: Number(count || 0) > (data || []).length,
    total: Number(count || 0),
    limit: utilityResponseLimit,
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
