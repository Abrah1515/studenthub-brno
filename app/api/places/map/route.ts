import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient, isSupabaseConfigured } from "@/lib/supabase-server";
import { placeCategoryCodes } from "@/lib/place-community";
import { placeFromRow } from "@/lib/public-data";
import { utilityResponseLimit } from "@/lib/place-map-layers";

const querySchema = z.object({
  city: z.string().regex(/^[a-z0-9-]{2,40}$/).default("brno"),
  south: z.coerce.number().min(-90).max(90),
  west: z.coerce.number().min(-180).max(180),
  north: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  zoom: z.coerce.number().min(1).max(22).optional(),
  categories: z.string().transform((value) => [...new Set(value.split(","))]).pipe(z.array(z.enum(placeCategoryCodes)).min(1).max(placeCategoryCodes.length)),
  subcategory: z.string().regex(/^[a-z0-9_-]{1,80}$/).optional(),
  university: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  faculty: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
  limit: z.coerce.number().int().min(1).max(utilityResponseLimit).default(utilityResponseLimit),
});

const columns = "id,name,category,subcategory,description,address,latitude,longitude,opening_hours,opening_exceptions,website_url,reservation_url,updated_at,university_id,faculty_id,city_id,source_url,last_verified_at,verification_status,osm_id,why_visit,price_level,student_discount,opening_hours_verified_at,access_conditions,access_type,isic_required,library_card_required,registration_required,source_sync_status,source_checked_at,origin,study_suitable,study_mode,wifi_available,eduroam_available,outlets_available,computers_available,printing_available,copying_available,scanning_available,reservable,evening_access,nonstop_access,temporary_status,accessibility,public_access,student_only,source_license";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ items: [], truncated: false, unavailable: true });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || parsed.data.south >= parsed.data.north || parsed.data.west >= parsed.data.east) {
    return NextResponse.json({ message: "Neplatný výřez mapy." }, { status: 422 });
  }
  const { city, south, west, north, east, categories, subcategory, university, faculty, limit } = parsed.data;
  let query = createServiceClient().from("places")
    .select(columns, { count: "exact" })
    .eq("city_id", city).eq("status", "approved").eq("is_demo", false).eq("verification_status", "verified")
    .in("category", categories)
    .gte("latitude", south).lte("latitude", north).gte("longitude", west).lte("longitude", east)
    .order("id").limit(limit);
  if (subcategory) query = query.eq("subcategory", subcategory);
  if (university) query = query.eq("university_id", university);
  if (faculty) query = query.eq("faculty_id", faculty);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ message: "Vybavení v tomto výřezu nelze načíst." }, { status: 503 });
  return NextResponse.json({
    items: (data || []).map((row) => placeFromRow(row as Record<string, unknown>)),
    truncated: Number(count || 0) > (data || []).length,
    total: Number(count || 0),
    limit,
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
